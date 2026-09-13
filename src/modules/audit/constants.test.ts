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

  it('falls back to the raw entity type when it is not in the catalog', () => {
    expect(entityTypeLabel('order')).toBe('order');
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
});
