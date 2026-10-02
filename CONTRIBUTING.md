# Contributing to BSDC

BSDC is proprietary software of RRC Development (see [LICENSE.md](./LICENSE.md)).
Contributions are accepted only from authorized collaborators, and all
contributions become the property of RRC Development.

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
