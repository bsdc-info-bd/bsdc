import { describe, expect, it } from 'vitest';
import {
  APP_ROLES,
  bootstrapOwnerEmails,
  bootstrapOwnerRole,
  buildClaims,
  BOOTSTRAP_OWNER_EMAILS,
  credentialsFor,
  isAppRole,
  isStaffRole,
  ownersFor,
  parseOwners,
  PG_AUTHENTICATED_ROLE,
  signedAppRole,
  selfBootstrapRole,
  targetFromAudience,
  toClaimsRequest,
  verifiedEmail,
  type ClaimsEnv,
} from '../../functions/api/auth/claims-core';
import { readClaims } from '@/lib/auth/session-claims';

const env: ClaimsEnv = {
  FB_PROJECT_ID: 'bsdc-bd',
  FB_CLIENT_EMAIL: 'sa@bsdc-bd.iam.gserviceaccount.com',
  FB_PRIVATE_KEY: 'pem-one',
  FB2_PROJECT_ID: 'bsdc-second',
  FB2_CLIENT_EMAIL: 'sa@bsdc-second.iam.gserviceaccount.com',
  FB2_PRIVATE_KEY: 'pem-two',
  BSDC_OWNER_UIDS: 'owner-a, owner-b',
  BSDC2_OWNER_UIDS: 'console-owner',
};

describe('buildClaims', () => {
  it('always puts "authenticated" in role, never an application role', () => {
    for (const appRole of APP_ROLES) {
      const claims = buildClaims(appRole);
      expect(claims.role).toBe(PG_AUTHENTICATED_ROLE);
      expect(claims.role).not.toBe(appRole);
    }
  });

  it('carries the application role in bsdc_role', () => {
    expect(buildClaims('vendor').bsdc_role).toBe('vendor');
    expect(buildClaims('member').bsdc_role).toBe('member');
    expect(buildClaims('admin').bsdc_role).toBe('admin');
  });

  it('derives staff and vendor from the role unless explicitly overridden', () => {
    expect(buildClaims('member')).toMatchObject({ staff: false, vendor: false });
    expect(buildClaims('moderator')).toMatchObject({ staff: true, vendor: false });
    expect(buildClaims('owner')).toMatchObject({ staff: true, vendor: false });
    expect(buildClaims('vendor')).toMatchObject({ staff: false, vendor: true });
    expect(buildClaims('member', true, true)).toMatchObject({ staff: true, vendor: true });
  });

  it('round-trips through the client: minted claims read back as the same role', () => {
    for (const appRole of APP_ROLES) {
      const read = readClaims(buildClaims(appRole) as unknown as Record<string, unknown>);
      expect(read.role).toBe(appRole);
    }
  });

  it('never lets PostgREST\'s "authenticated" leak into the UI as an app role', () => {
    const read = readClaims(buildClaims('creator') as unknown as Record<string, unknown>);
    expect(read.role).toBe('creator');
  });
});

describe('readClaims', () => {
  it('reads bsdc_role from a freshly minted token', () => {
    expect(readClaims({ role: 'authenticated', bsdc_role: 'admin', staff: true })).toEqual({
      role: 'admin',
      vendor: false,
      staff: true,
    });
  });

  it('still honours a legacy token whose role slot held the application role', () => {
    expect(readClaims({ role: 'moderator', staff: true })).toEqual({
      role: 'moderator',
      vendor: false,
      staff: true,
    });
  });

  it('falls back to member for a token with no usable role', () => {
    expect(readClaims({ role: 'authenticated' })).toEqual({
      role: 'member',
      vendor: false,
      staff: false,
    });
    expect(readClaims({})).toEqual({ role: 'member', vendor: false, staff: false });
  });
});

