import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { badRequest, parseJsonBody, toErrorResponse } from './api-guard';
import { UnauthorizedError } from './auth';
import { ConflictError, NotFoundError, UpstreamError, ValidationError } from './errors';
import { ForbiddenError } from './permissions';

const schema = z.object({ name: z.string().min(1) });

function jsonRequest(body: unknown): Request {
  return new Request('https://example.com/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function invalidJsonRequest(): Request {
  return new Request('https://example.com/api/admin/categories', {
    method: 'POST',
    body: 'not-json{',
  });
}

describe('badRequest', () => {
  it('returns a 400 response with only the message when no issues are given', async () => {
    const response = badRequest('Slug inválido');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Slug inválido' });
  });

  it('includes the issues array when provided', async () => {
    const result = schema.safeParse({ name: '' });
    if (result.success) throw new Error('expected validation to fail');

    const response = badRequest('Payload inválido', result.error.issues);
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { message: string; issues: unknown };
    expect(payload.message).toBe('Payload inválido');
    expect(payload.issues).toEqual(result.error.issues);
  });
});

describe('parseJsonBody', () => {
  it('returns ok:true with the parsed data when the body matches the schema', async () => {
    const result = await parseJsonBody(jsonRequest({ name: 'Laptops' }), schema, 'inválido');
    expect(result).toEqual({ ok: true, data: { name: 'Laptops' } });
  });

  it('returns a 400 response when the body is not valid JSON', async () => {
    const result = await parseJsonBody(invalidJsonRequest(), schema, 'inválido');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected ok:false');
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ message: 'El cuerpo debe ser JSON válido' });
  });

  it('returns a 400 response with issues when the body fails schema validation', async () => {
    const result = await parseJsonBody(jsonRequest({ name: '' }), schema, 'Nombre requerido');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected ok:false');
    expect(result.response.status).toBe(400);
    const payload = (await result.response.json()) as { message: string; issues: unknown[] };
    expect(payload.message).toBe('Nombre requerido');
    expect(payload.issues.length).toBeGreaterThan(0);
  });
});

describe('toErrorResponse', () => {
  const options = { label: 'test.handler', fallback: 'Error inesperado' };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps UnauthorizedError to 401', async () => {
    const response = toErrorResponse(new UnauthorizedError(), options);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: 'Necesitas iniciar sesión para acceder a este recurso.',
    });
  });

  it('maps ForbiddenError to 403 with its own message', async () => {
    const response = toErrorResponse(new ForbiddenError('categories.delete', 'No puedes'), options);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: 'No puedes' });
  });

  it('maps ValidationError to 400 with only the message', async () => {
    const response = toErrorResponse(
      new ValidationError('La fecha de pago no puede ser anterior al ingreso del empleado.'),
      options,
    );
    expect(response.status).toBe(400);
    // Sin `issues`, a diferencia del 400 de Zod: el invariante lo comprueba el service
    // contra otra fila, no un schema (spec 018, D-16).
    expect(await response.json()).toEqual({
      message: 'La fecha de pago no puede ser anterior al ingreso del empleado.',
    });
  });

  it('maps NotFoundError to 404', async () => {
    const response = toErrorResponse(new NotFoundError('Categoría no encontrada'), options);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Categoría no encontrada' });
  });

  it('maps ConflictError to 409', async () => {
    const response = toErrorResponse(new ConflictError('Ya existe'), options);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'Ya existe' });
  });

  it('maps UpstreamError to 502 and logs it', async () => {
    const response = toErrorResponse(new UpstreamError('Clerk no respondió'), options);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: 'Clerk no respondió' });
    expect(console.error).toHaveBeenCalledWith('test.handler', expect.any(UpstreamError));
  });

  it('maps a unique violation to 409 using a fixed string message', async () => {
    const pgError = { code: '23505', constraint: 'categories_slug_unique' };
    const response = toErrorResponse(pgError, {
      ...options,
      uniqueViolationMessage: 'Ya existe una categoría con ese slug.',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'Ya existe una categoría con ese slug.',
    });
  });

  it('maps a unique violation to 409 using the constraint-to-message map', async () => {
    const pgError = { code: '23505', constraint: 'products_sku_unique' };
    const response = toErrorResponse(pgError, {
      ...options,
      uniqueViolationMessage: {
        products_sku_unique: 'El SKU ya está en uso.',
        products_slug_unique: 'El slug ya está en uso.',
      },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'El SKU ya está en uso.' });
  });

  it('falls back to a generic conflict message when the constraint is not in the map', async () => {
    const pgError = { code: '23505', constraint: 'products_unknown_unique' };
    const response = toErrorResponse(pgError, {
      ...options,
      uniqueViolationMessage: { products_sku_unique: 'El SKU ya está en uso.' },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'Ya existe un registro con esos datos.' });
  });

  it('falls back to 500 for a unique violation when uniqueViolationMessage is not configured', async () => {
    const pgError = { code: '23505', constraint: 'categories_slug_unique' };
    const response = toErrorResponse(pgError, options);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Error inesperado' });
  });

  it('maps an unrecognized error to 500 with the fallback message and logs it', async () => {
    const response = toErrorResponse(new Error('boom'), options);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Error inesperado' });
    expect(console.error).toHaveBeenCalledWith('test.handler', expect.any(Error));
  });
});
