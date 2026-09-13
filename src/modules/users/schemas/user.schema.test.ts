import { describe, expect, it } from 'vitest';

import {
  assignRolesSchema,
  inviteUserSchema,
  roleSlugSchema,
  updateUserSchema,
  userIdSchema,
  userQuerySchema,
} from './user.schema';

const VALID_ROLE_SLUGS = ['super_admin', 'admin', 'manager', 'employee', 'customer', 'audit'];

describe('roleSlugSchema', () => {
  it.each(VALID_ROLE_SLUGS)('accepts the catalog slug "%s"', (slug) => {
    expect(roleSlugSchema.parse(slug)).toBe(slug);
  });

  it('rejects a slug that is not in the role catalog', () => {
    expect(() => roleSlugSchema.parse('super_hero')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => roleSlugSchema.parse('')).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => roleSlugSchema.parse(123)).toThrow();
  });

  it('is case-sensitive: rejects an uppercase variant of a known slug', () => {
    expect(() => roleSlugSchema.parse('ADMIN')).toThrow();
  });
});

describe('inviteUserSchema', () => {
  it('accepts a valid payload with a single role', () => {
    const result = inviteUserSchema.parse({
      email: 'nueva.persona@example.com',
      roleSlugs: ['admin'],
    });

    expect(result).toEqual({
      email: 'nueva.persona@example.com',
      roleSlugs: ['admin'],
    });
  });

  it('accepts a valid payload with multiple roles', () => {
    const result = inviteUserSchema.parse({
      email: 'nueva.persona@example.com',
      roleSlugs: ['admin', 'manager'],
    });

    expect(result.roleSlugs).toEqual(['admin', 'manager']);
  });

  describe('email', () => {
    it('rejects a malformed email', () => {
      expect(() =>
        inviteUserSchema.parse({ email: 'not-an-email', roleSlugs: ['admin'] }),
      ).toThrow();
    });

    it('rejects a missing email', () => {
      expect(() => inviteUserSchema.parse({ roleSlugs: ['admin'] })).toThrow();
    });

    it('accepts an email at the 255-character limit', () => {
      const local = 'a'.repeat(243);
      const email = `${local}@example.com`;
      expect(email.length).toBe(255);
      const result = inviteUserSchema.parse({ email, roleSlugs: ['admin'] });
      expect(result.email).toBe(email);
    });

    it('rejects an email longer than 255 characters', () => {
      const local = 'a'.repeat(244);
      const email = `${local}@example.com`;
      expect(email.length).toBe(256);
      expect(() => inviteUserSchema.parse({ email, roleSlugs: ['admin'] })).toThrow();
    });
  });

  describe('roleSlugs', () => {
    it('rejects an empty array', () => {
      expect(() =>
        inviteUserSchema.parse({ email: 'persona@example.com', roleSlugs: [] }),
      ).toThrow();
    });

    it('rejects a missing roleSlugs field', () => {
      expect(() => inviteUserSchema.parse({ email: 'persona@example.com' })).toThrow();
    });

    it('rejects a role slug that is not in the catalog', () => {
      expect(() =>
        inviteUserSchema.parse({ email: 'persona@example.com', roleSlugs: ['ceo'] }),
      ).toThrow();
    });

    it('rejects a non-array value', () => {
      expect(() =>
        inviteUserSchema.parse({ email: 'persona@example.com', roleSlugs: 'admin' }),
      ).toThrow();
    });
  });
});

describe('assignRolesSchema', () => {
  it('accepts a valid array of role slugs', () => {
    const result = assignRolesSchema.parse({ roleSlugs: ['admin', 'audit'] });
    expect(result.roleSlugs).toEqual(['admin', 'audit']);
  });

  it('accepts an empty array (removes all roles)', () => {
    const result = assignRolesSchema.parse({ roleSlugs: [] });
    expect(result.roleSlugs).toEqual([]);
  });

  it('rejects a role slug that is not in the catalog', () => {
    expect(() => assignRolesSchema.parse({ roleSlugs: ['owner'] })).toThrow();
  });

  it('rejects a missing roleSlugs field', () => {
    expect(() => assignRolesSchema.parse({})).toThrow();
  });

  it('rejects a non-array value', () => {
    expect(() => assignRolesSchema.parse({ roleSlugs: 'admin' })).toThrow();
  });
});

