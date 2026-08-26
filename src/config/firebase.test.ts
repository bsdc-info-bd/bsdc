/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { describe, expect, it } from 'vitest';
import { firebaseConfigured, getFirebaseConfig } from './firebase';

describe('firebase configuration', () => {
  it('uses the default BSDC Firebase project config when env values are absent', () => {
    const config = getFirebaseConfig();

    expect(config.projectId).toBe('bsdc-bd');
    expect(config.authDomain).toBe('bsdc-bd.firebaseapp.com');
    expect(config.apiKey).toMatch(/^AIza/);
    expect(config.databaseURL).toContain('bsdc-bd-default-rtdb');
  });

  it('marks the project as configured for the shipped app', () => {
    expect(firebaseConfigured).toBe(true);
  });
});
