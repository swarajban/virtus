# Virtus

A workout tracker with two clients sharing one backend:

- **Web app (PWA):** `client/` (React + Vite), served by the Express server in `server/` at https://virtus.fly.dev.
- **iOS app:** `ios/` (native SwiftUI), distributed to the owner through TestFlight.
- **Backend:** `server/` (Express + Drizzle) on Fly.io, with a Neon Postgres database. Both clients talk to it over `/api/*`. Requests identify the user with the `x-username` header; there is no other auth.

The app is used daily at the gym, often on bad wifi. Logging a set must never block on the network or lose data. Much of the code exists to guarantee that; read the comments before "simplifying" anything.

## Working in this repo

- **Branch, then PR.** `main` deploys automatically:
  - `.github/workflows/fly-deploy.yml` deploys the server on every push to `main`.
  - `.github/workflows/ios.yml` uploads a TestFlight build when a push to `main` touches `ios/`, `client/public/powerbuilding_data.json` or the workflow file.
- **Keep the API backwards compatible.** TestFlight builds already on the phone don't update when the server deploys. Adding response fields is safe. Renaming, removing, or changing the type of a field the iOS app decodes (`ios/Virtus/Model/Models.swift`) breaks installed builds. If a breaking change is unavoidable, ship the iOS change first and make the server accept both shapes during the transition.
- **Program data has one source.** `client/public/powerbuilding_data.json` holds every program. The web app fetches it, the iOS app bundles it at build time and refreshes it from the server, and `/api/programs` serves it.

## Web app

```bash
npm install
npm run dev      # Express + Vite on :5000 (needs DATABASE_URL / DIRECT_DATABASE_URL)
npm run check    # TypeScript
npm run build    # production build
```

UI changes are verified with Playwright scripts in `scripts/verify-*.ts`. They run real WebKit at iPhone size against a running dev server; each script's header lists its prerequisites. Write a new one for a significant UI change.

## iOS app

### Layout

```
ios/project.yml             XcodeGen spec. The .xcodeproj is generated, never committed.
ios/Support/Info.plist
ios/ExportOptions.plist     App Store Connect upload settings (team ID filled in by CI)
ios/Virtus/App/             entry point, NavigationStack routes, DEBUG -uiRoute hook
ios/Virtus/Model/           Codable mirrors of shared/schema.ts, 1RM/plate math (ports of client/src/lib)
ios/Virtus/Data/            APIClient, AppModel (state + disk cache), SyncQueue (durable write outbox), RestTimer
ios/Virtus/UI/              theme, shared components, rest timer, plate calculator
ios/Virtus/Screens/         Home, Workout, Exercise, History, Settings/1RM, Exercise library
```

Key invariants, mirroring `client/src/lib/storage.ts`:
- Every write applies locally first, then goes into `SyncQueue`. The queue is persisted to disk, sends writes in order, and retries network or gateway errors forever. It retries other server errors 8 times, then drops the write with a toast.
- `WorkoutProgress.merge` never moves a workout's status backwards. A server refresh replaces local progress for a workout only when that workout has no pending local writes.
- `startNewProgram` sends the account's queued writes before switching cycles. The server files every write under the user's current program and cycle, so a write sent after the switch would land in the wrong cycle.

### Verifying changes (no Mac needed)

There's no Swift toolchain in the Linux sandbox. **CI is the compiler.** Push a branch and the `iOS` workflow's `build` job:
1. generates the project with XcodeGen and builds it for the simulator. Compile errors show up in the job log as `error:` lines.
2. launches the app in an iPhone simulator as the shared **`demo`** user, never a real user, and screenshots Home, a Workout, an Exercise, History, Settings and 1RM in light mode, plus Home and Exercise in dark mode.
3. fails if the app crashed, and uploads the PNGs as the `screenshots` artifact.

To check your work, get the run's artifacts with the GitHub MCP tools (`actions_list` → `list_workflow_run_artifacts`, then `actions_get` → `download_workflow_run_artifact`), download and unzip them, and look at the images. To screenshot a new screen, add a case to `openLaunchRoute()` in `ios/Virtus/App/VirtusApp.swift` (debug builds only) and a matching `shoot` line in the workflow.

Tips:
- Re-read Swift diffs for compile errors before pushing. Each CI round trip takes about 5 minutes.
- iOS 26 APIs (Liquid Glass: `.glass`, `.glassProminent`, `safeAreaBar`) must sit behind `if #available(iOS 26.0, *)` with a fallback. The deployment target is iOS 17. Use the existing helpers `prominentButtonStyle()`, `secondaryButtonStyle()` and `bottomActionBar`.
- Use `View` helpers and system colors so dark mode keeps working.

### Shipping to TestFlight

Merging to `main` ships automatically. A manual run (**Actions → iOS → Run workflow**) also uploads, from whichever branch it's run on. The `testflight` job:
1. checks the App Store Connect API key against Apple's API and confirms the app record exists, so credential problems show Apple's own error message.
2. archives the app **unsigned**, then exports it with `-allowProvisioningUpdates`. That signs it with Apple's cloud-managed distribution certificate, so no devices, profiles or local certificates are needed.
3. uploads to App Store Connect. The build number is `run_number * 10 + run_attempt`, so it always increases.

Setup:
- Secrets: `APP_STORE_CONNECT_KEY_ID` (10 characters), `APP_STORE_CONNECT_ISSUER_ID` (a UUID), `APP_STORE_CONNECT_KEY_P8` (the full `.p8` file contents).
- Team ID `8G7N7547R6`, bundle ID `com.swarajban.virtus`, App Store Connect app name "Virtus Lift".
- Full first-time setup: `ios/README.md`.

After an upload, Apple takes about 5–15 minutes to process the build, then TestFlight on the owner's phone updates it. Bump `MARKETING_VERSION` in `ios/project.yml` only for meaningful releases; build numbers handle everything else.

Agent permissions: this environment's GitHub token can push, but it can't re-run workflows or start `workflow_dispatch`. To start a new run, push a commit with a real change. Don't push empty commits.
