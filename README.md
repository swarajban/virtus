# Virtus

A workout tracking web application for powerbuilding and strength training programs. Track your workouts, view exercise history with performance charts, manage 1RM values, and follow structured programs.

Built as a mobile-first Progressive Web App (PWA) with an intuitive interface for logging exercises, tracking weights/sets/reps, and monitoring strength progression over time. There's also a native SwiftUI iOS app (`ios/`), distributed through TestFlight, that uses the same API and data.

**Live URL**: https://virtus.fly.dev

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build for production
npm run build

# Production server
npm run start
```

## Tech Stack

| Layer | Technology |
|-------|-------------|
| Frontend | React 18, TypeScript, Vite |
| Routing | Wouter |
| UI | Shadcn/ui, Radix UI, Tailwind CSS |
| State | TanStack React Query, localStorage |
| Backend | Express.js |
| Database | PostgreSQL (Neon) |
| ORM | Drizzle ORM |
| Charts | Chart.js |
| iOS app | SwiftUI, Swift Charts (iOS 17+), XcodeGen |

## Deployment

### Fly.io (Recommended)

The app is configured for Fly.io deployment with `fly.toml` and `Dockerfile`.

Prerequisites:
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login
```

Deploy:
```bash
# First deploy
fly launch --no-deploy
fly secrets set DIRECT_DATABASE_URL='postgresql://...'
fly deploy

# Subsequent deploys
fly deploy
```

Required secret:
- `DIRECT_DATABASE_URL` - PostgreSQL connection string (use direct Neon host, not pooled)

Health checks: `GET /api/health`

### iOS (TestFlight)

`.github/workflows/ios.yml` builds the iOS app in the simulator (with screenshots) on every change under `ios/`. Pushes to `main` that touch `ios/` or `client/public/powerbuilding_data.json`, and manual runs (**Actions → iOS → Run workflow**), also sign the app and upload it to TestFlight. The workflow needs the App Store Connect API key secrets; see [ios/README.md](ios/README.md) for setup.

### Database Setup

The app automatically seeds exercises on first startup. For Neon, use the **direct** connection string:

```
postgresql://user:pass@ep-...us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

The app prefers `DIRECT_DATABASE_URL` over `DATABASE_URL`.

## Architecture

### Data Model

- **Users**: Username-based auth ("swaraj", "demo", etc.)
- **Programs**: Workout programs with multiple cycles
- **Workout Progress**: Per-user, per-program, per-cycle tracking
- **Exercise History**: All working sets with timestamps
- **1RM Values**: Per-exercise one-rep max tracking

### Key Features

- **Program Cycles**: Repeat programs across multiple cycles with isolated history
- **Session Tracking**: Unique session IDs per workout attempt
- **Exercise Database**: 130+ exercises with metadata (YouTube links, 1RM configs)
- **Rest Timer**: Built-in rest timer with haptic feedback
- **Offline Support**: PWA with localStorage fallback
- **Weight Calculations**: Auto-rounding to nearest 5lbs

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/user/current` | Current user |
| `GET /api/workout-progress` | Get progress |
| `POST /api/workout-progress/:id` | Save progress |
| `GET /api/exercise-history` | Get history |
| `POST /api/exercise-history` | Save history entry |
| `GET /api/one-rm` | Get 1RM values |
| `POST /api/one-rm` | Save 1RM values |
| `GET /api/exercises` | List exercises |

## Project Structure

```
├── client/           # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── pages/        # Page components
│   │   ├── lib/          # Utils, storage, API client
│   │   └── hooks/        # Custom hooks
│   └── public/           # Static assets, workout data
├── server/           # Express backend
│   ├── index.ts          # Entry point
│   ├── routes.ts         # API routes
│   ├── storage.ts        # Database layer
│   ├── db.ts             # DB connection
│   └── vite.ts           # Vite dev middleware
├── shared/           # Shared types/schemas
│   └── schema.ts
├── ios/              # Native SwiftUI app (see ios/README.md)
│   ├── project.yml       # XcodeGen spec
│   └── Virtus/           # App sources
├── .github/workflows/
│   ├── fly-deploy.yml    # Deploys the server on push to main
│   └── ios.yml           # iOS build + TestFlight upload
├── fly.toml          # Fly.io config
├── Dockerfile        # Production build
└── package.json
```

## Development Notes

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DIRECT_DATABASE_URL` | Neon direct connection | Yes (production) |
| `DATABASE_URL` | Fallback connection | Optional |
| `PORT` | Server port | No (default: 5000) |
| `NODE_ENV` | environment | No |

### API compatibility with the iOS app

The iOS app calls the same `/api/*` endpoints as the web client and decodes their JSON in `ios/Virtus/Model/Models.swift`. TestFlight builds already on phones don't update when the server deploys, so keep endpoint changes backwards compatible. Adding fields is safe; renaming or removing fields, or changing their types, can break installed builds. It also bundles `client/public/powerbuilding_data.json` at build time and refreshes it from the server.

### Database Commands

```bash
# Push schema changes
npm run db:push

# Manual seed (if needed)
tsx server/seed-exercises.ts
```

### Recent Changes (2025)

- Migrated from Replit to Fly.io + Neon PostgreSQL
- Fixed production Vite import issue
- Added GitHub Actions auto-deploy
- Updated to prefer direct Neon connections
- Added the native iOS app (`ios/`) with a TestFlight pipeline

## Design

See [design_guidelines.md](design_guidelines.md) for the full design system spec including typography, spacing, components, and mobile PWA guidelines.

For how to develop, verify and ship both apps (including iOS changes without a Mac), see [CLAUDE.md](CLAUDE.md).

## License

MIT
