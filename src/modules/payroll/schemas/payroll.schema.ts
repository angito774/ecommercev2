import { z } from 'zod';

import { PRICE_INPUT_PATTERN } from '@/modules/products/lib/price';

// 'AAAA-MM' con mes real: 2026-13 y 2026-00 se rechazan en el borde (AC10).
export const PAYROLL_PERIOD_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export const payrollPeriodSchema = z
  .string()
  .trim()
  .regex(PAYROLL_PERIOD_PATTERN, 'Usa el formato AAAA-MM, por ejemplo 2026-09');

export const createPayrollPaymentSchema = z.object({
  employeeId: z.uuid('Elige un empleado'),
  period: payrollPeriodSchema,
  paidAt: z.iso.date('Usa el formato AAAA-MM-DD'),
  amountCents: z
    .number()
    .int('El importe debe expresarse en céntimos enteros')
    .min(1, 'El importe debe ser mayor que cero')
    .max(99_999_999, 'El importe supera el máximo admitido'),
});

export const payrollPaymentIdSchema = z.uuid();

export const payrollQuerySchema = z.object({
  // Centinela `all` en vez de omitir el parámetro, por coherencia con `categoryId` y
  // `status` del resto del panel.
  period: z.union([z.literal('all'), payrollPeriodSchema]).default('all'),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const payrollPaymentFormSchema = z.object({
  period: payrollPeriodSchema,
  paidAt: z.iso.date('Usa el formato AAAA-MM-DD'),
  amount: z
    .string()
    .trim()
    .regex(PRICE_INPUT_PATTERN, 'Usa hasta 2 decimales, por ejemplo 2500.00'),
});

export type CreatePayrollPaymentInput = z.input<typeof createPayrollPaymentSchema>;
export type CreatePayrollPaymentValues = z.output<typeof createPayrollPaymentSchema>;
export type PayrollQueryParams = z.output<typeof payrollQuerySchema>;
export type PayrollPaymentFormValues = z.output<typeof payrollPaymentFormSchema>;
