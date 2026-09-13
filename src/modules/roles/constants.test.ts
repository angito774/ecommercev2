import { describe, expect, it } from 'vitest';

import { actionLabel, resourceLabel, roleDescription, roleLabel, roleOrder } from './constants';

describe('roleLabel', () => {
  it('translates a known role slug to its visible name', () => {
    expect(roleLabel('super_admin')).toBe('Super administrador');
  });

  it('translates another known role slug', () => {
    expect(roleLabel('customer')).toBe('Cliente');
  });

  it('falls back to the raw slug when it is not in the catalog', () => {
    expect(roleLabel('unknown_role' as never)).toBe('unknown_role');
  });
});

describe('roleOrder', () => {
  it('orders super_admin before admin', () => {
    expect(roleOrder('super_admin')).toBeLessThan(roleOrder('admin'));
  });

  it('orders admin before customer, despite alphabetical order saying otherwise', () => {
    expect(roleOrder('admin')).toBeLessThan(roleOrder('customer'));
  });

  it('orders customer before audit', () => {
    expect(roleOrder('customer')).toBeLessThan(roleOrder('audit'));
  });

  it('falls back to a position past the last known role for an unknown slug', () => {
    expect(roleOrder('unknown_role')).toBe(6);
  });
});

describe('roleDescription', () => {
  it('returns the long description of a known role', () => {
    expect(roleDescription('manager')).toBe(
      'Gestiona el catálogo y consulta quién tiene acceso, sin modificar accesos.',
    );
  });

  it('returns another known role description', () => {
    expect(roleDescription('audit')).toBe(
      'Solo lectura: consulta catálogo, personas, roles y la bitácora de auditoría.',
    );
  });

  it('falls back to an empty string when the slug is not in the catalog', () => {
    expect(roleDescription('unknown_role' as never)).toBe('');
  });
});

describe('resourceLabel', () => {
  it('translates a known resource to its visible label', () => {
    expect(resourceLabel('categories')).toBe('Categorías');
  });

  it('translates another known resource', () => {
    expect(resourceLabel('users')).toBe('Usuarios');
  });

  it('falls back to the raw resource name when it is not in the catalog', () => {
    expect(resourceLabel('orders')).toBe('orders');
  });
});

describe('actionLabel', () => {
  it('translates a known action to its visible label', () => {
    expect(actionLabel('read')).toBe('Ver');
  });

  it('translates another known action', () => {
    expect(actionLabel('assign_elevated_roles')).toBe('Nombrar administradores');
  });

  it('falls back to the raw action name when it is not in the catalog', () => {
    expect(actionLabel('export')).toBe('export');
  });
});
