import { describe, expect, it } from 'vitest';

import {
  can,
  isPermissionCode,
  isRoleSlug,
  PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  type PermissionCode,
  type RoleSlug,
} from './permissions';

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

// ── Nómina detrás de finance.read (spec 027, AC27) ──────────────────────────

// El resumen financiero publica el **total de nómina del rango** desde que existe la
// utilidad operativa, así que `finance.read` alcanza un dato que hasta ahora vivía solo
// detrás de `payroll.read`. Hoy es inocuo —los dos únicos roles con `finance.read` son
// `super_admin` y `admin`, y los dos tienen `payroll.read`—, pero el día que alguien
// conceda `finance.read` a `manager` o a `audit`, este endpoint le entregaría el gasto de
// personal agregado. El test convierte ese descuido en un test rojo en vez de en una fuga
// silenciosa (§10).
//
// Es agregado y por rango: no expone el salario de nadie en particular, que es la línea
// que el spec 018 (D-4) trazó.
describe('ROLE_PERMISSION_MATRIX — la nómina que publica el resumen (AC27)', () => {
  const rolesWith = (code: PermissionCode): RoleSlug[] =>
    (Object.keys(ROLE_PERMISSION_MATRIX) as RoleSlug[]).filter((slug) =>
      ROLE_PERMISSION_MATRIX[slug].includes(code),
    );

  it('grants payroll.read to every role that has finance.read', () => {
    for (const slug of rolesWith('finance.read')) {
      expect(ROLE_PERMISSION_MATRIX[slug]).toContain('payroll.read');
    }
  });

  it('still has at least one role with finance.read: the invariant is not vacuous', () => {
    expect(rolesWith('finance.read').length).toBeGreaterThan(0);
  });

  // Ningún permiso nuevo: la utilidad del período se lee con el `finance.read` de siempre
  // (§3).
  it('adds no permission code: the catalogue stays at 29', () => {
    expect(PERMISSIONS).toHaveLength(29);
  });
});
