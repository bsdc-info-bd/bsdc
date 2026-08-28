# BSDC — Bangladesh Software Development Community

The proud software development community of Bangladesh.

A world-class developer community platform built with React, TypeScript, Firebase, and modern web technologies.

## Features

- **Developer Profiles** — Showcase skills, projects, experience, and achievements
- **Posts & Articles** — Rich Markdown editor, code snippets, tutorials, questions
- **Real-Time Messaging** — Direct and group conversations with typing indicators
- **Groups & Communities** — Public, private, and restricted groups
- **Job Platform** — Post and apply for developer jobs
- **Marketplace** — Sell services, templates, and digital products
- **Creator Program** — Milestones, badges, and creator recognition
- **Advertising Platform** — CPC, CPM, sponsored posts, and more
- **License System** — Software registration and verification
- **Admin Panel** — Comprehensive moderation and management
- **Bilingual** — English and Bangla support
- **PWA** — Installable, offline-capable web application
- **Android** — Capacitor-based native Android app

## Tech Stack

| Category | Technology |
|----------|-----------|
| Frontend | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 3 + PostCSS |
| UI | Radix UI + Lucide Icons |
| State | Zustand + TanStack Query |
| Routing | React Router 7 |
| Forms | React Hook Form + Zod |
| Auth/DB | Firebase (Auth, Firestore, RTDB) |
| Media | Cloudinary + ImgBB |
| Search | FlexSearch |
| i18n | i18next |
| PWA | vite-plugin-pwa + Workbox |
| Mobile | Capacitor |
| Hosting | Cloudflare Pages |
| Testing | Vitest + Testing Library |
| Notifications | OneSignal Web SDK |

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 10
- Firebase project (for backend features)
- Cloudinary account (for image uploads)
- OneSignal account (for push notifications)

### Installation

```bash
git clone https://github.com/bsdc-info-bd/bsdc.git
cd bsdc
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|----------|-------------|
| `VITE_PUBLIC_SITE_URL` | Production URL |
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_DATABASE_URL` | Realtime Database URL |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Unsigned upload preset |
| `VITE_ONESIGNAL_APP_ID` | OneSignal app ID |

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

## Project Structure

```
src/
  app/              # Application-level setup
  assets/           # Static assets (images, icons)
  components/       # Shared UI and layout components
    ui/             # Design system components
    layout/         # Header, Sidebar, BottomNav
    seo/            # SEO meta management
  config/           # Centralized configuration
  features/         # Feature modules
    auth/           # Authentication
    feed/           # Feed and ranking
    posts/          # Post creation and display
    comments/       # Comments and replies
    profiles/       # User profiles
    messaging/      # Real-time messaging
    notifications/  # Notification system
    groups/         # Groups
    jobs/           # Job platform
    marketplace/    # Marketplace
    projects/       # Project showcase
    organizations/  # Organization pages
    events/         # Events
    search/         # Search engine
    creator/        # Creator program
    ads/            # Advertising platform
    licenses/       # License system
    admin/          # Admin panel
    moderation/     # Moderation tools
    analytics/      # Analytics dashboard
    seo/            # SEO tools
  hooks/            # Custom React hooks
  lib/              # Third-party integrations
    firebase/       # Firebase services
    cloudinary/     # Image upload
    onesignal/      # Push notifications
  services/         # Business logic services
  stores/           # Zustand state stores
  types/            # TypeScript type definitions
  schemas/          # Zod validation schemas
  utils/            # Utility functions
  routes/           # Route definitions
  styles/           # Global CSS
  i18n/             # Internationalization
```

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication providers: Google, GitHub, Email/Password
3. Create Firestore database
4. Create Realtime Database
5. Deploy security rules:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init
   firebase deploy --only firestore:rules,database:rules
   ```
6. Configure Firestore indexes from `firestore.indexes.json`

## Security

- Firestore Security Rules enforce RBAC and ownership
- Realtime Database Rules restrict access by user ID
- Sensitive values (API secrets, admin keys) never exposed to client
- No hardcoded credentials
- Input validation with Zod schemas
- HTML/Markdown sanitization
- Rate limiting architecture
- Anti-spam measures

## Admin Bootstrap

The first admin is bootstrapped via Firebase custom claims:

1. Deploy the application
2. Use Firebase Admin SDK (server-side) to set custom claims:
   ```javascript
   admin.auth().setCustomUserClaims(uid, { role: 'OWNER' });
   ```
3. Or use the Firebase Console to set custom claims manually

## Deployment

### Cloudflare Pages

1. Connect your GitHub repository
2. Build command: `npm run build`
3. Output directory: `dist`
4. Set environment variables in Cloudflare Pages settings

### Android (Capacitor)

```bash
npm run cap:init
npm run cap:add:android
npm run cap:sync
npm run cap:open:android
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Security](docs/SECURITY.md)
- [SEO](docs/SEO.md)
- [API Reference](docs/API.md)

## License

Boost Software License 1.0 — See [LICENSE](LICENSE)

## Organization

**RRC Development** (Rizwan Rahim Chowdhury Development)
Owner/CEO: Rizwan Rahim Chowdhury
