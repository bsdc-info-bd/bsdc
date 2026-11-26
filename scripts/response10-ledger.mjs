#!/usr/bin/env node
/**
 * Generate the Response 10 execution ledger and six-gate acceptance matrix
 * from the canonical inventories in docs/admin-suite-master-plan.md.
 *
 * The generator intentionally does not infer delivery from code presence or
 * prior response summaries. Only a separately reviewed, linked evidence record
 * may change a gate from UNVERIFIED.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'docs/admin-suite-master-plan.md');
const outputPath = path.join(root, 'docs/admin-suite-feature-ledger.md');
const evidencePath = path.join(root, 'docs/response10-evidence.json');
const check = process.argv.includes('--check');
const source = await readFile(sourcePath, 'utf8');
const evidenceDocument = JSON.parse(await readFile(evidencePath, 'utf8'));
if (
  evidenceDocument.version !== 1 ||
  !evidenceDocument.evidence ||
  typeof evidenceDocument.evidence !== 'object' ||
  Array.isArray(evidenceDocument.evidence)
) {
  throw new Error('Evidence file must have version: 1 and an evidence object');
}
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing source section: ${start}`);
  return source.slice(from, to);
};
const parseRows = (text, label) => {
  const rows = new Map();
  for (const line of text.split('\n')) {
    const match = line.match(/^\|\s*`(A-\d{3,4})`\s*\|\s*(.*?)\s*\|$/);
    if (!match) continue;
    const cells = match[2].split('|').map((cell) => cell.trim());
    if (rows.has(match[1])) throw new Error(`${label}: duplicate ${match[1]}`);
    rows.set(match[1], cells);
  }
  return rows;
};
const inventory = section('### 3.1 The inventory itself', '### 3.2 How a feature is declared done');
const implementation = section('## 67. Feature-by-feature implementation notes', '## 68.');
const inventoryRows = parseRows(inventory, 'Inventory');
const implementationRows = parseRows(implementation, 'Implementation notes');
if (inventoryRows.size !== 1013 || implementationRows.size !== 1013) {
  throw new Error(
    `Expected 1,013 inventory and implementation rows; got ${inventoryRows.size} and ${implementationRows.size}`,
  );
}
for (let id = 1; id <= 1013; id += 1) {
  const key = `A-${String(id).padStart(3, '0')}`;
  if (!inventoryRows.has(key) || !implementationRows.has(key))
    throw new Error(`Missing sequential feature ${key}`);
}
for (const id of implementationRows.keys()) {
  if (!inventoryRows.has(id)) throw new Error(`Implementation row ${id} has no inventory row`);
}

const countByTier = new Map([
  [1, 0],
  [2, 0],
  [3, 0],
]);
const countByArea = new Map();
const declaredAreaCounts = new Map();
const features = [];
let area = '';
for (const line of inventory.split('\n')) {
  const heading = line.match(/^#### (.+?) — (\d+) features/);
  if (heading) {
    area = heading[1];
    declaredAreaCounts.set(area, Number(heading[2]));
  }
  const match = line.match(/^\|\s*`(A-\d{3,4})`\s*\|\s*([123])\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/);
  if (!match) continue;
  const [, id, tierText, name, acceptance] = match;
  const tier = Number(tierText);
  countByTier.set(tier, countByTier.get(tier) + 1);
  countByArea.set(area, (countByArea.get(area) ?? 0) + 1);
  const notes = implementationRows.get(id);
  if (!notes || notes.length !== 3)
    throw new Error(`${id}: expected Where, Done when, Proved by in §67`);
  features.push({
    id,
    tier,
    area,
    name,
    acceptance,
    where: notes[0],
    done: notes[1],
    proof: notes[2],
  });
}
for (const [areaName, expected] of declaredAreaCounts) {
  const actual = countByArea.get(areaName) ?? 0;
  if (actual !== expected)
    throw new Error(`${areaName}: heading declares ${expected} features, parsed ${actual}`);
}
if (Array.from(countByArea.values()).reduce((sum, value) => sum + value, 0) !== 1013)
  throw new Error('Inventory group counts do not sum to 1,013');
const expectedTiers = new Map([
  [1, 428],
  [2, 467],
  [3, 118],
]);
for (const [tier, expected] of expectedTiers) {
  if (countByTier.get(tier) !== expected)
    throw new Error(`Tier ${tier}: expected ${expected}, got ${countByTier.get(tier)}`);
}
if (features.length !== 1013)
  throw new Error(`Parsed ${features.length} feature rows, expected 1,013`);

const featureIds = new Set(features.map((feature) => feature.id));
const gateNames = ['rule', 'authority', 'screen', 'proof', 'audit', 'copy'];
const isoDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const validateReference = async (reference, key) => {
  if (/^https:\/\//.test(reference)) {
    try {
      new URL(reference);
    } catch {
      throw new Error(`${key}: reference must be a valid HTTPS URL or repository-relative file`);
    }
    return;
  }
  if (path.isAbsolute(reference) || reference.split(/[\\/]/).includes('..'))
    throw new Error(`${key}: reference must not escape the repository`);
  const resolved = path.resolve(root, reference);
  if (!resolved.startsWith(`${root}${path.sep}`))
    throw new Error(`${key}: reference must stay inside the repository`);
  try {
    await access(resolved);
  } catch {
    throw new Error(`${key}: evidence file does not exist: ${reference}`);
  }
};
for (const [key, record] of Object.entries(evidenceDocument.evidence)) {
  const match = key.match(/^(A-\d{3,4})\.(rule|authority|screen|proof|audit|copy)$/);
  if (!match || !featureIds.has(match[1])) throw new Error(`Unknown evidence key: ${key}`);
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw new Error(`${key}: evidence record must be an object`);
  if (record.status === 'verified') {
    if (typeof record.reference !== 'string' || !record.reference.trim())
      throw new Error(`${key}: verified requires reference`);
    await validateReference(record.reference, key);
    if (typeof record.commit !== 'string' || !/^[0-9a-f]{40}$/i.test(record.commit))
      throw new Error(`${key}: verified requires a full 40-character commit SHA`);
    if (typeof record.reviewer !== 'string' || !record.reviewer.trim())
      throw new Error(`${key}: verified requires reviewer`);
    if (!isoDate(record.reviewed)) throw new Error(`${key}: verified requires reviewed YYYY-MM-DD`);
  } else if (record.status === 'blocked') {
    for (const field of ['reason', 'owner'])
      if (typeof record[field] !== 'string' || !record[field].trim())
        throw new Error(`${key}: blocked requires ${field}`);
    if (!isoDate(record.next_review))
      throw new Error(`${key}: blocked requires next_review YYYY-MM-DD`);
  } else {
    throw new Error(`${key}: status must be verified or blocked; omit unverified entries`);
  }
}

const batches = [
  {
    name: '1 · Kit primitives and platform services',
    match: (f) => f.area === 'Kit primitives and platform services',
  },
  {
    name: '2 · Security spine',
    match: (f) => f.area.startsWith('Security:') || f.area === 'Security hardening',
  },
  { name: '3 · admin-site command deck', match: (f) => f.area === 'admin-site — command deck' },
  {
    name: '4 · People and safety',
    match: (f) =>
      f.area === 'People and safety (cross-console)' ||
      ['bsdc-uadmin', 'bsdc-umod', 'bsdc-mod'].includes(f.area),
  },
  {
    name: '5 · Documents',
    match: (f) =>
      f.area === 'Documents: certificates and notices' ||
      ['bsdc-cert', 'bsdc-notice'].includes(f.area),
  },
  {
    name: '6 · Runtime and edge',
    match: (f) =>
      f.area === 'Runtime: config, custom pages, IP, integrations' ||
      ['bsdc-config', 'bsdc-custom', 'bsdc-ip'].includes(f.area),
  },
  {
    name: '7 · Signal',
    match: (f) =>
      f.area === 'Signal: vitals, incidents, verification' ||
      ['bsdc-perf', 'bsdc-connect', 'bsdc-status', 'bsdc-vf'].includes(f.area),
  },
  {
    name: '8 · Cross-cutting craft',
    match: (f) =>
      f.area === 'Craft: interface, accessibility, language, mobile' ||
      f.area === 'Communication craft' ||
      f.area === 'Editor craft',
  },
  { name: '9 · Hardening, proof, and remaining operational scope', match: () => true },
];
for (const feature of features) {
  feature.batch = batches.find((batch) => batch.match(feature))?.name;
  if (!feature.batch) throw new Error(`${feature.id}: not assigned to a batch`);
  feature.gates = Object.fromEntries(
    gateNames.map((gate) => [
      gate,
      evidenceDocument.evidence[`${feature.id}.${gate}`]?.status ?? 'unverified',
    ]),
  );
  const values = Object.values(feature.gates);
  feature.state = values.every((status) => status === 'verified')
    ? 'VERIFIED'
    : values.includes('blocked')
      ? 'BLOCKED'
      : 'UNVERIFIED';
}
const gateCounts = Object.fromEntries(
  ['verified', 'blocked', 'unverified'].map((status) => [
    status,
    features.reduce(
      (total, feature) =>
        total + Object.values(feature.gates).filter((value) => value === status).length,
      0,
    ),
  ]),
);
const stateCounts = Object.fromEntries(
  ['VERIFIED', 'BLOCKED', 'UNVERIFIED'].map((status) => [
    status,
    features.filter((feature) => feature.state === status).length,
  ]),
);

const esc = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const batchCounts = batches.map((batch) => [
  batch.name,
  features.filter((f) => f.batch === batch.name).length,
]);
const tierSummary = [1, 2, 3].map((tier) => `T${tier}: **${countByTier.get(tier)}**`).join(' · ');
const gates = ['Rule', 'Authority', 'Screen', 'Proof', 'Audit', 'Copy'];
const lines = [
  '<!-- Generated by `node scripts/response10-ledger.mjs`; edit source inventories, not this file. -->',
  '# Response 10 — Execution ledger and acceptance matrix',
  '',
  '> **Evidence boundary:** this is a generated planning baseline, not a delivery attestation. `UNVERIFIED` means this ledger has no feature-specific evidence link reviewed against the stated acceptance criterion. Existing code, prior response summaries, successful shared-shell tests, or a build alone do not change that state.',
  '',
  '## Ledger summary',
  '',
  `- Inventory: **${features.length} unique features** (${tierSummary}).`,
  `- Acceptance gate states: **${gateCounts.verified} VERIFIED**, **${gateCounts.blocked} BLOCKED**, **${gateCounts.unverified} UNVERIFIED** of ${features.length * gates.length}.`,
  `- Feature row states: **${stateCounts.VERIFIED} VERIFIED**, **${stateCounts.BLOCKED} BLOCKED**, **${stateCounts.UNVERIFIED} UNVERIFIED** of ${features.length}. A row closes only when all six gates have reviewed evidence.`,
  '- Sparse evidence source: `response10-evidence.json`. Omitted feature/gate keys remain UNVERIFIED; the generator rejects unknown IDs, malformed statuses, or incomplete evidence records.',
  '- Source-of-truth inventories: §3.1 (ID, tier, feature, acceptance) and §67 (implementation target, completion condition, proof method) of `admin-suite-master-plan.md`.',
  '- Count checks are strict: unique contiguous IDs `A-001`–`A-1013`, matching rows in both inventories, declared area totals, expected tier totals, and no missing implementation mapping.',
  '',
  '### Feature count by inventory group / console scope',
  '',
  '| Inventory group | Total | Verified | Blocked | Unverified |',
  '|---|---:|---:|---:|---:|',
  ...Array.from(countByArea, ([areaName, total]) => {
    const group = features.filter((feature) => feature.area === areaName);
    return `| ${esc(areaName)} | ${total} | ${group.filter((feature) => feature.state === 'VERIFIED').length} | ${group.filter((feature) => feature.state === 'BLOCKED').length} | ${group.filter((feature) => feature.state === 'UNVERIFIED').length} |`;
  }),
  `| **Total** | **${features.length}** | **${stateCounts.VERIFIED}** | **${stateCounts.BLOCKED}** | **${stateCounts.UNVERIFIED}** |`,
  '',
  '## Batch order and merge gates',
  '',
  'Execute sequentially in the dependency order below. A batch is not accepted as delivered until its scope is mapped to IDs, every affected six-gate row is VERIFIED, regression suites pass, and evidence is linked from the ledger. BLOCKED or UNVERIFIED gates may be carried only as explicit unfinished scope; they never count as delivered. Do not mark planned work delivered merely because the batch branch merges.',
  '',
  '| Order | Batch | Features | Entry/dependency | Exit gate |',
  '|---:|---|---:|---|---|',
  ...batches.map((batch, index) => {
    const count = batchCounts[index][1];
    const entry =
      index === 0
        ? 'Inventory reconciled; no unresolved ID changes'
        : `Prior batch ${index} accepted; shared interfaces and migrations reviewed`;
    const exit =
      index === 8
        ? 'All relevant unit, contract, DB, browser, audit and release gates pass; residuals have owners and dates'
        : 'Schema/RPC → pure rules → screen → en/bn copy → browser proof; additive migrations and rollback reviewed';
    return `| ${index + 1} | ${esc(batch.name)} | ${count} | ${entry} | ${exit} |`;
  }),
  '',
  'Within each batch, follow §15.1 ordering: schema and RPCs, pure rules with tests, screen, both locales, then browser test. Security-sensitive schema changes must additionally prove permission denial, audit behavior, and rollback. Cross-batch dependencies are reviewed before implementation; no feature may bypass an earlier dependency by being moved forward.',
  '',
  '### Required release gates',
  '',
  '1. **Inventory integrity:** generator `--check` passes; every feature ID is unique and represented in the implementation notes.',
  '2. **Code quality:** affected package typecheck, lint/format, unit/contract tests and production build pass with no new warnings.',
  '3. **Authority and data:** permission/RLS negative tests, audit assertions, migration proof, and rollback evidence for changes that touch these boundaries.',
  '4. **User path:** both `en` and `bn`, both themes where applicable, keyboard/mobile states, and browser tests for the acceptance path.',
  '5. **Operations:** measured performance/bundle budgets, release smoke, runbooks and on-call ownership for the changed capability.',
  '6. **Review:** evidence links name immutable CI run/artifact or test file plus commit SHA; reviewer records date and scope. A green unrelated suite is not evidence for a feature.',
  '',
  '## Acceptance matrix',
  '',
  'Each cell is an evidence gate from §15.2, not a design checkbox. A gate may be marked `VERIFIED` only with a stable evidence reference, commit SHA, and reviewer recorded in the change that updates this generated baseline. `BLOCKED` must include a reason, owner and next review date. `UNVERIFIED` is the conservative default.',
  '',
  '| ID | Batch | Tier | Rule | Authority | Screen | Proof | Audit | Copy | State |',
  '|---|---:|---:|---|---|---|---|---|---|---|',
  ...features.map(
    (f) =>
      `| ${f.id} | ${batches.findIndex((b) => b.name === f.batch) + 1} | T${f.tier} | ${f.gates.rule.toUpperCase()} | ${f.gates.authority.toUpperCase()} | ${f.gates.screen.toUpperCase()} | ${f.gates.proof.toUpperCase()} | ${f.gates.audit.toUpperCase()} | ${f.gates.copy.toUpperCase()} | ${f.state} |`,
  ),
  '',
  '## Evidence register',
  '',
  'Only explicit records in `response10-evidence.json` appear here. A verified record includes its commit, evidence reference, reviewer and review date; a blocked record includes its reason, owner and next review date. An empty register is not evidence of completion.',
  '',
  '| Feature | Gate | Status | Evidence / reason | Commit | Reviewer / owner | Reviewed / next review |',
  '|---|---|---|---|---|---|---|',
  ...Object.entries(evidenceDocument.evidence)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, record]) => {
      const [id, gate] = key.split('.');
      return record.status === 'verified'
        ? `| ${id} | ${gate} | VERIFIED | ${esc(record.reference)} | ${record.commit} | ${esc(record.reviewer)} | ${record.reviewed} |`
        : `| ${id} | ${gate} | BLOCKED | ${esc(record.reason)} | — | ${esc(record.owner)} | Next: ${record.next_review} |`;
    }),
  '',
  '## Feature ledger',
  '',
  'The acceptance text below is copied from the canonical inventory. §67 supplies the mapped implementation locus and proof method. Neither description is evidence that the behavior has shipped.',
  '',
  '| ID | Batch | Tier | Area | Feature | Acceptance criterion (§3.1) | Completion condition (§67) | Implementation target (§67) | Proof method (§67) | State |',
  '|---|---:|---:|---|---|---|---|---|---|---|',
  ...features.map(
    (f) =>
      `| ${f.id} | ${batches.findIndex((b) => b.name === f.batch) + 1} | T${f.tier} | ${esc(f.area)} | ${esc(f.name)} | ${esc(f.acceptance)} | ${esc(f.done)} | ${esc(f.where)} | ${esc(f.proof)} | ${f.state} |`,
  ),
  '',
  '## Risk register',
  '',
  '| ID | Risk / trigger | Likelihood / impact | Owner (role) | Prevention and detection | Contingency / closure evidence |',
  '|---|---|---|---|---|---|',
  '| R1 | Permission regression locks out staff; detected by grant snapshot or denied legitimate workflow | Low / Severe | Security owner + on-call lead | Reviewed permission diff; negative/positive authorization tests; monitor denied-call rate | Use documented break-glass recovery; restore reviewed grants; record timed drill and verified staff access |',
  '| R2 | Migration blocks writes or corrupts state under production load | Medium / Severe | Database owner | Additive migration; production-shaped dry run; write-path tests; lock/plan review | Stop/rollback using rehearsed procedure; verify writes and reconciliation; attach migration and rollback proof |',
  '| R3 | Inventory drift or scope creep makes delivery estimates meaningless | High / High | Product owner + release manager | CI enforces generated counts, unique IDs and explicit batch assignment; weekly ledger delta review | Freeze batch; propose new ID/tier/acceptance change through review; publish revised counts and decision |',
  '| R4 | Evidence is overstated because shared foundation or build success is mistaken for feature acceptance | High / High | QA owner | Default every gate to UNVERIFIED; require feature-level evidence link, SHA and reviewer | Revert unsupported status to UNVERIFIED; audit affected rows and communicate correction |',
  '| R5 | Bengali/English parity or long-string layout regresses | Medium / High | Localization owner + design-system owner | Key parity tests, representative long-string and numeral checks, both-language browser coverage | Hold release or disable affected surface; correct translations/layout and rerun both locales |',
  '| R6 | Accessibility/mobile behavior fails beyond the tested initial screen | Medium / High | Accessibility owner | Route/state inventory; keyboard, zoom, contrast and narrow viewport checks at route level | Block affected routes; provide accessible alternative only through approved exception with owner/date |',
  '| R7 | Six-call/query or bundle/performance budgets regress on an unmeasured console/route | Medium / Medium | Performance owner | Per-console and route-level measurements, CI ratchet, representative data sizes | Revert or split expensive change; attach measured baseline and passing rerun |',
  '| R8 | Cross-console RPC migration produces inconsistent fallback, stale data, or unsafe retries | Medium / Severe | Platform/API owner | Contract compatibility tests, idempotency classification, timeout/heartbeat tests and staged rollout | Disable new path using documented switch; restore known-good client; reconcile writes before retry |',
  '| R9 | Release or rollback leaves operators on incompatible assets/schema | Medium / Severe | Release manager + on-call lead | Deploy smoke, stale-build test, additive schema compatibility, deploy marker and rollback drill | Roll back app/schema-compatible release; verify health endpoints and operator workflow; incident review |',
  '| R10 | Unowned runbook, alert, or residual makes a technically green batch operationally unsafe | Medium / High | Operations owner | Every destructive operation and alert has named role owner, runbook, drill date and escalation | Do not declare batch accepted; assign owner and due date; document explicit risk acceptance if unavoidable |',
  '',
  'Likelihood and impact are qualitative planning assessments, not telemetry-derived probabilities. Owners are accountable roles, not assigned individuals; each batch kickoff must name the responsible person and deputy. Reassess risk at batch entry, before release, and after incidents.',
  '',
  '## Completion and change control',
  '',
  '- A feature is **verified** only when all six matrix gates are VERIFIED and the feature-specific acceptance criterion is met. A partial implementation remains partial; blocked work is not delivered.',
  '- Evidence record format: `gate=status; evidence=<repo path or immutable CI URL>; commit=<full SHA>; reviewer=<name/role>; reviewed=<YYYY-MM-DD>`. For BLOCKED, also require `owner` and `next_review`.',
  '- Status changes are reviewed edits to `docs/response10-evidence.json`; regenerate this file and run `node scripts/response10-ledger.mjs --check`. Never hand-edit generated rows. The generator validates each evidence record before rendering.',
  '- A changed criterion, split/combined feature, or added feature requires a reviewed inventory change, unique ID policy, updated batch, regenerated counts, and a documented compatibility note. Do not silently renumber existing IDs.',
  `- Current ledger state: **${stateCounts.VERIFIED} fully verified; ${stateCounts.BLOCKED} blocked; ${stateCounts.UNVERIFIED} unverified**. Response 9 evidence remains scoped to shared shell/initial screen and its recorded gates; it does not close all §14 or feature-level acceptance.`,
  '',
].join('\n');

if (check) {
  let existing;
  try {
    existing = await readFile(outputPath, 'utf8');
  } catch {
    throw new Error(
      `Generated ledger missing: ${path.relative(root, outputPath)}; run without --check`,
    );
  }
  if (existing !== lines)
    throw new Error(
      `${path.relative(root, outputPath)} is stale; run node scripts/response10-ledger.mjs`,
    );
  console.log(
    `Response 10 ledger is current: ${features.length} features, ${features.length * gates.length} acceptance gates.`,
  );
} else {
  await writeFile(outputPath, lines);
  console.log(
    `Generated ${path.relative(root, outputPath)}: ${features.length} features, ${features.length * gates.length} acceptance gates.`,
  );
}
