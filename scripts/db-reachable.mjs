#!/usr/bin/env node
/**
 * Says whether the database in SUPABASE_DB_URL can be reached from here,
 * before anything tries to apply a migration to it.
 *
 *   node scripts/db-reachable.mjs
 *
 * The one failure that costs an afternoon on a first deployment is a direct
 * Supabase host: it has no IPv4 address any more, and a GitHub-hosted runner
 * has no IPv6, so the connection fails with a timeout that mentions neither
 * fact. This resolves the host first and says so in as many words.
 *
 * Nothing it prints identifies the project: the hostname, the user and the
 * password never leave this process. Only the shape of the target does.
 */
import { promises as dns } from 'node:dns';
import net from 'node:net';

const raw = (process.env.SUPABASE_DB_URL ?? '').trim();

function fail(message) {
  process.stdout.write(`::error::${message}\n`);
  process.exit(1);
}

if (raw === '') {
  fail(
    'SUPABASE_DB_URL is not set on this repository. Add it under Settings, ' +
      'Secrets and variables, Actions, then re-run this workflow.',
  );
}

let url;
try {
  url = new URL(raw);
} catch {
  fail(
    'SUPABASE_DB_URL is not a URL. It must look like ' +
      'postgresql://USER:PASSWORD@HOST:PORT/postgres, with no surrounding quotes ' +
      'and no trailing newline.',
  );
}

if (!/^postgres(ql)?:$/.test(url.protocol)) {
  fail(`SUPABASE_DB_URL has the scheme "${url.protocol}"; it must be postgresql:`);
}

const host = url.hostname;
const port = Number(url.port || 5432);
const pooled = host.includes('pooler');
const direct = host.startsWith('db.');
const shape = pooled
  ? 'a connection pooler'
  : direct
    ? 'a direct database host'
    : 'an unrecognised host';

const resolve = async (fn) => {
  try {
    return await fn();
  } catch {
    return [];
  }
};
// A literal address is not a name and has nothing to look up.
const literal = net.isIP(host);
const v4 = literal === 4 ? [host] : literal ? [] : await resolve(() => dns.resolve4(host));
const v6 = literal === 6 ? [host] : literal ? [] : await resolve(() => dns.resolve6(host));

process.stdout.write(
  `::notice::target is ${shape} on port ${port}; ` +
    `${v4.length} IPv4 and ${v6.length} IPv6 addresses; ` +
    `database "${url.pathname.slice(1) || '(none)'}"\n`,
);

if (v4.length === 0 && v6.length === 0) {
  fail(
    'that host does not resolve at all. Check the hostname in SUPABASE_DB_URL, ' +
      'and that the Supabase project still exists.',
  );
}

if (v4.length === 0) {
  fail(
    'that host has no IPv4 address and a GitHub runner has no IPv6, so no ' +
      'connection is possible. Use the transaction pooler URI instead: Supabase ' +
      'dashboard, Project Settings, Database, Connection string, Transaction ' +
      'pooler — postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres',
  );
}

if (direct) {
  process.stdout.write(
    '::warning::this is the direct database host. It works today, but the ' +
      'transaction pooler is the connection Supabase intends for automation.\n',
  );
}

const reachable = await new Promise((resolve_) => {
  const socket = net.connect({ host: v4[0], port, timeout: 10_000 });
  socket.on('connect', () => {
    socket.destroy();
    resolve_(true);
  });
  const stop = () => {
    socket.destroy();
    resolve_(false);
  };
  socket.on('timeout', stop);
  socket.on('error', stop);
});

if (!reachable) {
  fail(
    `nothing is listening on port ${port} at that host, or a firewall is in ` +
      'the way. A Supabase pooler listens on 6543 for transactions and 5432 for ' +
      'sessions; the direct host listens on 5432.',
  );
}

process.stdout.write(`the database answers on port ${port}\n`);
