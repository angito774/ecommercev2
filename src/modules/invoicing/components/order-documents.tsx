import { ExternalLink, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { formatPrice } from '@/modules/products/lib/price';

import {
  DOCUMENT_PENDING_HINT,
  ELECTRONIC_DOCUMENT_KIND_LABELS,
  NO_DOCUMENTS_MESSAGE,
  NO_DOCUMENTS_TITLE,
  PERMANENT_FAILURE_HINT,
  PERMANENT_FAILURE_SERIES_NOTE,
} from '../constants';
import type { ElectronicDocumentRow } from '../types/electronic-document.types';

import { DocumentStatusBadge } from './document-status-badge';

type OrderDocumentsProps = {
  documents: ElectronicDocumentRow[];
  /**
   * Acción de emisión, inyectada por quien tiene el permiso y el hook. **Prop opcional y no
   * un `canIssue` booleano**: así este componente no conoce ni la mutación ni el catálogo de
   * permisos, y «Mis compras» lo reutiliza tal cual sin pasarle nada (SOLID, D).
   *
   * Su presencia es también lo que distingue la vista de panel de la del cliente: sin ella
   * no se pinta el detalle del fallo del proveedor, que son instrucciones para quien emite.
   */
  renderAction?: (document: ElectronicDocumentRow) => ReactNode;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'long',
  timeStyle: 'short',
});

function DocumentMeta({ document }: { document: ElectronicDocumentRow }) {
  if (document.status === 'issued' && document.issuedAt) {
    return (
      <p className="text-muted-foreground text-xs">
        Emitido el {DATE_TIME_FORMATTER.format(new Date(document.issuedAt))}
      </p>
    );
  }

  if (document.status === 'pending') {
    return <p className="text-muted-foreground text-xs">{DOCUMENT_PENDING_HINT}</p>;
  }

  return null;
}

function FailureNotice({ document }: { document: ElectronicDocumentRow }) {
  if (document.status !== 'failed') return null;

  return (
    <div className="text-destructive flex gap-2 text-xs">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div className="space-y-1">
        {/* El texto del proveedor primero: es lo único que dice **qué dato** corregir. */}
        {document.lastError ? <p>{document.lastError}</p> : null}
        {/* Un rechazo permanente no se arregla volviendo a pulsar, y decirlo evita el bucle
            inútil que AC12 quiere prevenir. El correlativo ya está quemado en esta fila, así
            que la corrección es reemitirla, no crear otra (§10). */}
        {document.permanentFailure ? (
          <>
            <p>{PERMANENT_FAILURE_HINT}</p>
            <p className="text-muted-foreground">{PERMANENT_FAILURE_SERIES_NOTE}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Lista **puramente presentacional** de comprobantes: no consulta, no muta y no decide
 * permisos. La comparten el `Sheet` del panel y el diálogo de «Mis compras», que es posible
 * porque la proyección es la misma para los dos (D-12).
 */
export function OrderDocuments({ documents, renderAction }: OrderDocumentsProps) {
  if (documents.length === 0) {
    return (
      <div className="border-border bg-card space-y-1 rounded-[18px] border border-dashed p-4">
        <p className="text-sm font-medium">{NO_DOCUMENTS_TITLE}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{NO_DOCUMENTS_MESSAGE}</p>
      </div>
    );
  }

  return (
    <ul className="border-border divide-border divide-y rounded-[18px] border">
      {documents.map((document) => (
        <li key={document.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                {ELECTRONIC_DOCUMENT_KIND_LABELS[document.kind]}
              </p>
              {/* La serie-número ya viene formateada del servidor para que la UI no
                  reimplemente el formato (§6.3). */}
              {document.label ? (
                <p className="text-muted-foreground font-mono text-xs tabular-nums">
                  {document.label}
                </p>
              ) : null}
            </div>
            {/* En el panel el badge dice el estado real, siempre. En «Mis compras» un
                `failed` no se pinta: el cliente ya pagó, no tiene ningún botón con el que
                arreglarlo y el badge rojo contradice el «tu comprobante se está emitiendo»
                que lee justo debajo. Mientras no esté `issued` ve ese mensaje y conserva el
                recibo de Stripe como respaldo (D-21, AC24). Misma señal que `FailureNotice`:
                la presencia de `renderAction` (D-20). */}
            {renderAction || document.status !== 'failed' ? (
              <DocumentStatusBadge status={document.status} />
            ) : null}
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {document.amountCents !== null ? (
              <span className="tabular-nums">{formatPrice(document.amountCents)}</span>
            ) : null}
            {/* Cuántas veces se intentó ya: no gobierna ningún automatismo —no hay ninguno—,
                es información para quien decide volver a pulsar (§6.7). */}
            {document.attemptCount > 0 ? (
              <span className="tabular-nums">
                {document.attemptCount} {document.attemptCount === 1 ? 'intento' : 'intentos'}
              </span>
            ) : null}
          </div>

          <DocumentMeta document={document} />
          {/* El detalle del fallo es para quien puede hacer algo con él: cita el motivo del
              proveedor —que puede repetir el RUC rechazado— y dice «corrige el dato antes de
              volver a emitir», una instrucción de panel. En «Mis compras» sobra y contradice
              el «tu comprobante se está emitiendo» que el cliente lee justo debajo, así que
              va condicionado al mismo contexto que la acción (D-12), igual que el badge de
              fallo (D-21). */}
          {renderAction ? <FailureNotice document={document} /> : null}

          {/* `<a href>` real y no `window.open()` en un callback asíncrono: el navegador
              bloquearía la ventana por no venir de un gesto del usuario (AC23). */}
          {document.pdfUrl ? (
            <a
              href={document.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex min-h-11 items-center gap-1.5 text-sm hover:underline"
            >
              Ver el PDF
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}

          {renderAction?.(document)}
        </li>
      ))}
    </ul>
  );
}
