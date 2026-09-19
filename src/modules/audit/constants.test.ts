import { describe, expect, it } from 'vitest';

import { auditActionLabel, auditFieldLabel, entityTypeLabel } from './constants';

describe('auditActionLabel', () => {
  it('translates a known action code to its Spanish label', () => {
    expect(auditActionLabel('category.created')).toBe('Categoría creada');
  });

  it('translates another known action code from a different entity', () => {
    expect(auditActionLabel('user.roles_changed')).toBe('Roles cambiados');
  });

  it('falls back to the raw code when it is not in the catalog', () => {
    expect(auditActionLabel('order.refunded')).toBe('order.refunded');
  });

  it('falls back to an empty string when given an empty string', () => {
    expect(auditActionLabel('')).toBe('');
  });

  it('is case-sensitive: a differently-cased known code falls back to itself', () => {
    expect(auditActionLabel('Category.Created')).toBe('Category.Created');
  });
});

describe('entityTypeLabel', () => {
  it('translates a known entity type to its readable label', () => {
    expect(entityTypeLabel('user')).toBe('Persona');
  });

  it('translates another known entity type', () => {
    expect(entityTypeLabel('product')).toBe('Producto');
  });

  it('translates the order entity type added by the admin orders panel', () => {
    expect(entityTypeLabel('order')).toBe('Pedido');
  });

  it('falls back to the raw entity type when it is not in the catalog', () => {
    expect(entityTypeLabel('invoice')).toBe('invoice');
  });

  it('falls back to an empty string when given an empty string', () => {
    expect(entityTypeLabel('')).toBe('');
  });
});

describe('auditFieldLabel', () => {
  it('translates a known field name to its visible label', () => {
    expect(auditFieldLabel('priceCents')).toBe('Precio (céntimos)');
  });

  it('translates another known field name', () => {
    expect(auditFieldLabel('roleSlugs')).toBe('Roles');
  });

  it('falls back to the raw field name when it is not in the catalog', () => {
    expect(auditFieldLabel('metadata')).toBe('metadata');
  });

  it('falls back to an empty string when given an empty string', () => {
    expect(auditFieldLabel('')).toBe('');
  });

  it('translates the payroll fields that reach the log (spec 018)', () => {
    expect(auditFieldLabel('employeeCode')).toBe('Código de planilla');
    expect(auditFieldLabel('jobTitle')).toBe('Cargo');
    expect(auditFieldLabel('hiredAt')).toBe('Fecha de ingreso');
    expect(auditFieldLabel('period')).toBe('Periodo');
    expect(auditFieldLabel('paidAt')).toBe('Fecha de pago');
  });

  it('labels the salary flag, which is all the log says about a raise (D-8)', () => {
    expect(auditFieldLabel('salaryChanged')).toBe('Salario modificado');
  });

  // Si alguien añadiera el importe al log, esta etiqueta sería lo primero que haría
  // falta: que no exista es la señal de que el campo no debe llegar aquí (AC17).
  it('has no label for an amount field: no payroll figure belongs in the log (AC17)', () => {
    expect(auditFieldLabel('baseSalaryCents')).toBe('baseSalaryCents');
    expect(auditFieldLabel('amountCents')).toBe('amountCents');
  });
});

describe('payroll audit catalog (spec 018)', () => {
  it('labels the three employee actions', () => {
    expect(auditActionLabel('employee.created')).toBe('Empleado dado de alta');
    expect(auditActionLabel('employee.updated')).toBe('Empleado editado');
    expect(auditActionLabel('employee.deactivated')).toBe('Empleado dado de baja');
  });

  it('labels the two payment actions', () => {
    expect(auditActionLabel('payroll_payment.registered')).toBe('Pago de nómina registrado');
    expect(auditActionLabel('payroll_payment.voided')).toBe('Pago de nómina anulado');
  });

  it('keeps the employee entity apart from the user one: they are not the same thing (D-1)', () => {
    expect(entityTypeLabel('employee')).toBe('Empleado');
    expect(entityTypeLabel('user')).toBe('Persona');
  });

  it('labels the payment entity type', () => {
    expect(entityTypeLabel('payroll_payment')).toBe('Pago de nómina');
  });
});

describe('inventory document audit catalog (spec 020)', () => {
  it('labels the action written by the document service', () => {
    expect(auditActionLabel('inventory_document.created')).toBe(
      'Documento de inventario registrado',
    );
  });

  it('labels its entity type', () => {
    expect(entityTypeLabel('inventory_document')).toBe('Documento de inventario');
  });

  it('labels the four fields the document writes to `changes` (D-19)', () => {
    expect(auditFieldLabel('docNumber')).toBe('Número de documento');
    expect(auditFieldLabel('transaccionId')).toBe('Tipo de transacción');
    expect(auditFieldLabel('docDate')).toBe('Fecha del documento');
    expect(auditFieldLabel('itemCount')).toBe('Líneas');
  });
});
