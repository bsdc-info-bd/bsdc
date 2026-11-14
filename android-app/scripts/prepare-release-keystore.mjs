#!/usr/bin/env node
/**
 * Decodes and validates the Android release signing keystore (`ANDROID_KEYSTORE_BASE64`)
 * for CI before Gradle runs `:app:assembleRelease` / `:app:bundleRelease`.
 *
 * Normalizes common secret formatting issues (whitespace/newlines, URL-safe base64,
 * missing padding, double-encoded base64, empty `ANDROID_KEY_PASSWORD` defaulting to
 * `ANDROID_KEYSTORE_PASSWORD`, and single-alias / case-insensitive alias matching),
 * then verifies private-key access using JDK's `java.security.KeyStore`.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function decodeBase64Keystore(rawInput) {
  let cleaned = rawInput.trim();
  const dataUri = cleaned.match(/^data:[^;]+;base64,([\s\S]+)$/i);
  if (dataUri) cleaned = dataUri[1];
  cleaned = cleaned.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (cleaned.length % 4 !== 0) cleaned += '=';

  let bytes = Buffer.from(cleaned, 'base64');
  if (bytes.length < 32) {
    throw new Error(`Decoded keystore is unexpectedly small (${bytes.length} bytes).`);
  }

  // Detect JKS (0xFE 0xED 0xFE 0xED) or PKCS12 ASN.1 SEQUENCE (0x30).
  const looksBinaryKeystore = (buf) =>
    buf.length >= 4 &&
    ((buf[0] === 0xfe && buf[1] === 0xed && buf[2] === 0xfe && buf[3] === 0xed) ||
      buf[0] === 0x30);

  if (!looksBinaryKeystore(bytes)) {
    const asAscii = bytes.toString('utf8').replace(/\s+/g, '');
    if (/^[A-Za-z0-9+/_-]+=*$/.test(asAscii) && asAscii.length > 32) {
      let norm = asAscii.replace(/-/g, '+').replace(/_/g, '/');
      while (norm.length % 4 !== 0) norm += '=';
      const inner = Buffer.from(norm, 'base64');
      if (looksBinaryKeystore(inner)) {
        bytes = inner;
      }
    }
  }

  return bytes;
}

const JAVA_CHECKER = `
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class CheckKeystore {
  public static void main(String[] args) throws Exception {
    String path = System.getenv("BSDC_CHECK_PATH");
    String storePass = orEmpty(System.getenv("BSDC_CHECK_STORE_PASS"));
    String storePassTrimmed = stripTrailingNewlines(storePass);
    String rawAlias = orEmpty(System.getenv("BSDC_CHECK_ALIAS"));
    String rawKeyPass = orEmpty(System.getenv("BSDC_CHECK_KEY_PASS"));
    String rawKeyPassTrimmed = stripTrailingNewlines(rawKeyPass);

    File ksFile = new File(path);
    KeyStore ks = null;
    String resolvedStorePass = storePass;
    Exception lastStoreErr = null;
    for (String candidate : uniqueNonEmpty(storePass, storePassTrimmed)) {
      try {
        ks = KeyStore.getInstance(ksFile, candidate.toCharArray());
        resolvedStorePass = candidate;
        break;
      } catch (Exception e) {
        lastStoreErr = e;
      }
    }
    if (ks == null) {
      System.err.println("STORE_OPEN_FAILED:" + (lastStoreErr != null ? lastStoreErr.getClass().getSimpleName() + ": " + lastStoreErr.getMessage() : "empty password"));
      System.exit(2);
    }

    List<String> keyAliases = new ArrayList<>();
    for (String a : Collections.list(ks.aliases())) {
      if (ks.isKeyEntry(a)) keyAliases.add(a);
    }
    if (keyAliases.isEmpty()) {
      System.err.println("NO_PRIVATE_KEYS:Keystore contains zero PrivateKeyEntry items.");
      System.exit(3);
    }

    String resolvedAlias = null;
    String wantedAlias = rawAlias.trim();
    if (wantedAlias.isEmpty()) {
      if (keyAliases.size() == 1) {
        resolvedAlias = keyAliases.get(0);
      } else {
        System.err.println("ALIAS_REQUIRED:ANDROID_KEY_ALIAS is empty and keystore has " + keyAliases.size() + " key entries.");
        System.exit(4);
      }
    } else {
      for (String a : keyAliases) {
        if (a.equals(wantedAlias)) {
          resolvedAlias = a;
          break;
        }
      }
      if (resolvedAlias == null) {
        for (String a : keyAliases) {
          if (a.equalsIgnoreCase(wantedAlias)) {
            resolvedAlias = a;
            break;
          }
        }
      }
      if (resolvedAlias == null) {
        System.err.println("ALIAS_NOT_FOUND:Configured ANDROID_KEY_ALIAS did not match any of the " + keyAliases.size() + " key entries in keystore (first alias length=" + keyAliases.get(0).length() + ").");
        System.exit(5);
      }
    }

    String resolvedKeyPass = null;
    Exception lastKeyErr = null;
    List<String> passCandidates = new ArrayList<>();
    for (String p : uniqueNonEmpty(rawKeyPass, rawKeyPassTrimmed, resolvedStorePass)) {
      passCandidates.add(p);
    }
    for (String candidate : passCandidates) {
      try {
        Key k = ks.getKey(resolvedAlias, candidate.toCharArray());
        if (k instanceof PrivateKey) {
          resolvedKeyPass = candidate;
          break;
        }
      } catch (Exception e) {
        lastKeyErr = e;
      }
    }
    if (resolvedKeyPass == null) {
      System.err.println("KEY_READ_FAILED:" + (lastKeyErr != null ? lastKeyErr.getClass().getSimpleName() + ": " + lastKeyErr.getMessage() : "key entry is not a PrivateKey"));
      System.exit(6);
    }

    Certificate cert = ks.getCertificate(resolvedAlias);
    if (cert == null) {
      System.err.println("CERT_MISSING:PrivateKeyEntry has no certificate chain.");
      System.exit(7);
    }

    System.out.println("OK\\t" + ks.getType() + "\\t" + resolvedAlias + "\\t"
      + b64(resolvedStorePass) + "\\t" + b64(resolvedKeyPass));
  }

  private static String orEmpty(String v) {
    return v == null ? "" : v;
  }

  private static String stripTrailingNewlines(String v) {
    return v.replaceAll("[\\r\\n]+$", "");
  }

  private static List<String> uniqueNonEmpty(String... vals) {
    List<String> out = new ArrayList<>();
    for (String v : vals) {
      if (v != null && !v.isEmpty() && !out.contains(v)) out.add(v);
    }
    return out;
  }

  private static String b64(String v) {
    return java.util.Base64.getEncoder().encodeToString(v.getBytes(StandardCharsets.UTF_8));
  }
}
`;

function appendGithubEnv(envFile, key, value) {
  const delimiter = `BSDC_ENV_${key}_${process.pid}`;
  writeFileSync(envFile, `${key}<<${delimiter}\n${value}\n${delimiter}\n`, { flag: 'a' });
}

const rawBase64 = process.env['KEYSTORE'] ?? '';
if (rawBase64.trim() === '') {
  process.stderr.write('::error::ANDROID_KEYSTORE_BASE64 is not set; release build cannot be signed\n');
  process.exit(1);
}

const targetPath = process.env['BSDC_TARGET_KEYSTORE'] || join(tmpdir(), 'bsdc-release.keystore');
const keystoreBytes = decodeBase64Keystore(rawBase64);
writeFileSync(targetPath, keystoreBytes);
chmodSync(targetPath, 0o600);

const work = mkdtempSync(join(tmpdir(), 'bsdc-ks-check-'));
try {
  const javaFile = join(work, 'CheckKeystore.java');
  writeFileSync(javaFile, JAVA_CHECKER);

  const stdout = execFileSync('java', [javaFile], {
    env: {
      ...process.env,
      BSDC_CHECK_PATH: targetPath,
      BSDC_CHECK_STORE_PASS: process.env['RAW_STORE_PASS'] ?? '',
      BSDC_CHECK_ALIAS: process.env['RAW_KEY_ALIAS'] ?? '',
      BSDC_CHECK_KEY_PASS: process.env['RAW_KEY_PASS'] ?? '',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  const [status, ksType, resolvedAlias, storePassB64, keyPassB64] = stdout.split('\t');
  if (status !== 'OK' || !resolvedAlias || !storePassB64 || !keyPassB64) {
    throw new Error(`Unexpected keystore verification output: ${stdout}`);
  }

  const resolvedStorePass = Buffer.from(storePassB64, 'base64').toString('utf8');
  const resolvedKeyPass = Buffer.from(keyPassB64, 'base64').toString('utf8');

  // Mask resolved values in GitHub logs so trimmed/fallback variants cannot leak.
  process.stdout.write(`::add-mask::${resolvedStorePass}\n`);
  process.stdout.write(`::add-mask::${resolvedKeyPass}\n`);

  const githubEnv = process.env['GITHUB_ENV'];
  if (githubEnv) {
    appendGithubEnv(githubEnv, 'BSDC_KEYSTORE_PATH', targetPath);
    appendGithubEnv(githubEnv, 'BSDC_KEYSTORE_PASSWORD', resolvedStorePass);
    appendGithubEnv(githubEnv, 'BSDC_KEY_ALIAS', resolvedAlias);
    appendGithubEnv(githubEnv, 'BSDC_KEY_PASSWORD', resolvedKeyPass);
  }

  process.stdout.write(
    `keystore: verified ${ksType} keystore (${keystoreBytes.length} bytes) with PrivateKeyEntry\n`,
  );
} catch (err) {
  const stderr =
    err && typeof err === 'object' && 'stderr' in err ? String(err.stderr ?? '').trim() : '';
  const detail = stderr || (err instanceof Error ? err.message : String(err));
  process.stderr.write(`::error::Release keystore verification failed: ${detail}\n`);
  process.exit(1);
} finally {
  rmSync(work, { recursive: true, force: true });
}
