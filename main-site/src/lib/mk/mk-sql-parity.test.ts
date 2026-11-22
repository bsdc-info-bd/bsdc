import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ADDRESS_LINE_MAX,
  ADDRESS_LINE_MIN,
  ADDRESS_MAX,
  ADDRESS_NICKNAME_MAX,
  BD_BOUNDS,
  RECIPIENT_NAME_MAX,
  RECIPIENT_NAME_MIN,
  evaluateMinimumOrder,
  isBdMobile,
  normaliseBdMobile,
} from './mk-logic';

/**
 * Migration 0131 is the authority; this file and `mk-logic.ts` are its echo. The echo is what makes
 * a checkout feel instant and the authority is what makes it honest, and nothing in the build stops
 * the two from drifting — a release can ship a form that waves through a number the routine refuses,
 * or grey out a button for a rule that no longer exists.
 *
 * So the constants are read off the migration's own text here, rather than repeated from memory. A
 * test that asserted `ADDRESS_MAX === 8` would only prove the test and the source agree with each
 * other. This one fails when the SQL moves and the TypeScript is left behind, which is the accident
 * that actually happens.
 */
const MIGRATIONS = join(process.cwd(), '..', 'supabase', 'migrations');

const sql = (() => {
  const name = readdirSync(MIGRATIONS)
    .filter((file) => file.startsWith('0131_') && file.endsWith('.sql'))
    .sort()[0];
  if (!name)
    throw new Error('the 0131 marketplace migration is missing; the parity test is pointless');
  return readFileSync(join(MIGRATIONS, name), 'utf8');
})();

/** The body of one function, from its `create or replace function` to the next `create`. */
function routine(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `public.${name} is not in the migration`).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf('create or replace function', start + 10);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe('the address book agrees with the migration that defines it', () => {
  it('caps the book at the number of rows mk_save_address counts', () => {
    const cap = /if v_count >= (\d+) then/.exec(routine('mk_save_address'))?.[1];
    expect(cap).toBeDefined();
    expect(ADDRESS_MAX).toBe(Number(cap));
  });

  it('carries the same three labels the column allows', () => {
    const allowed = /check \(label in \(([^)]*)\)\)/.exec(sql)?.[1];
    expect(allowed).toBeDefined();
    expect(['home', 'work', 'other'].every((label) => allowed?.includes(`'${label}'`))).toBe(true);
    // Nothing else may be invented client-side: a fourth label would reach the column check, and a
    // column check is an error page rather than a message.
    expect(allowed).toBe(`'home', 'work', 'other'`);
  });

  it('holds the recipient and the street to the lengths the column declares', () => {
    const name = /char_length\(btrim\(recipient_name\)\) between (\d+) and (\d+)/.exec(sql);
    expect(name).not.toBeNull();
    expect([RECIPIENT_NAME_MIN, RECIPIENT_NAME_MAX]).toEqual([
      Number(name?.[1]),
      Number(name?.[2]),
    ]);

    const line = /char_length\(btrim\(address_line\)\) between (\d+) and (\d+)/.exec(sql);
    expect(line).not.toBeNull();
    expect([ADDRESS_LINE_MIN, ADDRESS_LINE_MAX]).toEqual([Number(line?.[1]), Number(line?.[2])]);

    const nickname = /char_length\(nickname\) <= (\d+)/.exec(sql);
    expect(nickname).not.toBeNull();
    expect(ADDRESS_NICKNAME_MAX).toBe(Number(nickname?.[1]));
  });

  it('judges a phone number by exactly the pattern the column matches', () => {
    const pattern = /phone ~ '([^']+)'/.exec(sql)?.[1];
    expect(pattern).toBeDefined();
    const re = new RegExp(`^${pattern?.replace(/^\^/, '').replace(/\$$/, '')}$`);
    for (const typed of ['01712345678', '01812-345678', '0191234567']) {
      const clean = normaliseBdMobile(typed);
      expect(re.test(clean)).toBe(isBdMobile(clean));
    }
  });

  it('refuses a pin outside the box the columns clamp to', () => {
    const lat = /lat\s+numeric\(9, 6\) not null check \(lat between ([\d.]+) and ([\d.]+)\)/.exec(
      sql,
    );
    const lng = /lng\s+numeric\(9, 6\) not null check \(lng between ([\d.]+) and ([\d.]+)\)/.exec(
      sql,
    );
    expect(lat).not.toBeNull();
    expect(lng).not.toBeNull();
    expect([BD_BOUNDS.latMin, BD_BOUNDS.latMax]).toEqual([Number(lat?.[1]), Number(lat?.[2])]);
    expect([BD_BOUNDS.lngMin, BD_BOUNDS.lngMax]).toEqual([Number(lng?.[1]), Number(lng?.[2])]);
  });

  it('offers the routine its arguments under the names it reads', () => {
    const params = routine('mk_save_address').slice(0, routine('mk_save_address').indexOf(')\n'));
    for (const arg of [
      'p_id',
      'p_label',
      'p_nickname',
      'p_recipient_name',
      'p_phone',
      'p_address_line',
      'p_landmark',
      'p_place_label',
      'p_lat',
      'p_lng',
      'p_note',
      'p_is_default',
    ]) {
      expect(params.includes(arg), `${arg} is not an argument any more`).toBe(true);
    }
    // And the repository must send them all: `mk_save_address` has no defaults, so a missing key is a
    // "function does not exist" error that looks like a routing bug.
    const repository = readFileSync(
      join(process.cwd(), 'src', 'lib', 'mk', 'mk-repository.ts'),
      'utf8',
    );
    const sent = repository.slice(
      repository.indexOf('saveAddress'),
      repository.indexOf('deleteAddress'),
    );
    for (const arg of ['p_label', 'p_recipient_name', 'p_address_line', 'p_is_default']) {
      expect(sent.includes(`${arg}:`), `the client stopped sending ${arg}`).toBe(true);
    }
  });

  it('asks for an address by id, and re-reads the row instead of the copy', () => {
    const place = routine('mk_place_order');
    expect(place).toContain('p_address_id');
    // The line that matters: the pin, the fee and the radius all come from the table once an id is
    // given. A client that sends its own copy of the address is not believed.
    expect(place).toMatch(/from public\.mk_addresses\s+where id = p_address_id/);
  });
});

