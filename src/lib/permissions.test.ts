import { describe, expect, it } from 'vitest';

import { can, isPermissionCode, isRoleSlug, type PermissionCode } from './permissions';

describe('can', () => {
  it('returns true when the code is in the granted set', () => {
    const granted: ReadonlySet<PermissionCode> = new Set(['categories.read']);
    expect(can(granted, 'categories.read')).toBe(true);
  });

  it('returns false when the code is not in the granted set', () => {
    const granted: ReadonlySet<PermissionCode> = new Set(['categories.read']);
    expect(can(granted, 'categories.delete')).toBe(false);
  });

  it('returns false for an empty granted set', () => {
    const granted: ReadonlySet<PermissionCode> = new Set();
    expect(can(granted, 'products.read')).toBe(false);
  });
});

describe('isPermissionCode', () => {
  it('returns true for a code that exists in the catalog', () => {
    expect(isPermissionCode('users.assign_elevated_roles')).toBe(true);
  });

  it('returns false for a string that is not in the catalog', () => {
    expect(isPermissionCode('categories.archive')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isPermissionCode('')).toBe(false);
  });

  it('returns false for a stale code removed from the catalog (case-sensitive match)', () => {
    expect(isPermissionCode('Categories.Read')).toBe(false);
  });
});

describe('isRoleSlug', () => {
  it('returns true for a slug that exists in the catalog', () => {
    expect(isRoleSlug('super_admin')).toBe(true);
  });

  it('returns false for a slug that is not in the catalog', () => {
    expect(isRoleSlug('root')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isRoleSlug('')).toBe(false);
  });
});
