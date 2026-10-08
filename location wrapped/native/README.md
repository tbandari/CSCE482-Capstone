# Location Wrapped — native iPhone source

This is the native Expo/React Native app, not the Home Screen website. It is prepared for an EAS cloud build but has not been signed, installed on an iPhone, or submitted to Apple. Background location requires an installed native build; Expo Go is not a background-tracking test environment.

## Setup and cloud build

Use Node 22 or a supported newer version. From this directory:

```sh
npm ci
npm run typecheck
npx expo install --check
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform ios --profile production
```

EAS creates the build on a cloud Mac. You need your own Expo account and Apple Developer membership/signing credentials. Reserve/confirm `com.hussammakhoul.locationwrapped`; change it in app.json before the first release if needed. Let EAS link the project to your account and write its real project ID. No Apple or Expo credentials are included.

After an approved build, use App Store Connect/TestFlight for a device test. Submit only after the release checklist is complete:

```sh
npx eas-cli submit --platform ios --profile production
```

The production profile uses the latest available EAS iOS image. Check its actual Xcode/iOS SDK against Apple's requirements when building. A JavaScript export is not a native Xcode build or evidence of App Store acceptance.

## Behavior

- On-device SQLite history; no rolling point deletion. Legacy AsyncStorage history migrates once and remains recoverable until deletion.
- Background location is opt-in and can be paused. Demo mode stops recording. Permission denial leaves import and demo available.
- iOS controls background delivery. Force-quitting, pauses, battery management and permissions can create gaps.
- GPX and JSON import merge with saved records; overlapping visits at different locations are rejected. Imports accept 15 MB and 50,000 points per file. Split larger exports before importing. Native storage can accumulate more across imports/recording; web total limits are separate.
- Estimates require multiple nearby points spanning four minutes; gaps over twenty minutes and separate sessions do not create inferred stays or distance.
- Recaps use all recorded native history. Month charts aggregate calendar months across years. Web recaps retain their year selector.
- Export/share are explicit. Delete removes local recorded/imported history and the legacy copy; shared files/backups remain separate.

## Key files

- `src/services/storage.ts`: transactional database and migration
- `src/services/tracking.ts`: top-level native background task
- `src/context/AppContext.tsx`: permission controls, import/export, recovery
- `src/shared/core.js` and `import.js`: shared web/native history calculations
- `app.json`, `eas.json`: app identity, permission descriptions and cloud release profiles
- `src/data/legal.ts`: embedded privacy/help drafts

The privacy/help text intentionally remains a release draft until the publisher confirms a support contact and public URLs. See `../release/READINESS.md` and `../release/SUBMISSION.md` for remaining release work.
