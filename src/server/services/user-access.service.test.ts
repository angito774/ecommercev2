import { describe, expect, it } from 'vitest';

import { ForbiddenError, type PermissionCode } from '@/lib/permissions';
import type { RoleRef } from '@/server/repositories/role.repository';

import { assertMayTouch, clerkStatusOf, sameSlugs } from './user-access.service';

function buildRole(overrides: Partial<RoleRef> = {}): RoleRef {
  return { id: '11111111-1111-1111-1111-111111111111', slug: 'manager', isElevated: false, ...overrides };
}

function grantedWith(...codes: PermissionCode[]): ReadonlySet<PermissionCode> {
  return new Set(codes);
}

describe('assertMayTouch', () => {
  it('allows an actor with users.assign_elevated_roles to touch an elevated role', () => {
    const roles = [buildRole({ slug: 'admin', isElevated: true })];
    const granted = grantedWith('users.assign_elevated_roles');

    expect(() => assertMayTouch(roles, granted)).not.toThrow();
  });

  it('throws ForbiddenError when an actor without the permission touches an elevated role', () => {
    const roles = [buildRole({ slug: 'super_admin', isElevated: true })];
    const granted = grantedWith('users.assign_roles');

    expect(() => assertMayTouch(roles, granted)).toThrow(ForbiddenError);
    try {
      assertMayTouch(roles, granted);
      throw new Error('expected assertMayTouch to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).permission).toBe('users.assign_elevated_roles');
    }
  });

  it('allows an actor without the permission to touch only non-elevated roles', () => {
    const roles = [
      buildRole({ slug: 'manager', isElevated: false }),
      buildRole({ slug: 'audit', isElevated: false }),
    ];
    const granted = grantedWith('users.assign_roles');

    expect(() => assertMayTouch(roles, granted)).not.toThrow();
  });

  it('allows an actor without any permission when the role list is empty', () => {
    const granted = grantedWith();

    expect(() => assertMayTouch([], granted)).not.toThrow();
  });

  it('throws when at least one role in a mixed list is elevated and the actor lacks the permission', () => {
    const roles = [
      buildRole({ slug: 'manager', isElevated: false }),
      buildRole({ slug: 'admin', isElevated: true }),
    ];
    const granted = grantedWith('users.assign_roles');

    expect(() => assertMayTouch(roles, granted)).toThrow(ForbiddenError);
  });
});

describe('sameSlugs', () => {
  it('returns true when both lists contain the same slugs in a different order', () => {
    expect(sameSlugs(['manager', 'audit'], ['audit', 'manager'])).toBe(true);
  });

  it('returns false when the lists contain different slugs', () => {
    expect(sameSlugs(['manager'], ['audit'])).toBe(false);
  });

  it('returns false when the lists have different lengths', () => {
    expect(sameSlugs(['manager', 'audit'], ['manager'])).toBe(false);
  });

  it('returns true when both lists are empty', () => {
    expect(sameSlugs([], [])).toBe(true);
  });
});

describe('clerkStatusOf', () => {
  it('returns the numeric status when the error carries a valid HTTP status', () => {
    expect(clerkStatusOf({ status: 422, errors: [] })).toBe(422);
  });

  it('returns null when the error has no status field', () => {
    expect(clerkStatusOf({ errors: [] })).toBeNull();
  });

  it('returns null when the value is not a Clerk-shaped error object', () => {
    expect(clerkStatusOf('network failure')).toBeNull();
    expect(clerkStatusOf(null)).toBeNull();
    expect(clerkStatusOf(new Error('boom'))).toBeNull();
  });
});
