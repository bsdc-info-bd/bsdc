# Contributing to BSDC

BSDC is published under the **PASVL-1.0** licence: the source is public and may
be read, audited, cited, taught from and improved. **Running it as a deployed
service requires a LOSDA** from RRC Development. See [LICENSE](./LICENSE) and
[NOTICE](./NOTICE).

Because PASVL is source-available rather than open source, contributions are
accepted only under the terms in [§ Copyright](#copyright) below: a patch that
arrives without them cannot be merged, however good it is.

## Ground rules

1. **Zero errors.** `npm run typecheck`, `npm run lint`, `npm run test` and
   `npm run build` must pass in every app you touch, with no warnings.
2. **No placeholders.** No demo users, sample posts, lorem ipsum or
   "coming soon" screens. Empty states are designed, real empty states.
3. **No emojis in the interface.** Use SVG icons (lucide-react or the BSDC
   icon set). Emojis are allowed only inside content a user authored.
4. **Bilingual.** Every user-visible string goes through `t()` and exists in
   both `src/i18n/locales/en.ts` and `src/i18n/locales/bn.ts`.
5. **Responsive.** Every screen must work from 250px to 3840px with no
   horizontal scrolling and no clipped text.
6. **No secrets.** Never commit a `.env` file, service account or API secret.
   Public values go in `.env.example` with empty values.
7. **File size.** Keep source files under 400 lines; split components instead
   of growing them.

## Workflow

```bash
cd <app>
npm install
npm run dev
# before pushing
npm run typecheck && npm run lint && npm run test && npm run build
```

Commits follow `type(scope): summary`, for example
`feat(main-site): add command palette`. Every pull request must state which
registry IDs (CORE / ADM / MOD / MGR / MGMT) it implements.

## Copyright

RRC Development is the Author of this Work. PASVL-1.0 keeps the source public and
gates deployment; it does not make the code jointly owned. So that the licence can
stay truthful about who may issue a LOSDA, every contribution is accepted under
these terms and only these:

1. **Assignment.** By opening a pull request you assign to RRC Development the
   copyright in your contribution, worldwide, for the full term of copyright, and
   you waive any moral rights that would prevent RRC Development from maintaining,
   relicensing or deploying the Work. You keep the right to be named, and the
   commit history names you.
2. **Provenance.** You wrote it, or you have the right to license it. A patch that
   copies code from a source whose licence is listed as incompatible in PASVL
   Appendix C will be refused, not cleaned up.
3. **No new dependency without a licence line.** If your patch adds a package, the
   `Dependency licences` job has to pass: `node main-site/scripts/licence-report.mjs
   --check`. GPL, AGPL, SSPL, BUSL and Elastic licences fail it, and so does a
   package with no licence field.
4. **No secret, ever.** `gitleaks` runs on every push. A key that reaches a commit
   is a key that has to be rotated, including in a branch that is never merged.

If those terms are not acceptable to you, an issue or a bug report is still
welcome — they carry no licence grant and need none.

## Reporting a security problem

Do not open an issue. See [SECURITY.md](./SECURITY.md); the address there is
monitored and a report is acknowledged within two working days.
