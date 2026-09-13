import { describe, expect, it } from 'vitest';

import { auditLogQuerySchema } from './audit-log.schema';

describe('auditLogQuerySchema', () => {
  it('parses an empty object applying all defaults', () => {
    const result = auditLogQuerySchema.parse({});

    expect(result).toEqual({
      severity: 'all',
      page: 1,
      pageSize: 20,
    });
  });

  it('accepts a fully populated valid filter set', () => {
    const result = auditLogQuerySchema.parse({
      actorId: '11111111-1111-4111-8111-111111111111',
      entityType: 'product',
      action: 'product.updated',
      severity: 'warning',
      from: '2024-01-01T00:00:00.000Z',
      to: '2024-01-31T23:59:59.999Z',
      page: 2,
      pageSize: 50,
    });

    expect(result).toEqual({
      actorId: '11111111-1111-4111-8111-111111111111',
      entityType: 'product',
      action: 'product.updated',
      severity: 'warning',
      from: '2024-01-01T00:00:00.000Z',
      to: '2024-01-31T23:59:59.999Z',
      page: 2,
      pageSize: 50,
    });
  });

  describe('actorId', () => {
    it('rejects a value that is not a UUID', () => {
      expect(() => auditLogQuerySchema.parse({ actorId: 'not-a-uuid' })).toThrow();
    });

    it('is optional', () => {
      expect(auditLogQuerySchema.parse({}).actorId).toBeUndefined();
    });
  });

  describe('entityType', () => {
    it('trims surrounding whitespace', () => {
      expect(auditLogQuerySchema.parse({ entityType: '  product  ' }).entityType).toBe('product');
    });

    it('accepts a value at the 40-character limit', () => {
      const value = 'a'.repeat(40);
      expect(auditLogQuerySchema.parse({ entityType: value }).entityType).toBe(value);
    });

    it('rejects a value longer than 40 characters', () => {
      const value = 'a'.repeat(41);
      expect(() => auditLogQuerySchema.parse({ entityType: value })).toThrow();
    });
  });

  describe('action', () => {
    it('trims surrounding whitespace', () => {
      expect(auditLogQuerySchema.parse({ action: '  product.created  ' }).action).toBe(
        'product.created',
      );
    });

    it('accepts a value at the 80-character limit', () => {
      const value = 'a'.repeat(80);
      expect(auditLogQuerySchema.parse({ action: value }).action).toBe(value);
    });

    it('rejects a value longer than 80 characters', () => {
      const value = 'a'.repeat(81);
      expect(() => auditLogQuerySchema.parse({ action: value })).toThrow();
    });
  });

  describe('severity', () => {
    it.each(['all', 'info', 'warning', 'error'])('accepts "%s"', (severity) => {
      expect(auditLogQuerySchema.parse({ severity }).severity).toBe(severity);
    });

    it('defaults to "all" when omitted', () => {
      expect(auditLogQuerySchema.parse({}).severity).toBe('all');
    });

    it('rejects a value outside the enum', () => {
      expect(() => auditLogQuerySchema.parse({ severity: 'critical' })).toThrow();
    });
  });

  describe('from / to', () => {
    it('accepts a valid ISO datetime for "from"', () => {
      const value = '2024-01-01T00:00:00.000Z';
      expect(auditLogQuerySchema.parse({ from: value }).from).toBe(value);
    });

    it('accepts a valid ISO datetime for "to"', () => {
      const value = '2024-01-31T23:59:59.999Z';
      expect(auditLogQuerySchema.parse({ to: value }).to).toBe(value);
    });

    it('rejects a plain date without time for "from"', () => {
      expect(() => auditLogQuerySchema.parse({ from: '2024-01-01' })).toThrow();
    });

    it('rejects a non-date string for "to"', () => {
      expect(() => auditLogQuerySchema.parse({ to: 'not-a-date' })).toThrow();
    });

    it('does not enforce "from" being before "to" (no cross-field refine)', () => {
      const result = auditLogQuerySchema.parse({
        from: '2024-02-01T00:00:00.000Z',
        to: '2024-01-01T00:00:00.000Z',
      });

      expect(result.from).toBe('2024-02-01T00:00:00.000Z');
      expect(result.to).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('page', () => {
    it('defaults to 1 when omitted', () => {
      expect(auditLogQuerySchema.parse({}).page).toBe(1);
    });

    it('coerces a numeric string', () => {
      expect(auditLogQuerySchema.parse({ page: '3' }).page).toBe(3);
    });

    it('accepts the minimum value of 1', () => {
      expect(auditLogQuerySchema.parse({ page: 1 }).page).toBe(1);
    });

    it('rejects a value below 1', () => {
      expect(() => auditLogQuerySchema.parse({ page: 0 })).toThrow();
    });

    it('rejects a non-integer value', () => {
      expect(() => auditLogQuerySchema.parse({ page: 1.5 })).toThrow();
    });
  });

  describe('pageSize', () => {
    it('defaults to 20 when omitted', () => {
      expect(auditLogQuerySchema.parse({}).pageSize).toBe(20);
    });

    it('coerces a numeric string', () => {
      expect(auditLogQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(50);
    });

    it('accepts the minimum value of 1', () => {
      expect(auditLogQuerySchema.parse({ pageSize: 1 }).pageSize).toBe(1);
    });

    it('accepts the maximum value of 100', () => {
      expect(auditLogQuerySchema.parse({ pageSize: 100 }).pageSize).toBe(100);
    });

    it('rejects a value below 1', () => {
      expect(() => auditLogQuerySchema.parse({ pageSize: 0 })).toThrow();
    });

    it('rejects a value above 100', () => {
      expect(() => auditLogQuerySchema.parse({ pageSize: 101 })).toThrow();
    });

    it('rejects a non-integer value', () => {
      expect(() => auditLogQuerySchema.parse({ pageSize: 20.5 })).toThrow();
    });
  });
});
