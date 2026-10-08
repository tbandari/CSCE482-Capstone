# Location Wrapped release readiness — October 1, 2026

Status: fixes implemented; NOT yet ready to submit without the gates below.

## Implemented

- Native iPhone source with an app icon, bundle identifier candidate, version/build settings, permission descriptions and EAS cloud build profiles.
- Opt-in native background recording, pause/permission checks, explicit interruption guidance and separate demo history.
- SQLite history instead of a silently truncated 12,000-point buffer. Transactional import/deletion, legacy migration and recovery controls.
- GPX and JSON import with merge preservation, duplicate prevention, timestamp validation and rejection of conflicting overlapping stays.
- Shared native/web visit calculations. Removed invented city counts and decorative monthly totals. Recorded distance omits gaps; single-visit places are not described as first-ever discoveries.
- Privacy/help drafts accessible inside the native app and through web footer links. Delete/import/export controls available from native Profile.
- Updated PWA cache and unreadable-storage recovery. PWA still records only while active.

## Verified locally

- Native TypeScript check passed.
- iOS Metro/Hermes JavaScript bundle export passed (703 modules). This does not compile/sign iOS native code.
- Expo's installed SDK compatibility check passed using its bundled dependency versions; online check was blocked by a proxy timeout.
- Native configuration introspection succeeded; background location and purpose strings were generated.
- Import tests passed: repeat imports, preserved history, overlapping-visit conflicts, GPX timestamps/namespaces/segments, malformed XML/entity rejection, sparse-history behavior.
- SQLite tests passed using real in-memory SQLite with Expo interfaces mocked: migration, duplicate points, failed-write rollback, pause filtering, permission denial, task storage, deletion.
- Web DOM simulation passed: initialization, manual visit/save/reload, demo isolation, recap navigation/reset, deletion confirmation.
- Dependency-provided Apple privacy manifests inspected for file-system, task-manager and AsyncStorage packages. Final archive aggregation is not verified until native build.

## Required gates still open

1. Confirm publisher identity, Apple Developer enrollment, Expo project ownership and availability of the bundle identifier. No account purchase or submission was performed.
2. Confirm a monitored public support contact. Host the prepared privacy/help pages on a public URL; the current website remains access-controlled and its URLs are not ready to use as Apple's public policy/support URLs.
3. Produce an EAS signed iOS build. Inspect native build logs, SDK version, entitlements, privacy manifest aggregation and archive validation. Resolve any issues found there.
4. Test on an actual iPhone. At minimum: fresh install; demo without permission; denied/Always permission; foreground capture; walk with phone locked/backgrounded; pause; permission revocation; force-quit/relaunch; data persistence; GPX/JSON import; delete; export/share; airplane-mode behavior. Include low storage and a large real history. A tester can do this even if the publisher has no Mac.
5. Capture actual screenshots from that build, including the required App Store display sizes. Check text and controls on a small phone and with larger text. No native visual/device QA was possible here.
6. Complete App Store Connect privacy, age rating, content rights, export compliance, support/review contact and availability fields with the publisher's true details. Review service/SDK behavior before selecting privacy answers; do not auto-submit an unverified “Data Not Collected” label.
7. Submit only after these gates pass. Apple may still reject the app; source review cannot guarantee acceptance.

## Repeat checks

From repository root after `cd native && npm ci`:

```sh
node tests/imports.mjs
node tests/storage.mjs
node tests/ui.mjs
npm --prefix native run typecheck
```

The two shared JavaScript modules in `native/src/shared` must stay identical to their copies in `dist`.
