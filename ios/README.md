# Virtus for iOS

A native SwiftUI app. It talks to the same API as the web app (`https://virtus.fly.dev`, `x-username` header) and needs no server changes.

## What's different from the web app

- **Native UI:** SwiftUI, native navigation and back-swipe, haptics, Swift Charts for history, dark mode.
- **Offline-safe logging:** every write (exercise completion, start/complete/reset, swap) is saved on the phone first and sent through a durable queue. The queue survives app kills and relaunches. It retries offline and gateway errors (deploys, cold starts) forever; if the server itself keeps rejecting a write, it gives up after 8 tries and shows an error. When a write is stuck, an orange banner shows how many changes are waiting.
- **Screen stays awake mid-workout:** while you're on an exercise, or resting between sets with the timer running (for up to 15 minutes), the phone won't auto-lock. You can turn this off in Settings → Keep Screen Awake.
- **Instant launch:** the last-known progress, exercises and 1RMs are cached on disk. The program structure ships in the app (`client/public/powerbuilding_data.json` is bundled at build time) and refreshes from the server in the background.
- **Not ported:** the Data Diagnostic debug page.

## Shipping to TestFlight from GitHub Actions (no Mac needed)

`.github/workflows/ios.yml` compiles the app on every change under `ios/`. On pushes to `main`, or when you start it manually (**Actions → iOS → Run workflow**), it also archives the app, signs it and uploads it to TestFlight.

### One-time setup

1. **Apple Developer Program:** you need a paid membership ($99/yr).
2. **Register the bundle ID:** go to [developer.apple.com → Identifiers](https://developer.apple.com/account/resources/identifiers/list), click **+**, choose **App IDs → App**, and enter the explicit bundle ID `com.swarajban.virtus`. It needs no capabilities.
   - To use a different ID, set a repo **variable** (not a secret) named `IOS_BUNDLE_ID`.
3. **Create the app record:** go to [App Store Connect → Apps](https://appstoreconnect.apple.com/apps), click **+ → New App**, pick iOS, name it Virtus (or any name not already taken), and select the bundle ID from step 2. For SKU, enter anything, for example `virtus`.
4. **Create an API key:** go to [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api) and generate a **Team Key** with the **Admin** role. Admin is required because Xcode's cloud signing creates certificates and profiles for you. Download the `.p8` file, which you can only download once, and note the **Key ID** and **Issuer ID**.
5. **Team ID:** `8G7N7547R6` is already set in `project.yml` and the workflow. It isn't secret; it's embedded in every signed app.
6. **Add repo secrets:** in **GitHub → Settings → Secrets and variables → Actions → New repository secret**, add:

   | Secret | Value |
   |---|---|
   | `APP_STORE_CONNECT_KEY_ID` | Key ID from step 4: exactly 10 characters, also the part between `AuthKey_` and `.p8` in the file name |
   | `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID from step 4 |
   | `APP_STORE_CONNECT_KEY_P8` | Full contents of the `.p8` file, including the `BEGIN/END PRIVATE KEY` lines |

7. **Run the workflow:** go to **Actions → iOS → Run workflow**. After it finishes, the build takes about 5–15 minutes to process in App Store Connect.
8. **Install it:** in App Store Connect, open your app → **TestFlight → Internal Testing**, create a group, and add yourself. Then install the **TestFlight** app on your iPhone and accept the invite. Internal builds skip Beta App Review, and `ITSAppUsesNonExemptEncryption` is already set, so there's no export-compliance prompt. Builds stay installable for 90 days, and any push to `main` that touches `ios/` ships a new one.

### Signing notes

The archive is built unsigned. The export step signs it with Apple's cloud-managed distribution certificate, using `-allowProvisioningUpdates` and the API key, which is why the key needs the Admin role. No development profile or registered device is needed, and no certificates pile up on your account. Before archiving, the workflow checks the key against the App Store Connect API, so credential problems show Apple's own error message.

## Building locally (optional, needs a Mac)

```sh
brew install xcodegen
cd ios && xcodegen generate && open Virtus.xcodeproj
```

In Xcode, choose your team under **Signing & Capabilities** and run the app on your phone. `Virtus.xcodeproj` is generated from `project.yml`, so don't commit it.

## Layout

```
ios/
  project.yml          XcodeGen spec (generates Virtus.xcodeproj)
  ExportOptions.plist  App Store Connect upload settings
  Support/Info.plist
  Virtus/
    App/               entry point, navigation
    Model/             Codable mirrors of shared/schema.ts, weight/plate math
    Data/              API client, AppModel (state + cache), SyncQueue, RestTimer
    UI/                theme, shared components, rest timer bar, plate calculator
    Screens/           Home, Workout, Exercise, History, Settings, 1RM, Library
```
