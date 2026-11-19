// Proof coverage for admin-managed vendor order-credit package prices; no schema change required.
// The RPCs were introduced in 0094/0108; this harness proves their seeded data,
// write behavior, validation, and marketplace.settings permission check.
import { as, check, expectFail, failureCount, makeDb, summary } from './lib.mjs';

const db = await makeDb();
const admin = 'package-price-admin';
const manager = 'package-price-manager';

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${admin}', 'package_admin', 'Package Price Admin', 'admin', 'active'),
    ('${manager}', 'package_manager', 'Package Price Manager', 'manager', 'active');
`);

const listed = await as(
  db,
  admin,
  'select public.mk_admin_list_packages() as packages',
  'admin with marketplace.settings can list the vendor credit packages',
  { bsdc_role: 'admin' },
);
const packages = listed?.rows[0]?.packages ?? [];
const expected = [
  { code: '10', orders: 10, price_poisha: 10000, is_active: true },
  { code: '50', orders: 50, price_poisha: 50000, is_active: true },
  { code: '100', orders: 100, price_poisha: 95000, is_active: true },
];
check(
  Array.isArray(packages) && packages.length === 3,
  'the list RPC returns exactly three seeded packages',
  JSON.stringify(packages),
);
check(
  expected.every((seed) =>
    packages.some(
      (row) =>
        row.code === seed.code &&
        Number(row.orders) === seed.orders &&
        Number(row.price_poisha) === seed.price_poisha &&
        row.is_active === seed.is_active,
    ),
  ),
  'the seeded 10, 50, and 100 order prices and active states match the migration',
  JSON.stringify(packages),
);

await as(
  db,
  admin,
  "select public.mk_admin_set_package('50', 55, 51234, false)",
  'admin changes a package order count, exact-poisha price, and sale state',
  { bsdc_role: 'admin' },
);
const changed = await db.query(
  "select code, orders, price_poisha, is_active from public.mk_credit_packages where code = '50'",
);
const updated = changed.rows[0];
check(
  updated?.orders === 55 && Number(updated?.price_poisha) === 51234 && updated?.is_active === false,
  'the package write persists order count, integer poisha, and inactive state',
  JSON.stringify(updated),
);

await expectFail(
  db,
  admin,
  "select public.mk_admin_set_package('10', 10, 0, true)",
  '22023',
  'the set RPC rejects a zero price',
  { bsdc_role: 'admin' },
);
await expectFail(
  db,
  admin,
  "select public.mk_admin_set_package('10', 0, 10000, true)",
  '22023',
  'the set RPC rejects a zero order allocation',
  { bsdc_role: 'admin' },
);
await expectFail(
  db,
  admin,
  "select public.mk_admin_set_package('unknown', 10, 10000, true)",
  '22023',
  'the set RPC rejects an unknown package code',
  { bsdc_role: 'admin' },
);

await expectFail(
  db,
  manager,
  'select public.mk_admin_list_packages()',
  '42501',
  'staff without marketplace.settings cannot list packages',
  { bsdc_role: 'manager' },
);
await expectFail(
  db,
  manager,
  "select public.mk_admin_set_package('10', 10, 10000, true)",
  '42501',
  'staff without marketplace.settings cannot edit package prices',
  { bsdc_role: 'manager' },
);

if (failureCount() > 0) process.exitCode = 1;
summary();