describe('signedAppRole', () => {
  it('uses the current claim, repairs a legacy claim, and defaults new users to member', () => {
    expect(signedAppRole({ role: 'authenticated', bsdc_role: 'vendor' })).toBe('vendor');
    expect(signedAppRole({ role: 'moderator' })).toBe('moderator');
    expect(signedAppRole({ role: 'authenticated' })).toBe('member');
    expect(signedAppRole({})).toBe('member');
  });
});

describe('selfBootstrapRole', () => {
  it('allows only an own-account claim repair matching the signed application role', () => {
    expect(
      selfBootstrapRole(
        'u1',
        { role: 'authenticated' },
        {
          uid: 'u1',
          role: 'member',
          vendor: false,
          staff: false,
        },
      ),
    ).toBe('member');
    expect(
      selfBootstrapRole(
        'u1',
        { role: 'admin' },
        {
          uid: 'u1',
          role: 'admin',
          vendor: false,
          staff: false,
        },
      ),
    ).toBe('admin');
  });

  it('refuses a different account, a requested privilege, or an attempted escalation', () => {
    const claims = { role: 'authenticated' };
    expect(
      selfBootstrapRole('u1', claims, { uid: 'u2', role: 'member', vendor: false, staff: false }),
    ).toBeNull();
    expect(
      selfBootstrapRole('u1', claims, { uid: 'u1', role: 'admin', vendor: false, staff: false }),
    ).toBeNull();
    expect(
      selfBootstrapRole('u1', claims, { uid: 'u1', role: 'member', vendor: true, staff: false }),
    ).toBeNull();
  });
});

describe('isAppRole / isStaffRole', () => {
  it('accepts only the known application roles', () => {
    for (const role of APP_ROLES) expect(isAppRole(role)).toBe(true);
    for (const bad of ['authenticated', 'anon', 'service_role', 'superadmin', '', 7, null]) {
      expect(isAppRole(bad)).toBe(false);
    }
  });

  it('marks moderator and above as staff', () => {
    expect(isStaffRole('member')).toBe(false);
    expect(isStaffRole('vendor')).toBe(false);
    expect(isStaffRole('moderator')).toBe(true);
    expect(isStaffRole('owner')).toBe(true);
  });
});

