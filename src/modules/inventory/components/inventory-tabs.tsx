'use client';

import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { InventoryDocumentsTable } from './inventory-documents-table';
import { InventoryTable } from './inventory-table';

const ALERTS_TAB = 'alerts';
const MOVEMENTS_TAB = 'movements';

// Dos vistas del mismo dominio y bajo el mismo permiso de lectura, así que dos pestañas y
// ninguna ruta nueva: una entrada más en el sidebar separaría dos gestos que en la
// práctica son uno —se detecta la falta de stock y se registra la nota que lo repone—
// (D-20). Mismo patrón que Personal y Pagos en nómina.
//
// La pestaña activa es estado local y no vive en Zustand: no hay ninguna otra rama del
// árbol que la necesite (docs/SETUP.md §4, regla dura 6). El precio declarado es que
// `/admin/inventory` siempre abre en «Alertas de stock» y no se puede enlazar
// «Movimientos».
export function InventoryTabs() {
  const [tab, setTab] = useState<string>(ALERTS_TAB);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value={ALERTS_TAB}>Alertas de stock</TabsTrigger>
        <TabsTrigger value={MOVEMENTS_TAB}>Movimientos</TabsTrigger>
      </TabsList>

      <TabsContent value={ALERTS_TAB} className="mt-4">
        <InventoryTable />
      </TabsContent>

      <TabsContent value={MOVEMENTS_TAB} className="mt-4">
        <InventoryDocumentsTable />
      </TabsContent>
    </Tabs>
  );
}
