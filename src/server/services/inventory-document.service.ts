import { logAudit, type AuditContext } from '@/lib/audit';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { transactionDirection } from '@/lib/inventory-transactions';
import {
  insufficientStockMessage,
  PRODUCT_NOT_FOUND_MESSAGE,
} from '@/modules/inventory/constants';
import type { CreateInventoryDocumentValues } from '@/modules/inventory/schemas/inventory-document.schema';
import type { InventoryDocumentDetail } from '@/modules/inventory/types/inventory-document.types';
import { db } from '@/server/db';
import type { users } from '@/server/db/schema';
import * as inventoryDocumentRepository from '@/server/repositories/inventory-document.repository';
import * as productRepository from '@/server/repositories/product.repository';

type User = typeof users.$inferSelect;

// El actor llega resuelto desde el handler (`authorize()`): el servicio decide reglas de
// negocio, no vuelve a mirar la sesión.
type Command = { actor: User; context: AuditContext };

// Este service existe porque la operación cruza tres repositorios —`product`,
// `inventory-document` y `audit-log`— y tiene reglas propias: existencia del producto,
// stock suficiente y orden de bloqueo. Es la frontera que marca `docs/SETUP.md` §3 y la
// misma razón por la que los pagos de nómina tienen service y el alta de empleados no
// (spec 020, D-12).
export async function createDocument(
  command: Command & { input: CreateInventoryDocumentValues },
): Promise<InventoryDocumentDetail> {
  const { actor, context, input } = command;

  // La dirección la deriva el servidor del catálogo; el cliente nunca la envía (AC15).
  const direction = transactionDirection(input.transaccionId);
  const sign = direction === 'ingreso' ? 1 : -1;

  // Ordenadas por `productId` (D-18): dos documentos simultáneos que tocan los mismos
  // productos en orden inverso se bloquearían mutuamente hasta que Postgres matase a uno
  // por deadlock. Un criterio total y estable hace que todas las transacciones tomen los
  // bloqueos en la misma secuencia. Se ordena la aplicación, no la respuesta.
  const orderedItems = [...input.items].sort((a, b) => a.productId.localeCompare(b.productId));

  return db.transaction(async (tx) => {
    // Con el `tx` y no con el `db` global: la existencia del producto y el nombre con el
    // que se redacta el 409 tienen que mirar el mismo estado que los UPDATE de abajo.
    const found = await productRepository.findManyByIds(
      orderedItems.map((item) => item.productId),
      tx,
    );
    const productById = new Map(found.map((product) => [product.id, product]));

    // 404 y no 500 por violación de clave foránea (AC10). Se comprueban todas las líneas
    // antes de tocar nada: un documento con un producto inexistente no debe mover los
    // otros, aunque la transacción fuese a revertir igualmente.
    if (orderedItems.some((item) => !productById.has(item.productId))) {
      throw new NotFoundError(PRODUCT_NOT_FOUND_MESSAGE);
    }

    const movements: { productId: string; quantity: number; stockAfter: number }[] = [];

    for (const item of orderedItems) {
      const product = productById.get(item.productId);
      if (!product) throw new NotFoundError(PRODUCT_NOT_FOUND_MESSAGE);

      const applied = await productRepository.applyStockChange(tx, {
        productId: item.productId,
        delta: sign * item.quantity,
      });

      // `null` en una salida significa que el guard `stock >= qty` del WHERE no dejó
      // pasar el UPDATE: 409 y la transacción entera revierte, así que las líneas ya
      // aplicadas tampoco quedan (D-8, AC5, AC6). El stock del mensaje es el leído en
      // esta misma transacción.
      if (!applied) {
        throw new ConflictError(
          insufficientStockMessage(product.name, product.stock, item.quantity),
          // El id viaja en el cuerpo del 409 para que el formulario marque la línea
          // culpable sin buscar el nombre del producto dentro del mensaje: dos productos
          // donde uno sea prefijo del otro señalarían la línea equivocada.
          { productId: item.productId },
        );
      }

      movements.push({
        productId: item.productId,
        quantity: item.quantity,
        // Tal cual lo devolvió el RETURNING del UPDATE: no se recalcula (D-11).
        stockAfter: applied.stock,
      });
    }

    const { id, docNumber } = await inventoryDocumentRepository.insertDocument(tx, {
      transaccionId: input.transaccionId,
      docDate: input.docDate,
      reference: input.reference ?? null,
      createdById: actor.id,
    });

    await inventoryDocumentRepository.insertMovements(
      tx,
      movements.map((movement) => ({ ...movement, documentId: id })),
    );

    await logAudit(tx, {
      actorId: actor.id,
      action: 'inventory_document.created',
      entityType: 'inventory_document',
      entityId: id,
      // `info` y no `warning` como nómina: aquí la fuente de verdad del detalle es
      // `stock_movements`, que es permanente, no el log que se purga a los 180 días.
      severity: 'info',
      // Se registra el documento, no las cantidades por producto (D-19): duplicar el
      // detalle aquí sería la copia que caduca.
      changes: {
        before: null,
        after: {
          docNumber,
          transaccionId: input.transaccionId,
          docDate: input.docDate,
          itemCount: movements.length,
        },
      },
      metadata: { direction },
      context,
    });

    const document = await inventoryDocumentRepository.findById(id, tx);
    // Imposible en la práctica —acaba de insertarse dentro de esta misma transacción—,
    // pero el tipo no lo sabe y tragarse el caso con un `as` escondería un fallo real.
    if (!document) throw new Error('El documento recién insertado no se pudo releer.');

    return document;
  });
}
