#!/usr/bin/env bash
# Generates the files every corporate console shares. The consoles differ in
# what they do, not in how they are built, so their build files are produced
# from one description instead of drifting apart by hand. Re-running this is
# safe: it rewrites only the generated files and never touches src features.
set -euo pipefail

cd "$(dirname "$0")/.."

while IFS='|' read -r dir appid name port; do
  [ -z "$dir" ] && continue
  mkdir -p "$dir/src"

  cat > "$dir/package.json" <<EOF
{
  "name": "$appid",
  "private": true,
  "version": "0.20.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx --max-warnings 0",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "2.117.2",
    "firebase": "^10.14.0",
    "qrcode-generator": "^2.0.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^7.18.0",
    "@typescript-eslint/parser": "^7.18.0",
    "@vitejs/plugin-react": "^4.3.2",
    "eslint": "^8.57.1",
    "prettier": "^3.3.3",
    "typescript": "^5.5.4",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
EOF

  cat > "$dir/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@kit": ["../corporate-kit/src/index.ts"],
      "@kit/*": ["../corporate-kit/src/*"]
    }
  },
  "include": ["src"]
}
EOF

  cat > "$dir/vite.config.ts" <<EOF
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The corporate kit is compiled from source rather than consumed as a
// package, so a change to a shared rule is type-checked and bundled by every
// console that depends on it in the same commit.
const kit = fileURLToPath(new URL('../corporate-kit/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@kit\$/, replacement: \`\${kit}/index.ts\` },
      { find: '@kit', replacement: kit },
    ],
  },
  server: { host: '0.0.0.0', port: $port, fs: { allow: ['..'] } },
  preview: { host: '0.0.0.0', port: $port },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules') ? 'vendor' : undefined),
        entryFileNames: 'assets/index-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
EOF

  cat > "$dir/.eslintrc.cjs" <<'EOF'
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', 'vite.config.ts'],
  rules: {
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['error', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always'],
  },
};
EOF

  # A console that has grown its own head — a public portal with real
  # metadata, say — marks itself and is left alone. Regenerating over a
  # hand-written head is how a site silently loses its canonical link.
  if [ -f "$dir/index.html" ] && grep -q "bsdc:hand-written" "$dir/index.html"; then
    echo "kept the hand-written $dir/index.html"
  else
  cat > "$dir/index.html" <<EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <title>$name — BSDC</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
  fi

  # Security headers. A console is a private tool: it is served to staff,
  # never to a crawler, so it says so in a header rather than relying on a
  # robots file that an aggregator may ignore. The two public sites
  # (status and verification) are exempt and set their own.
  mkdir -p "$dir/public"
  if [ "$dir" = "vf-site" ] || [ "$dir" = "status-site" ]; then
    robots_line=""
  else
    robots_line="  X-Robots-Tag: noindex, nofollow"
  fi
  cat > "$dir/public/_headers" <<EOF
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.firebaseio.com wss://*.firebaseio.com https://*.googleapis.com; form-action 'self'; manifest-src 'self'; upgrade-insecure-requests
$robots_line

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache
EOF

  cat > "$dir/.env.example" <<'EOF'
# Corporate consoles authenticate against the bsdc-second Firebase project,
# which is separate from the member-facing project on purpose.
VITE_FB2_API_KEY=
VITE_FB2_AUTH_DOMAIN=
VITE_FB2_PROJECT_ID=bsdc-second
VITE_FB2_APP_ID=
VITE_FB2_DATABASE_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SITE_URL=https://www.bsdc.info.bd
EOF

  cat > "$dir/src/vite-env.d.ts" <<'EOF'
/// <reference types="vite/client" />
EOF

  cat > "$dir/src/main.tsx" <<EOF
import { mountConsole } from '@kit';
import { App } from './App';

mountConsole('$appid', '$name', () => <App />);
EOF
  echo "scaffolded $dir"
done <<'LIST'
config-site|bsdc-config|Configuration|5181
customize-site|bsdc-custom|Site composer|5182
connect-site|bsdc-connect|Staff connect|5183
ip-site|bsdc-ip|IP intelligence|5184
status-site|bsdc-status|Service status|5185
users-admin-site|bsdc-uadmin|Staff records|5186
users-moderator-site|bsdc-umod|People operations|5187
certificate-site|bsdc-cert|Certificate generator|5188
notice-site|bsdc-notice|Notice builder|5189
vf-site|bsdc-vf|Verification portal|5190
admin-site|bsdc-admin|SEO and branding|5191
performance-site|bsdc-perf|Performance suite|5192
moderator-site|bsdc-mod|Moderation|5193
LIST
