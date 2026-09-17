'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';

import { ADMIN_ORDER_STATUS_OPTIONS } from '../constants';
import type { AdminOrderQueryParams } from '../schemas/admin-order.schema';

type StatusFilter = AdminOrderQueryParams['status'];

// Lo que el panel filtra, en la forma en que lo teclea quien consulta: las fechas
// son `yyyy-mm-dd` del input nativo, no instantes ISO. La conversión a UTC la hace
// el contenedor, que es quien arma la query.
export type AdminOrderFiltersValue = {
  dateFrom: string;
  dateTo: string;
  status: StatusFilter;
  customerSearch: string;
};

export const EMPTY_ADMIN_ORDER_FILTERS: AdminOrderFiltersValue = {
  dateFrom: '',
  dateTo: '',
  status: 'all',
  customerSearch: '',
};

type AdminOrderFiltersProps = {
  // Debe ser estable entre renders (el `setState` del contenedor lo es): el efecto
  // que publica los filtros lo lleva en sus dependencias.
  onChange: (value: AdminOrderFiltersValue) => void;
};

const SEARCH_DEBOUNCE_MS = 300;

// `<input type="date">` nativo: dos fechas no justifican traer `react-day-picker`, y
// el control del navegador ya es accesible y está localizado (D-14). Precedente:
// `order-history-filter.tsx` y la bitácora.
//
// El estado vive aquí y no en Zustand: un solo consumidor y muere al desmontar
// (D-13, CLAUDE.md regla 6).
export function AdminOrderFilters({ onChange }: AdminOrderFiltersProps) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  // Borrador y aplicado por separado: teclear una fecha no dispara una consulta por
  // cada dígito, y mientras se escribe «2026-01-» el rango está a medias.
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [appliedRange, setAppliedRange] = useState({ dateFrom: '', dateTo: '' });

  const debouncedSearch = useDebounce(customerSearch, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    onChange({ ...appliedRange, status, customerSearch: debouncedSearch });
  }, [appliedRange, status, debouncedSearch, onChange]);

  // El rango invertido no llega a pedirse: el endpoint respondería 400 y quien filtra
  // vería un error por algo que la UI ya sabe (AC6). Los `min`/`max` lo evitan con el
  // ratón; esto cubre el teclado y el pegado.
  const isRangeInverted = draftFrom !== '' && draftTo !== '' && draftFrom > draftTo;
  const isRangeDirty =
    draftFrom !== appliedRange.dateFrom || draftTo !== appliedRange.dateTo;

  const hasFilters =
    customerSearch !== '' ||
    status !== 'all' ||
    draftFrom !== '' ||
    draftTo !== '' ||
    appliedRange.dateFrom !== '' ||
    appliedRange.dateTo !== '';

  const statusLabel = ADMIN_ORDER_STATUS_OPTIONS.find((option) => option.value === status)?.label;

  function clearFilters() {
    setCustomerSearch('');
    setStatus('all');
    setDraftFrom('');
    setDraftTo('');
    setAppliedRange({ dateFrom: '', dateTo: '' });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-orders-search">Cliente</Label>
          <Input
            id="admin-orders-search"
            type="search"
            placeholder="Nombre o correo"
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            className="w-56"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-orders-status">Estado</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger id="admin-orders-status" className="w-48">
              {/* Texto explícito: `SelectValue` depende de que el item esté montado y
                  el contenido solo se monta al abrir el desplegable. */}
              <SelectValue>{statusLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ADMIN_ORDER_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-orders-from">Desde</Label>
          <Input
            id="admin-orders-from"
            type="date"
            value={draftFrom}
            max={draftTo === '' ? undefined : draftTo}
            onChange={(event) => setDraftFrom(event.target.value)}
            aria-invalid={isRangeInverted}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-orders-to">Hasta</Label>
          <Input
            id="admin-orders-to"
            type="date"
            value={draftTo}
            min={draftFrom === '' ? undefined : draftFrom}
            onChange={(event) => setDraftTo(event.target.value)}
            aria-invalid={isRangeInverted}
            className="w-40"
          />
        </div>

        <Button
          variant="outline"
          disabled={isRangeInverted || !isRangeDirty}
          onClick={() => setAppliedRange({ dateFrom: draftFrom, dateTo: draftTo })}
        >
          Aplicar fechas
        </Button>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {isRangeInverted ? (
        <p className="text-destructive text-sm" role="alert">
          La fecha inicial no puede ser posterior a la final.
        </p>
      ) : null}
    </div>
  );
}
