import type { User } from '@clerk/nextjs/server';
import { describe, expect, it } from 'vitest';

import { toAccountProfile } from './profile';

// El `User` de Clerk es una clase con getters y metadatos internos que no se pueden
// instanciar a mano en un test. Se construye un doble mínimo con los únicos campos
// que `toAccountProfile`/`toInitials`/`toIsoDate` leen, y se castea al tipo real.
type FakeUser = {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  primaryEmailAddress: {
    emailAddress: string;
    verification: { status: string } | null;
  } | null;
  primaryPhoneNumber: { phoneNumber: string } | null;
  imageUrl: string;
  createdAt: number;
  lastSignInAt: number | null;
};

function buildUser(overrides: Partial<FakeUser> = {}): User {
  const base: FakeUser = {
    firstName: 'Ana',
    lastName: 'Torres',
    fullName: 'Ana Torres',
    primaryEmailAddress: {
      emailAddress: 'ana.torres@example.com',
      verification: { status: 'verified' },
    },
    primaryPhoneNumber: { phoneNumber: '+51987654321' },
    imageUrl: 'https://img.clerk.com/ana.png',
    createdAt: 1700000000000,
    lastSignInAt: 1700100000000,
  };

  return { ...base, ...overrides } as unknown as User;
}

describe('toAccountProfile', () => {
  it('maps fullName, email and imageUrl as-is', () => {
    const profile = toAccountProfile(buildUser());

    expect(profile.fullName).toBe('Ana Torres');
    expect(profile.email).toBe('ana.torres@example.com');
    expect(profile.imageUrl).toBe('https://img.clerk.com/ana.png');
  });

  it('marks the email as verified when the verification status is "verified"', () => {
    const profile = toAccountProfile(buildUser());

    expect(profile.emailVerified).toBe(true);
  });

  it.each(['unverified', 'failed', 'expired', 'transferable'])(
    'marks the email as unverified when the verification status is "%s"',
    (status) => {
      const profile = toAccountProfile(
        buildUser({
          primaryEmailAddress: { emailAddress: 'ana.torres@example.com', verification: { status } },
        }),
      );

      expect(profile.emailVerified).toBe(false);
    },
  );

  it('marks the email as unverified when there is no verification object', () => {
    const profile = toAccountProfile(
      buildUser({
        primaryEmailAddress: { emailAddress: 'ana.torres@example.com', verification: null },
      }),
    );

    expect(profile.emailVerified).toBe(false);
  });

  it('returns null email and unverified when there is no primary email address', () => {
    const profile = toAccountProfile(buildUser({ primaryEmailAddress: null }));

    expect(profile.email).toBeNull();
    expect(profile.emailVerified).toBe(false);
  });

  it('returns the primary phone number when present', () => {
    const profile = toAccountProfile(
      buildUser({ primaryPhoneNumber: { phoneNumber: '+51900000000' } }),
    );

    expect(profile.phone).toBe('+51900000000');
  });

  it('returns null phone when there is no primary phone number', () => {
    const profile = toAccountProfile(buildUser({ primaryPhoneNumber: null }));

    expect(profile.phone).toBeNull();
  });

  it('converts createdAt from Unix ms to an ISO string', () => {
    const profile = toAccountProfile(buildUser({ createdAt: 1700000000000 }));

    expect(profile.createdAt).toBe(new Date(1700000000000).toISOString());
  });

  it('converts lastSignInAt from Unix ms to an ISO string', () => {
    const profile = toAccountProfile(buildUser({ lastSignInAt: 1700100000000 }));

    expect(profile.lastSignInAt).toBe(new Date(1700100000000).toISOString());
  });

  it('returns null lastSignInAt when the user never signed in', () => {
    const profile = toAccountProfile(buildUser({ lastSignInAt: null }));

    expect(profile.lastSignInAt).toBeNull();
  });

  describe('initials (via toAccountProfile)', () => {
    it('builds initials from first and last name', () => {
      const profile = toAccountProfile(buildUser({ firstName: 'Carlos', lastName: 'Ramirez' }));

      expect(profile.initials).toBe('CR');
    });

    it('builds initials from the first name only when the last name is missing', () => {
      const profile = toAccountProfile(buildUser({ firstName: 'Carlos', lastName: null }));

      expect(profile.initials).toBe('C');
    });

    it('builds initials from the last name only when the first name is missing', () => {
      const profile = toAccountProfile(buildUser({ firstName: null, lastName: 'Ramirez' }));

      expect(profile.initials).toBe('R');
    });

    it('falls back to the first letter of the email when both names are missing', () => {
      const profile = toAccountProfile(
        buildUser({
          firstName: null,
          lastName: null,
          primaryEmailAddress: {
            emailAddress: 'zoe@example.com',
            verification: { status: 'verified' },
          },
        }),
      );

      expect(profile.initials).toBe('Z');
    });

    it('returns an empty string when there is no name and no email', () => {
      const profile = toAccountProfile(
        buildUser({ firstName: null, lastName: null, primaryEmailAddress: null }),
      );

      expect(profile.initials).toBe('');
    });

    it('uppercases initials derived from lowercase names', () => {
      const profile = toAccountProfile(buildUser({ firstName: 'ana', lastName: 'torres' }));

      expect(profile.initials).toBe('AT');
    });

    it('trims surrounding whitespace before taking the first letter', () => {
      const profile = toAccountProfile(buildUser({ firstName: '  Carlos', lastName: '  ' }));

      expect(profile.initials).toBe('C');
    });
  });
});