describe('parseOwners', () => {
  it('splits, trims and drops empties', () => {
    expect(parseOwners(' a , b ,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseOwners('')).toEqual([]);
    expect(parseOwners(undefined)).toEqual([]);
  });
});

describe('two-project separation', () => {
  it('selects the project from the token audience', () => {
    expect(targetFromAudience(env, 'bsdc-bd')).toBe('main');
    expect(targetFromAudience(env, 'bsdc-second')).toBe('second');
    expect(targetFromAudience(env, 'bsdc-other')).toBeNull();
    expect(targetFromAudience(env, '')).toBeNull();
  });

  it('resolves the matching service account for each project', () => {
    expect(credentialsFor(env, 'main')).toEqual({
      projectId: 'bsdc-bd',
      clientEmail: 'sa@bsdc-bd.iam.gserviceaccount.com',
      privateKey: 'pem-one',
    });
    expect(credentialsFor(env, 'second')).toEqual({
      projectId: 'bsdc-second',
      clientEmail: 'sa@bsdc-second.iam.gserviceaccount.com',
      privateKey: 'pem-two',
    });
    expect(credentialsFor({}, 'main')).toBeNull();
    expect(credentialsFor({ FB_PROJECT_ID: 'bsdc-bd' }, 'main')).toBeNull();
  });

  it('guards each project with its own owner list', () => {
    expect(ownersFor(env, 'main')).toEqual(['owner-a', 'owner-b']);
    expect(ownersFor(env, 'second')).toEqual(['console-owner']);
    // A member-project owner is not automatically a console owner.
    expect(ownersFor(env, 'second')).not.toContain('owner-a');
  });
});

describe('toClaimsRequest', () => {
  it('accepts a well-formed request', () => {
    expect(toClaimsRequest({ uid: 'u1', role: 'vendor', vendor: true, staff: false })).toEqual({
      uid: 'u1',
      role: 'vendor',
      vendor: true,
      staff: false,
    });
  });

  it('rejects a missing uid or a role that is not an application role', () => {
    expect(toClaimsRequest({ role: 'vendor' })).toBeNull();
    expect(toClaimsRequest({ uid: '', role: 'vendor' })).toBeNull();
    // 'authenticated' is a Postgres role, not something anyone may be granted.
    expect(toClaimsRequest({ uid: 'u1', role: 'authenticated' })).toBeNull();
    expect(toClaimsRequest({ uid: 'u1', role: 'superadmin' })).toBeNull();
    expect(toClaimsRequest('not-an-object')).toBeNull();
    expect(toClaimsRequest(null)).toBeNull();
  });
});

describe('the first administrator, by verified address', () => {
  const request = { uid: 'rrc-uid', role: 'owner' as const, vendor: false, staff: false };

  it("names the platform's main administrator by default", () => {
    expect(BOOTSTRAP_OWNER_EMAILS).toContain('rrc@bsdc.info.bd');
    expect(bootstrapOwnerEmails(env)).toEqual([...BOOTSTRAP_OWNER_EMAILS]);
  });

  it('lets a configured list replace the built-in one', () => {
    const configured = bootstrapOwnerEmails({
      ...env,
      BSDC_BOOTSTRAP_OWNER_EMAILS: ' Boss@Example.com ,second@bsdc.info.bd',
    });
    expect(configured).toEqual(['boss@example.com', 'second@bsdc.info.bd']);
  });

  it("mints owner for the caller's own uid when the token proves the address", () => {
    const token = { sub: 'rrc-uid', email: 'rrc@bsdc.info.bd', email_verified: true };
    expect(bootstrapOwnerRole(env, 'rrc-uid', token, request)).toBe('owner');
  });

  it('accepts a federated sign-in, whose token may not carry email_verified', () => {
    const token = {
      sub: 'rrc-uid',
      email: 'RRC@bsdc.info.bd',
      firebase: { sign_in_provider: 'google.com' },
    };
    expect(bootstrapOwnerRole(env, 'rrc-uid', token, request)).toBe('owner');
  });

  it('refuses an address nobody proved: signing up is not receiving mail', () => {
    const token = {
      sub: 'impostor',
      email: 'rrc@bsdc.info.bd',
      email_verified: false,
      firebase: { sign_in_provider: 'password' },
    };
    expect(verifiedEmail(token)).toBeNull();
    expect(bootstrapOwnerRole(env, 'impostor', token, request)).toBeNull();
  });

  it('refuses to elevate somebody else, whatever the address', () => {
    const token = { sub: 'rrc-uid', email: 'rrc@bsdc.info.bd', email_verified: true };
    expect(
      bootstrapOwnerRole(env, 'rrc-uid', token, { ...request, uid: 'somebody-else' }),
    ).toBeNull();
  });

  it('refuses an address that is not on the list', () => {
    const token = { sub: 'member', email: 'member@bsdc.info.bd', email_verified: true };
    expect(bootstrapOwnerRole(env, 'member', token, { ...request, uid: 'member' })).toBeNull();
  });

  it('grants admin as well as owner, and nothing below either', () => {
    const token = { sub: 'rrc-uid', email: 'rrc@bsdc.info.bd', email_verified: true };
    expect(bootstrapOwnerRole(env, 'rrc-uid', token, { ...request, role: 'admin' })).toBe('admin');
    expect(bootstrapOwnerRole(env, 'rrc-uid', token, { ...request, role: 'moderator' })).toBeNull();
  });

  it('carries staff, because buildClaims derives it from the rank', () => {
    const token = { sub: 'rrc-uid', email: 'rrc@bsdc.info.bd', email_verified: true };
    const role = bootstrapOwnerRole(env, 'rrc-uid', token, request);
    expect(role).not.toBeNull();
    expect(buildClaims(role ?? 'member').staff).toBe(true);
  });
});
