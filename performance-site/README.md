# BSDC Performance Suite

Staff can inspect recorded Core Web Vitals, edge timings, client-error groups
and bundle history. The Reports tab creates a PDF from selected live database
queries, with a configurable application, rolling window (1–90 days), trend
metric, sections, detail limit, theme, title and private note. A missing or
failed source is not represented as a successful zero.

## Coverage and interpretation

- Main-site field measurements are sent through its `/api/vitals` endpoint.
  The shared corporate mount now sends anonymous Web Vitals for each console
  through the existing `record_vital` RPC. The app ID, `/` route, coarse device
  category and build SHA are recorded; no Firebase UID, verification code or
  query string is included. `DNT`, `Global Privacy Control`, or
  `VITE_CORPORATE_VITALS=false` disable corporate collection. Unsupported
  browser metrics and blocked requests are gaps, not zeroes. Measurements will
  arrive only after the updated applications are deployed and used.
- Application-wide p75/p95 are calculated from the raw observations by
  `performance_vitals_overall`, not by averaging route percentiles. Samples
  under 20 are flagged as small.
- Edge timings are filtered by the recorded app. Error-board rows currently
  cover all apps, with lifetime occurrence counts for faults last seen in the
  selected window; their messages are omitted from PDFs. The projection is
  about the volume of Web Vital samples across all apps, **not** visitor counts
  or server capacity. These sources can be empty if their collectors are not
  configured.
- CI records the gzip size of **all emitted JS**, including lazy chunks, for
  successful main-branch builds when credentials are configured. This is not
  the size of the initial download and does not prove a deployment occurred.

## PDF verification

The report is downloaded only after an authorized `performance.read` staff
member finalizes an immutable receipt. The QR opens `VITE_VERIFICATION_URL`
(default `https://vf.main.bsdc.info.bd`). The public receipt exposes the title,
app, period, sections, generation time and SHA-256; the underlying measurements
and private note are not published. Uploading the PDF at the desk recomputes
its normalized whole-file fingerprint locally and compares it to the registry.
The QR alone confirms registration, not that an arbitrary copy is unchanged.

The fingerprint covers every byte except its own 64 hex digits, which are
normalized to ASCII zeroes before hashing. Rewriting, appending to or otherwise
modifying the PDF causes verification to fail. This is an authenticated registry
receipt, not a public-key digital signature, and it does not independently
attest that the staff-selected source data is complete.

Deploy migration `0080_performance_reports_and_print_integrity.sql` and the
updated verification portal before relying on reports or certificate reprints.
An unavailable receipt API causes a visible failure rather than an unverified
download. Set `VITE_VERIFICATION_URL` for staging rather than deriving it from
`VITE_SITE_URL`.
