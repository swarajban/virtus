# Deploying Virtus to Fly.io

## What I set up

- `fly.toml`
- `Dockerfile`
- `.dockerignore`

## Do we need a Dockerfile?

Strictly speaking, no. Fly can build Node apps without one.

But for this app, a Dockerfile is the better move because:
- it builds both the Vite frontend and bundled Node server explicitly
- production behavior is predictable
- it avoids buildpack guessing

## Files added

### `fly.toml`
- app name: `virtus`
- region: `sjc`
- internal port: `8080`
- health check: `GET /api/health`
- autostop/autostart enabled to save money
- small shared VM to start

### `Dockerfile`
- build stage runs `npm ci` + `npm run build`
- runtime stage installs prod deps only
- serves with `npm run start`

## Before deploy

Install Fly CLI and log in if needed:

```bash
fly auth login
```

If the app name `virtus` is already taken on Fly, either:
- change `app = "virtus"` in `fly.toml`, or
- deploy with a different app name after running `fly launch`

## Required secrets

Set the production database URL on Fly:

```bash
fly secrets set DIRECT_DATABASE_URL='postgresql://...'
```

You can also set `DATABASE_URL`, but this app now prefers `DIRECT_DATABASE_URL`.
For Neon, use the direct non-pooler host.

## First deploy

From the repo root:

```bash
fly launch --no-deploy
fly deploy
```

If you already have the app created, just run:

```bash
fly deploy
```

## Useful checks

```bash
fly status
fly logs
fly ssh console
```

Open the app:

```bash
fly open
```

## Notes

- The app reads `PORT`, and Fly routes traffic to the `internal_port` in `fly.toml`.
- Health checks hit `/api/health`.
- No volume is needed because state lives in Neon.
- Exercise seeding runs on startup, but it is idempotent.
