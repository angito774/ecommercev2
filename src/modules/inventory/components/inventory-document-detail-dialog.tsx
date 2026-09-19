'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDayKey } from '@/lib/utils';

import { useInventoryDocument } from '../hooks/use-inventory-documents';

import { TransactionDirectionBadge } from './transaction-direction-badge';

type InventoryDocumentDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` mientras no hay ninguna fila elegida: el hook no pide nada en ese caso. */
  documentId: string | null;
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

// Solo lectura: el documento no se edita, no se borra y no se anula (D-9). El diálogo no
// pinta ninguna acción, y no es un descuido.
export function InventoryDocumentDetailDialog({
  open,
  onOpenChange,
  documentId,
}: InventoryDocumentDetailDialogProps) {
  const query = useInventoryDocument(open ? documentId : null);
  const document = query.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Documento {document ? `n.º ${document.docNumber}` : 'de inventario'}
          </DialogTitle>
          <DialogDescription>
            Detalle de las unidades movidas y del stock con el que quedó cada producto.
          </DialogDescription>
        </DialogHeader>

        {query.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-destructive text-sm font-medium">
              {query.error.message || 'No se pudo cargar el documento.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : document ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <DetailRow label="Fecha">
                <span className="tabular-nums">{formatDayKey(document.docDate)}</span>
              </DetailRow>
              <DetailRow label="Tipo">
                <span className="block">{document.transaccionName}</span>
                <TransactionDirectionBadge direction={document.direction} />
              </DetailRow>
              <DetailRow label="Referencia">{document.reference ?? '—'}</DetailRow>
              <DetailRow label="Registrado por">{document.createdByName}</DetailRow>
            </dl>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Stock resultante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {document.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell className="font-mono text-xs">{item.productSku}</TableCell>
                      <TableCell className="tabular-nums">{item.quantity}</TableCell>
                      {/* El valor guardado en la línea, no uno recalculado: es el que
                          devolvió el UPDATE al aplicarla (D-11, AC19). */}
                      <TableCell className="tabular-nums">{item.stockAfter}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-muted-foreground text-sm">
              {document.itemCount} {document.itemCount === 1 ? 'línea' : 'líneas'} ·{' '}
              <span className="tabular-nums">{document.totalQuantity}</span> unidades en total.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
