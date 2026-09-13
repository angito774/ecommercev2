import { describe, expect, it } from 'vitest';

import { readPrimaryEmail, readRoleSlugs, toUpsertValues } from './user-sync.service';

// Solo los campos que estas funciones leen del evento `user.created`/`user.updated`
// de Clerk (`UserJSON`); el resto (banned, locked, last_sign_in_at, ...) es
// irrelevante para su lógica de mapeo, así que el fixture se limita a eso y se
// castea a través de `unknown`, sin recurrir a `any`.
type EmailAddressFixture = { id: string; email_address: string };

type UserEventDataFixture = {
  id: string;
  email_addresses: EmailAddressFixture[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  public_metadata?: unknown;
};

function buildEvent(overrides: Partial<UserEventDataFixture> = {}): UserEventDataFixture {
  return {
    id: 'user_clerk_123',
    email_addresses: [{ id: 'idn_primary', email_address: 'ada@example.com' }],
    primary_email_address_id: 'idn_primary',
    first_name: 'Ada',
    last_name: 'Lovelace',
    image_url: 'https://img.clerk.com/ada.jpg',
    ...overrides,
  };
}

// Los tipos de `@/server/services/user-sync.service` toman `UserEventData` del
// union del SDK de Clerk; el fixture cubre solo los campos leídos y se castea, como
// en `checkout.service.test.ts` con `Stripe.Checkout.Session`.
function asEventData(fixture: UserEventDataFixture): Parameters<typeof readPrimaryEmail>[0] {
  return fixture as unknown as Parameters<typeof readPrimaryEmail>[0];
}

describe('readPrimaryEmail', () => {
  it('returns the primary email when it matches one of several addresses', () => {
    const event = buildEvent({
      email_addresses: [
        { id: 'idn_secondary', email_address: 'secondary@example.com' },
        { id: 'idn_primary', email_address: 'ada@example.com' },
      ],
      primary_email_address_id: 'idn_primary',
    });

    expect(readPrimaryEmail(asEventData(event))).toBe('ada@example.com');
  });

  it('returns null when no address matches the primary email id', () => {
    const event = buildEvent({
      email_addresses: [{ id: 'idn_secondary', email_address: 'secondary@example.com' }],
      primary_email_address_id: 'idn_primary',
    });

    expect(readPrimaryEmail(asEventData(event))).toBeNull();
  });

  it('returns null when there are no email addresses at all', () => {
    const event = buildEvent({ email_addresses: [], primary_email_address_id: null });

    expect(readPrimaryEmail(asEventData(event))).toBeNull();
  });
});

describe('toUpsertValues', () => {
  it('maps a full valid payload to the upsert values', () => {
    const event = buildEvent({
      id: 'user_clerk_123',
      email_addresses: [{ id: 'idn_primary', email_address: 'ada@example.com' }],
      primary_email_address_id: 'idn_primary',
      first_name: 'Ada',
      last_name: 'Lovelace',
      image_url: 'https://img.clerk.com/ada.jpg',
    });

    expect(toUpsertValues(asEventData(event))).toEqual({
      clerkId: 'user_clerk_123',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      imageUrl: 'https://img.clerk.com/ada.jpg',
    });
  });

  it('falls back to null imageUrl when Clerk sends an empty string', () => {
    const event = buildEvent({ image_url: '' });

    expect(toUpsertValues(asEventData(event))?.imageUrl).toBeNull();
  });

  it('returns null when there is no primary email', () => {
    const event = buildEvent({ email_addresses: [], primary_email_address_id: null });

    expect(toUpsertValues(asEventData(event))).toBeNull();
  });
});

describe('readRoleSlugs', () => {
  it('returns the parsed role slugs when public_metadata is valid', () => {
    expect(readRoleSlugs({ roleSlugs: ['admin', 'manager'] })).toEqual(['admin', 'manager']);
  });

  it('returns an empty array instead of throwing when public_metadata is malformed', () => {
    expect(readRoleSlugs({ roleSlugs: 'not-an-array' })).toEqual([]);
    expect(readRoleSlugs({ roleSlugs: ['not-a-real-role'] })).toEqual([]);
    expect(readRoleSlugs('a plain string, not an object')).toEqual([]);
  });

  it('returns an empty array when public_metadata has no roleSlugs field', () => {
    expect(readRoleSlugs({})).toEqual([]);
  });

  it('returns an empty array when public_metadata is absent', () => {
    expect(readRoleSlugs(undefined)).toEqual([]);
  });
});