describe('updateUserSchema', () => {
  it('accepts isActive set to true', () => {
    expect(updateUserSchema.parse({ isActive: true })).toEqual({ isActive: true });
  });

  it('accepts isActive set to false', () => {
    expect(updateUserSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it('rejects a missing isActive field', () => {
    expect(() => updateUserSchema.parse({})).toThrow();
  });

  it('rejects a non-boolean value', () => {
    expect(() => updateUserSchema.parse({ isActive: 'true' })).toThrow();
  });
});

describe('userQuerySchema', () => {
  it('parses an empty object applying all defaults', () => {
    const result = userQuerySchema.parse({});

    expect(result).toEqual({
      status: 'all',
      role: 'all',
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
  });

  it('accepts a fully populated valid filter set', () => {
    const result = userQuerySchema.parse({
      q: 'nelson',
      status: 'active',
      role: 'admin',
      page: 2,
      pageSize: 25,
      sortBy: 'email',
      sortDir: 'asc',
    });

    expect(result).toEqual({
      q: 'nelson',
      status: 'active',
      role: 'admin',
      page: 2,
      pageSize: 25,
      sortBy: 'email',
      sortDir: 'asc',
    });
  });

  describe('q', () => {
    it('trims surrounding whitespace', () => {
      expect(userQuerySchema.parse({ q: '  nelson  ' }).q).toBe('nelson');
    });

    it('is optional', () => {
      expect(userQuerySchema.parse({}).q).toBeUndefined();
    });

    it('accepts a value at the 255-character limit', () => {
      const value = 'a'.repeat(255);
      expect(userQuerySchema.parse({ q: value }).q).toBe(value);
    });

    it('rejects a value longer than 255 characters', () => {
      const value = 'a'.repeat(256);
      expect(() => userQuerySchema.parse({ q: value })).toThrow();
    });
  });

  describe('status', () => {
    it.each(['all', 'active', 'inactive'])('accepts "%s"', (status) => {
      expect(userQuerySchema.parse({ status }).status).toBe(status);
    });

    it('defaults to "all" when omitted', () => {
      expect(userQuerySchema.parse({}).status).toBe('all');
    });

    it('rejects a value outside the enum', () => {
      expect(() => userQuerySchema.parse({ status: 'banned' })).toThrow();
    });
  });

  describe('role', () => {
    it('accepts "all"', () => {
      expect(userQuerySchema.parse({ role: 'all' }).role).toBe('all');
    });

    it.each(VALID_ROLE_SLUGS)('accepts the catalog slug "%s"', (role) => {
      expect(userQuerySchema.parse({ role }).role).toBe(role);
    });

    it('defaults to "all" when omitted', () => {
      expect(userQuerySchema.parse({}).role).toBe('all');
    });

    it('rejects a role slug that is not in the catalog', () => {
      expect(() => userQuerySchema.parse({ role: 'ceo' })).toThrow();
    });
  });

  describe('page', () => {
    it('defaults to 1 when omitted', () => {
      expect(userQuerySchema.parse({}).page).toBe(1);
    });

    it('coerces a numeric string', () => {
      expect(userQuerySchema.parse({ page: '3' }).page).toBe(3);
    });

    it('accepts the minimum value of 1', () => {
      expect(userQuerySchema.parse({ page: 1 }).page).toBe(1);
    });

    it('rejects a value below 1', () => {
      expect(() => userQuerySchema.parse({ page: 0 })).toThrow();
    });

    it('rejects a non-integer value', () => {
      expect(() => userQuerySchema.parse({ page: 1.5 })).toThrow();
    });
  });

  describe('pageSize', () => {
    it('defaults to 10 when omitted', () => {
      expect(userQuerySchema.parse({}).pageSize).toBe(10);
    });

    it('coerces a numeric string', () => {
      expect(userQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(50);
    });

    it('accepts the minimum value of 1', () => {
      expect(userQuerySchema.parse({ pageSize: 1 }).pageSize).toBe(1);
    });

    it('accepts the maximum value of 100', () => {
      expect(userQuerySchema.parse({ pageSize: 100 }).pageSize).toBe(100);
    });

    it('rejects a value below 1', () => {
      expect(() => userQuerySchema.parse({ pageSize: 0 })).toThrow();
    });

    it('rejects a value above 100', () => {
      expect(() => userQuerySchema.parse({ pageSize: 101 })).toThrow();
    });

    it('rejects a non-integer value', () => {
      expect(() => userQuerySchema.parse({ pageSize: 20.5 })).toThrow();
    });
  });

  describe('sortBy', () => {
    it.each(['email', 'createdAt'])('accepts "%s"', (sortBy) => {
      expect(userQuerySchema.parse({ sortBy }).sortBy).toBe(sortBy);
    });

    it('defaults to "createdAt" when omitted', () => {
      expect(userQuerySchema.parse({}).sortBy).toBe('createdAt');
    });

    it('rejects a value outside the enum', () => {
      expect(() => userQuerySchema.parse({ sortBy: 'name' })).toThrow();
    });
  });

  describe('sortDir', () => {
    it.each(['asc', 'desc'])('accepts "%s"', (sortDir) => {
      expect(userQuerySchema.parse({ sortDir }).sortDir).toBe(sortDir);
    });

    it('defaults to "desc" when omitted', () => {
      expect(userQuerySchema.parse({}).sortDir).toBe('desc');
    });

    it('rejects a value outside the enum', () => {
      expect(() => userQuerySchema.parse({ sortDir: 'ascending' })).toThrow();
    });
  });
});

describe('userIdSchema', () => {
  it('accepts a valid UUID', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(userIdSchema.parse(id)).toBe(id);
  });

  it('rejects a value that is not a UUID', () => {
    expect(() => userIdSchema.parse('not-a-uuid')).toThrow();
  });

  it('rejects a non-string value', () => {
    expect(() => userIdSchema.parse(12345)).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => userIdSchema.parse('')).toThrow();
  });
});
