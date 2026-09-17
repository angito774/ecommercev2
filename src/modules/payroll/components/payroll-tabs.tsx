'use client';

import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { EmployeesTable } from './employees-table';
import { PayrollPaymentsTable } from './payroll-payments-table';

const STAFF_TAB = 'staff';
const PAYMENTS_TAB = 'payments';

// Una sola página con dos pestañas y una sola entrada de navegación: los dos permisos se
// conceden juntos y las dos vistas son el mismo dominio (D-18).
//
// La pestaña activa es estado local y no vive en Zustand: no hay ninguna otra rama del
// árbol que la necesite, y un store para un `useState` sería estado global de adorno
// (docs/SETUP.md §4, regla dura 6). El precio declarado es que `/admin/payroll` siempre
// abre en «Personal» y no se puede enlazar «Pagos» (§11).
export function PayrollTabs() {
  const [tab, setTab] = useState<string>(STAFF_TAB);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value={STAFF_TAB}>Personal</TabsTrigger>
        <TabsTrigger value={PAYMENTS_TAB}>Pagos</TabsTrigger>
      </TabsList>

      <TabsContent value={STAFF_TAB} className="mt-4">
        <EmployeesTable />
      </TabsContent>

      <TabsContent value={PAYMENTS_TAB} className="mt-4">
        <PayrollPaymentsTable onGoToStaff={() => setTab(STAFF_TAB)} />
      </TabsContent>
    </Tabs>
  );
}
