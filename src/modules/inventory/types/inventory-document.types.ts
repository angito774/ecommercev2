import type { TransactionDirection, TransactionTypeCode } from '@/lib/inventory-transactions';

// **Ningún campo `Date` viaja en las respuestas de este módulo**: no se publica
// `createdAt`, y el documento se identifica por su número y su `docDate`, que es una
// cadena `'AAAA-MM-DD'`. Así no hereda la deuda de `ProductWithCategory`, que declara
// `Date` en dos campos que JSON entrega como `string` (spec 016 §11).
export type InventoryDocumentRow = {
  id: string;
  docNumber: number;
  transaccionId: TransactionTypeCode;
  // Se publican los dos para que la tabla no tenga que resolver el catálogo, y porque
  // `direction` decide el color del badge.
  transaccionName: string;
  direction: TransactionDirection;
  /** 'AAAA-MM-DD'. */
  docDate: string;
  reference: string | null;
  /** Nombre completo de quien lo registró, o su correo si no tiene nombre. */
  createdByName: string;
  itemCount: number;
  totalQuantity: number;
};

export type InventoryDocumentItemRow = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  stockAfter: number;
};

export type InventoryDocumentDetail = InventoryDocumentRow & {
  items: InventoryDocumentItemRow[];
};

export type InventoryDocumentListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  // Resuelto en el servidor; la UI solo oculta controles. La frontera real es el 403
  // del POST (AC3).
  canMove: boolean;
};

export type InventoryDocumentListResponse = {
  data: InventoryDocumentRow[];
  meta: InventoryDocumentListMeta;
};
