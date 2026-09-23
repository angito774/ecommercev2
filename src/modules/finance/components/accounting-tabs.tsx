'use client';

import { useMemo, useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { currentMonthRange } from '../lib/finance-range';
import type { FinanceRange } from '../types/finance.types';

import { FinanceRangeFilter } from './finance-range-filter';
import { PurchaseRegistryTable } from './purchase-registry-table';
import { RegistryExportButton } from './registry-export-button';
import { SalesRegistryTable } from './sales-registry-table';

const SALES_TAB = 'sales';
const PURCHASES_TAB = 'purchases';

const SALES_TAB_LABEL = 'Registro de Ventas';
const PURCHASES_TAB_LABEL = 'Registro de Compras';

// Dos vistas del mismo dominio y bajo el mismo permiso, así que dos pestañas y una sola
// ruta: el rango significa exactamente lo mismo en las dos y se elige una vez arriba, por
// encima de las pestañas. Mismo patrón que `inventory-tabs.tsx`.
//
// La pestaña activa es estado local y no vive en Zustand: no hay ninguna otra rama del
// árbol que la necesite (docs/SETUP.md §4, regla dura 6). El precio declarado es que
// `/admin/finance/accounting` siempre abre en «Registro de Ventas».
export function AccountingTabs() {
  // El mes en curso se resuelve una vez en el montaje: recalcularlo en cada render
  // devolvería un objeto nuevo y reiniciaría la consulta en bucle.
  const currentMonth = useMemo(() => currentMonthRange(new Date()), []);

  const [range, setRange] = useState<FinanceRange>(currentMonth);
  const [tab, setTab] = useState<string>(SALES_TAB);

  return (
    <div className="space-y-6">
      {/* El mismo filtro que el resumen y que impuestos: aquí el rango significa lo mismo,
          y un rango invertido no llega a pedirse. */}
      <FinanceRangeFilter value={range} onChange={setRange} currentMonth={currentMonth} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value={SALES_TAB}>{SALES_TAB_LABEL}</TabsTrigger>
          <TabsTrigger value={PURCHASES_TAB}>{PURCHASES_TAB_LABEL}</TabsTrigger>
        </TabsList>

        <TabsContent value={SALES_TAB} className="mt-4 space-y-4">
          {/* El botón manda el **mismo rango** que la tabla acaba de consultar (AC20). */}
          <RegistryExportButton
            registry="sales"
            range={range}
            registryLabel={SALES_TAB_LABEL}
          />
          <SalesRegistryTable range={range} />
        </TabsContent>

        <TabsContent value={PURCHASES_TAB} className="mt-4 space-y-4">
          <RegistryExportButton
            registry="purchases"
            range={range}
            registryLabel={PURCHASES_TAB_LABEL}
          />
          <PurchaseRegistryTable range={range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