describe('the minimum order agrees with the gate that enforces it', () => {
  it('compares the goods, the way the routine compares the goods', () => {
    // The real gate reads `v_subtotal < v_vendor.min_order_poisha`. It is written as an assertion
    // about the shape rather than the exact line, because the line is free to be renamed and the
    // comparison is not: the moment anybody compares a total, the delivery charge starts closing the
    // gap and a screen that measured goods would disagree with the order it just refused.
    const place = routine('mk_place_order');
    expect(place, 'the minimum is no longer compared against the subtotal').toMatch(
      /v_subtotal\s*<\s*v_vendor\.min_order_poisha/,
    );
    expect(place).not.toMatch(/v_subtotal \+ v_fee\s*<\s*v_vendor\.min_order_poisha/);
    // The rounding is where the two are allowed to differ, and this pins down that they do so on
    // purpose: the routine rounds its sentence up to a whole taka ("add 1 taka more"), while the
    // web quotes the exact poisha. Both let the order through at the same basket, which is the only
    // agreement that has to hold.
    expect(place).toMatch(/\(v_vendor\.min_order_poisha - v_subtotal \+ 99\) \/ 100/);
    expect(evaluateMinimumOrder(79950, 80000).shortfallPoisha).toBe(50);
  });

  it('speaks whole taka on the way in and poisha on the way out, like every other shop knob', () => {
    const setter = routine('mk_vendor_set_min_order');
    expect(setter).toContain('p_taka::bigint * 100');
    // 0131's own column check, and the range the vendor panel puts in its field: the panel may be
    // stricter than the column, never looser — a looser panel hands the member a database error.
    const column = /check \(min_order_poisha between 0 and (\d+)\)/.exec(sql);
    expect(column).not.toBeNull();
    expect(Number(column?.[1])).toBe(100000000);
    expect(100000 * 100).toBeLessThanOrEqual(Number(column?.[1]));
  });

  it('raises the shortfall the routine raises, in taka', () => {
    const place = routine('mk_place_order');
    expect(place).toMatch(/takes orders from/);
    expect(place).toMatch(/add .* more/);
    // The client's own arithmetic, so a message and a refusal cannot disagree about the amount.
    expect(evaluateMinimumOrder(60000, 80000).shortfallPoisha).toBe(20000);
    expect(evaluateMinimumOrder(80000, 80000).met).toBe(true);
  });
});
