# Third-party notices

The BSDC platform is built on open-source software. This file records how that
is audited rather than attempting to reproduce every licence text by hand, which
would be a copy that goes stale on the first dependency update.

## How the inventory is produced

```bash
node main-site/scripts/licence-report.mjs            # human summary
node main-site/scripts/licence-report.mjs --json     # machine-readable
node main-site/scripts/licence-report.mjs --check    # exit 1 on a copyleft package
```

The script reads each application's installed dependency tree, groups packages by
declared licence, and prints the ones that carry obligations the platform has to
honour. `--check` fails on a package whose licence is incompatible with PASVL's
distribution terms (see PASVL Appendix C): GPL, AGPL, SSPL or an unknown licence.

## The rule this repository follows

Every runtime dependency must be one of:

- **MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Apache-2.0, MPL-2.0, CC0-1.0,
  Unlicense** — permitted, with the licence text retained in `node_modules` and
  the package's notice reproduced by the tooling above.
- **LGPL** — permitted only where the package is dynamically linked and
  replaceable by the deployer; none is currently used.
- **GPL, AGPL, SSPL, BUSL, Elastic-2.0, or unknown** — refused. `--check` is the
  gate, and it runs in continuous integration.

## The platform's own components

| Component | Licence | Note |
| --- | --- | --- |
| `main-site/`, `admin-site/` and the other twelve applications | PASVL-1.0 | This repository. See `LICENSE` and `NOTICE`. |
| `corporate-kit/` | PASVL-1.0 | Shared source, never published as a package. |
| `push-worker/` | PASVL-1.0 | Cloudflare Worker. |
| `supabase/migrations/` | PASVL-1.0 | The schema is part of the Work. |
| `brand/` | PASVL-1.0 | The shield mark and wordmark are also trademarks. |

## What the report currently says

`node main-site/scripts/licence-report.mjs --check` on this commit:
**794 packages, 792 permitted, 0 refused, 2 needing a recorded reading.** The two
are `@img/sharp-libvips-*`, the prebuilt native `libvips` binaries that `sharp`
loads. They are LGPL-3.0-or-later and they are **build-time only**: `sharp`
generates the favicons, PWA icons and Open Graph images in `npm run brand`, and
resizes upload previews in scripts. Nothing from it is bundled into the
JavaScript served to a browser, and it is never distributed as part of the Work,
so the LGPL's relinking obligation does not attach to the deployed site.

If that ever stops being true — if `sharp` is imported by a route module — the
report still passes but the reading above becomes wrong. The `--check` run is in
continuous integration for exactly that reason: the day a strong-copyleft
package appears, the gate fails and somebody reads the diff.

## Document fonts and measurement tables

The Bengali-capable PDF renderer bundles Noto Sans Bengali under the SIL Open
Font License 1.1. Its source, hash and licence are in
`corporate-kit/src/pdf/fonts/README.md` and `OFL.txt`. The same directory
records the Adobe notice and redistribution terms for the adapted Helvetica
advance-width tables used by the PDF layout. These are font assets and metrics,
not additional npm packages in the inventory above. The renderer uses the MIT
`fontkit` package; anonymous field measurements use Apache-2.0 `web-vitals`.

## Services

The platform runs entirely on free tiers of third-party services — Supabase,
Firebase, ImgBB, Cloudflare Pages and Workers, OpenStreetMap. Their
terms are their own and are not redistributed here. No paid service is required
to run the whole platform at community scale; see `docs/deploying.md` for the
exact free-tier limits each one is used within.
