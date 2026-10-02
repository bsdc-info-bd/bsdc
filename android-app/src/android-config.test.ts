import { describe, expect, it } from 'vitest';
import {
  APP_LINK_HOSTS,
  isPlaceholderConfig,
  placeholderGoogleServices,
  versionFrom,
  withIntentFilters,
  withReleaseSigning,
  withVersion,
  withoutCleartextTraffic,
} from './android-config';

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:usesCleartextTraffic="true">
    <activity android:name=".MainActivity">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`;

const GRADLE = `apply plugin: 'com.android.application'

android {
    namespace "bd.info.bsdc.app"
    defaultConfig {
        applicationId "bd.info.bsdc.app"
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
}
`;

describe('the manifest the native build needs', () => {
  it('claims the https links of every trusted host, and verifies them', () => {
    const patched = withIntentFilters(MANIFEST);
    for (const host of APP_LINK_HOSTS) {
      expect(patched).toContain(`android:host="${host}"`);
    }
    expect(patched).toContain('android:autoVerify="true"');
  });

  it('registers the bsdc scheme without claiming to verify it', () => {
    const patched = withIntentFilters(MANIFEST);
    const schemeFilter = patched.slice(patched.indexOf('android:scheme="bsdc"') - 400);
    expect(patched).toContain('android:scheme="bsdc"');
    // autoVerify belongs to the https filter; a custom scheme cannot be verified.
    expect(schemeFilter.slice(schemeFilter.indexOf('android:scheme="bsdc"'))).not.toContain(
      'autoVerify',
    );
  });

  it('leaves the launcher filter alone', () => {
    expect(withIntentFilters(MANIFEST)).toContain('android.intent.category.LAUNCHER');
  });

  it('is idempotent, because the project is regenerated on every build', () => {
    const once = withIntentFilters(MANIFEST);
    expect(withIntentFilters(once)).toBe(once);
  });

  it('refuses a manifest it does not understand rather than writing nonsense', () => {
    expect(() => withIntentFilters('<manifest></manifest>')).toThrow(/no <activity>/);
  });

  it('turns cleartext traffic off wherever it finds it on', () => {
    expect(withoutCleartextTraffic(MANIFEST)).toContain('android:usesCleartextTraffic="false"');
  });
});

describe('versioning a build', () => {
  it('reads a release version from the tag', () => {
    expect(versionFrom('android-v1.4.0', 87)).toEqual({ code: 87, name: '1.4.0' });
    expect(versionFrom('refs/tags/v2.0.1', 12)).toEqual({ code: 12, name: '2.0.1' });
  });

  it('marks anything that is not a release as a build, so it cannot be mistaken for one', () => {
    expect(versionFrom('main', 42).name).toBe('0.0.0-build.42');
    expect(versionFrom('', 42).name).toBe('0.0.0-build.42');
    expect(versionFrom('android-vnonsense', 42).name).toBe('0.0.0-build.42');
  });

  it('never produces a version code Play would reject', () => {
    expect(versionFrom('main', 0).code).toBe(1);
    expect(versionFrom('main', -3).code).toBe(1);
  });

  it('writes the version into the Gradle file', () => {
    const patched = withVersion(GRADLE, versionFrom('android-v1.4.0', 87));
    expect(patched).toContain('versionCode 87');
    expect(patched).toContain('versionName "1.4.0"');
  });

  it('refuses a Gradle file with nothing to set', () => {
    expect(() => withVersion('android {}', versionFrom('', 1))).toThrow(/versionCode/);
  });
});

describe('signing a release', () => {
  it('reads every credential from the environment, never from the file', () => {
    const patched = withReleaseSigning(GRADLE);
    expect(patched).toContain('System.getenv("BSDC_KEYSTORE_PASSWORD")');
    expect(patched).not.toMatch(/storePassword\s+"/);
  });

  it('points the release build type at the signing configuration', () => {
    expect(withReleaseSigning(GRADLE)).toContain('signingConfig signingConfigs.release');
  });

  it('is idempotent', () => {
    const once = withReleaseSigning(GRADLE);
    expect(withReleaseSigning(once)).toBe(once);
  });
});

describe('the Firebase configuration', () => {
  it('produces something Gradle can parse when no real file exists', () => {
    const placeholder = placeholderGoogleServices('bd.info.bsdc.app');
    expect(() => JSON.parse(placeholder)).not.toThrow();
    expect(placeholder).toContain('bd.info.bsdc.app');
  });

  it('is recognisable as a placeholder, so a release can refuse it', () => {
    expect(isPlaceholderConfig(placeholderGoogleServices('bd.info.bsdc.app'))).toBe(true);
    expect(isPlaceholderConfig('{"project_info":{"project_id":"bsdc-bd"}}')).toBe(false);
  });
});
