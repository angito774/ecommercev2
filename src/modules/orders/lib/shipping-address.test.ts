import { describe, expect, it } from 'vitest';

import { formatShippingAddress, parseShippingAddress } from './shipping-address';

const STRIPE_SHAPE = {
  name: 'Nelson Nina',
  address: {
    line1: 'Av. Siempre Viva 742',
    line2: 'Dpto. 301',
    city: 'Lima',
    state: 'Lima',
    postal_code: '15001',
    country: 'PE',
  },
};

describe('parseShippingAddress', () => {
  it('parses the jsonb that readShippingAddress writes', () => {
    expect(parseShippingAddress(STRIPE_SHAPE)).toEqual(STRIPE_SHAPE);
  });

  it('returns null for an order that never reached paid (AC11)', () => {
    expect(parseShippingAddress(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseShippingAddress(undefined)).toBeNull();
  });

  it('returns null for a foreign shape instead of throwing (D-12)', () => {
    expect(parseShippingAddress({ street: 'Av. Siempre Viva', zip: '15001' })).toBeNull();
  });

  it('returns null when address is a string rather than an object', () => {
    expect(parseShippingAddress({ name: 'Nelson', address: 'Lima' })).toBeNull();
  });

  it('returns null for a primitive stored in the column', () => {
    expect(parseShippingAddress('Lima, Perú')).toBeNull();
  });

  it('accepts an address whose optional fields are all null', () => {
    const value = { name: null, address: { line1: 'Av. Siempre Viva 742' } };

    expect(parseShippingAddress(value)).not.toBeNull();
  });
});

describe('formatShippingAddress', () => {
  it('lays out a complete address in reading order', () => {
    expect(formatShippingAddress(STRIPE_SHAPE)).toEqual([
      'Nelson Nina',
      'Av. Siempre Viva 742',
      'Dpto. 301',
      'Lima, Lima, 15001',
      'PE',
    ]);
  });

  it('drops the empty line2 and state without leaving a blank row', () => {
    const address = {
      name: 'Nelson Nina',
      address: {
        line1: 'Av. Siempre Viva 742',
        line2: null,
        city: 'Lima',
        state: null,
        postal_code: '15001',
        country: 'PE',
      },
    };

    expect(formatShippingAddress(address)).toEqual([
      'Nelson Nina',
      'Av. Siempre Viva 742',
      'Lima, 15001',
      'PE',
    ]);
  });

  it('omits the locality line entirely when city, state and postal code are missing', () => {
    const address = {
      name: 'Nelson Nina',
      address: { line1: 'Av. Siempre Viva 742', city: null, state: null, postal_code: null },
    };

    expect(formatShippingAddress(address)).toEqual(['Nelson Nina', 'Av. Siempre Viva 742']);
  });

  it('returns an empty array when every field is null', () => {
    expect(formatShippingAddress({ name: null, address: { line1: null } })).toEqual([]);
  });

  it('drops a field that only contains whitespace', () => {
    const address = { name: '   ', address: { line1: 'Av. Siempre Viva 742' } };

    expect(formatShippingAddress(address)).toEqual(['Av. Siempre Viva 742']);
  });

  it('trims the surrounding whitespace of the lines it keeps', () => {
    const address = { name: '  Nelson Nina  ', address: { line1: ' Av. Siempre Viva 742 ' } };

    expect(formatShippingAddress(address)).toEqual(['Nelson Nina', 'Av. Siempre Viva 742']);
  });
});
