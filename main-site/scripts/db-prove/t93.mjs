// The rollout gate's own contract, executed against the schema it guards.
//
// `scripts/wait-for-messenger-migration.mjs` is the query that decides whether a
// member-site bundle is published, and until now nothing but a GitHub runner had ever
// evaluated it: its `--self-test` covers only the plan-matching helper, so the SQL
// could — and did — go false on a perfectly good database. 0132 appended a defaulted
// `p_media_asset` to `send_message_once`, the gate's spelled-out signature stopped
// resolving, and the deploy was refused for a function that had gained an option.
// This file is the gate's unit test: the true case on a current schema, and the false
// cases that prove it is not simply answering `true`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check, makeDb, summary } from './lib.mjs';

const gateSource = readFileSync(
  fileURLToPath(new URL('../../../scripts/wait-for-messenger-migration.mjs', import.meta.url)),
  'utf8',
);
const contract = /const sql = `([\s\S]*?)`;/.exec(gateSource)?.[1];
check(typeof contract === 'string' && contract.length > 200, 'the gate exposes its contract query');

/** The gate reads psql's `-t -A` output, which is the bare word for a boolean. */
const gateSays = async (db) => {
  const { rows } = await db.query(contract);
  const value = rows[0].text ?? Object.values(rows[0])[0];
  return String(value).trim() === 'true';
};

// The definition 0132 leaves behind, arity for arity: eight arguments the clients pass,
// one defaulted tail they ignore.
const REAL_RPC = `
  create function public.send_message_once(
    p_conversation_id uuid, p_client_id uuid, p_body text,
    p_kind public.bsdc_message_kind default 'text', p_media_url text default '',
    p_media_name text default '', p_code_language text default '', p_reply_to uuid default null,
    p_media_asset uuid default null
  ) returns public.messages language plpgsql as $$ begin return null; end; $$;
`;
const DROP_REAL_RPC =
  'drop function public.send_message_once(uuid, uuid, text, public.bsdc_message_kind, text, text, text, uuid, uuid);';

const db = await makeDb();

// --- 1. a fully migrated schema passes -------------------------------------
check(await gateSays(db), 'a current schema satisfies the rollout contract');

// --- 2. arity is the contract, in both directions --------------------------
// A defaulted parameter appended to the tail must stay acceptable, and an RPC that
// lost an argument callers pass must not be. Both are the same edit — replace the
// definition — so the proof is that the gate reads the argument list rather than the
// name alone or one day's spelled-out types.
await db.exec(`
  ${DROP_REAL_RPC}
  create function public.send_message_once(
    p_conversation_id uuid, p_client_id uuid, p_body text,
    p_kind public.bsdc_message_kind default 'text', p_media_url text default '',
    p_media_name text default '', p_code_language text default ''
  ) returns public.messages language plpgsql as $$ begin return null; end; $$;
`);
check(!(await gateSays(db)), 'the gate refuses an RPC that lost an argument callers pass');

await db.exec(`
  drop function public.send_message_once(uuid, uuid, text, public.bsdc_message_kind, text, text, text);
  ${REAL_RPC}
`);
check(await gateSays(db), 'a defaulted parameter added to the tail still satisfies the contract');

// --- 3. a routine the applications call cannot go missing -----------------
// Last, because it is the one mutation this file cannot undo: the page function is
// what the thread view reads, and re-creating it here would only duplicate 0082.
await db.exec('drop function public.conversation_messages_page(uuid, timestamptz, uuid, integer);');
check(!(await gateSays(db)), 'the gate refuses a schema without the messages page function');

process.exit(summary());
