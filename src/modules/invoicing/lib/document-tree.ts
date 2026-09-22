import type { ElectronicDocumentRow } from '../types/electronic-document.types';

export type DocumentTreeNode = {
  document: ElectronicDocumentRow;
  /** Las correcciones que modifican a este documento, en el orden en que llegaron. */
  children: ElectronicDocumentRow[];
};

/**
 * El árbol de comprobantes de un pedido, construido con `related_document_id` y **no**
 * ordenando por fecha (spec 023, D-11): con dos correcciones sobre el mismo original el
 * orden cronológico no dice cuál modifica a cuál, y en cuanto exista una nota de crédito
 * sobre una reemisión la suposición falla.
 *
 * Vive fuera del componente porque es una transformación de datos con reglas propias y se
 * prueba sin montar React; el componente solo la pinta.
 *
 * **Un solo nivel de anidación**, y es deliberado: hoy toda corrección apunta al original
 * emitido, así que un árbol recursivo añadiría profundidad que ningún dato produce. Una
 * corrección cuyo padre no esté en la lista se pinta como **raíz** en vez de desaparecer:
 * la anidación es una ayuda de lectura, no un filtro, y esconder un documento fiscal porque
 * su padre no vino sería la peor forma de descubrirlo.
 */
export function buildDocumentTree(documents: ElectronicDocumentRow[]): DocumentTreeNode[] {
  const present = new Set(documents.map((document) => document.id));
  const childrenOf = new Map<string, ElectronicDocumentRow[]>();

  for (const document of documents) {
    const parentId = document.relatedDocumentId;
    if (!parentId || !present.has(parentId)) continue;

    const bucket = childrenOf.get(parentId);
    if (bucket) bucket.push(document);
    else childrenOf.set(parentId, [document]);
  }

  return documents
    .filter(
      (document) => !document.relatedDocumentId || !present.has(document.relatedDocumentId),
    )
    .map((document) => ({ document, children: childrenOf.get(document.id) ?? [] }));
}
