# Orbit — CSCE 482 Capstone

Your location history, owned by you. Orbit is a mobile app (iOS + Android, Expo /
React Native) that records where you go with low-power background tracking, imports
the Google Timeline export your phone already produces, and turns raw fixes into
visits you can see on a map and a timeline. A FastAPI backend (this repo,
`backend/`) will hold accounts and cloud sync so your history survives your next phone.

Team Adobe: George Dai, Zayd Nadir, Tanish Bandari, Hussam Makhoul, Roger Liu.

## Repository layout

```
src/
  app/                  Screens. File-based routing: the filename is the route.
    _layout.tsx         Root stack; defines the background location task
    index.tsx           "/" -> onboarding or the tabs
    onboarding/         Welcome + location permission flow
    (tabs)/             map / timeline / import / settings, each its own stack
    visit/[id].tsx      Visit detail sheet
  components/           Design-system primitives (Button, Section/Row, Notice, VisitsMap…)
  constants/theme.ts    Design tokens: colors (light/dark), spacing, radius
  hooks/                useTheme, useStoreQuery
  lib/
    geo/                Haversine, centroid, offsets
    stays/              Noise filter, stay-point detection, evaluation harness
    import/             Google Timeline parser (Android, iOS and legacy Takeout shapes)
    demo/               Deterministic synthetic week (demo data + ground truth)
    db/                 Local store: SQLite on device, localStorage on web
    location/           Tracking service: background task + foreground fallback
    pipeline/           Import and recompute orchestration
backend/                FastAPI service (see backend/README.md)
docs/reports/           Weekly progress reports and evidence
.github/workflows/      CI: typecheck, unit tests, expo-doctor, pytest
```

## Prerequisites

- **Node.js 20+** (`nvm install 22 && nvm use 22` if you use nvm)
- **Expo Go** on your phone for the fastest loop
  ([iOS](https://apps.apple.com/app/expo-go/id982107779) /
  [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Optional: Xcode or Android Studio for simulators, Python 3.12+ for the backend

## Run the app

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `i` (iOS simulator), `a` (Android), `w` (web).
On the Import tab, **Load sample week** fills the app with a synthetic week around
College Station so every screen has data.

### Backend URL

The app reads `EXPO_PUBLIC_API_URL` and defaults to `http://127.0.0.1:8000` for
web and the iOS simulator. An Android emulator reaches the host machine at
`http://10.0.2.2:8000`; a physical phone needs the computer's LAN IP and both
devices on the same network:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000 npx expo start
# Physical phone example:
EXPO_PUBLIC_API_URL=http://192.168.1.50:8000 npx expo start
```

### Expo Go vs. development build

Expo Go can run everything except background location: TaskManager is unavailable in
Expo Go on Android and has no background execution on iOS. In Expo Go, Orbit falls
back to recording while the app is open. To test true background tracking, build a
development client:

```bash
npx expo run:ios       # needs Xcode
npx expo run:android   # needs Android Studio
# or in the cloud: npx eas build --profile development
```

The `expo-location` config plugin in `app.json` already declares the background
modes and permission strings.

## Scripts

| Command | What it does |
| --- | --- |
| `npx expo start` | Dev server with hot reload |
| `npm run typecheck` | `tsc --noEmit` over the whole project |
| `npm test` | Jest unit tests (`src/**/__tests__`) |
| `npm run eval:stays` | Stay-detection precision/recall on the synthetic week |
| `npx expo-doctor` | Dependency and config health check |
| `npm run lint` | ESLint via `expo lint` |

## Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload      # http://127.0.0.1:8000/docs
python -m pytest -q
```

Details, endpoints and PostgreSQL setup: [backend/README.md](backend/README.md).

## How the data flows

1. **Points** come from the device (`expo-location`, batched by the OS in the
   background) or from an imported Google Timeline export. They are stored locally
   (`expo-sqlite`) with a unique `(ts, lat, lon)` index, so re-importing is safe.
2. **Filter** drops invalid, low-accuracy and duplicate fixes plus out-and-back GPS spikes.
3. **Stay detection** (Li et al. 2008 stay-point algorithm, 100 m / 10 min) clusters
   the clean trace into **visits**, which are always derived and can be recomputed.
4. Map, timeline and visit detail read visits; Settings exposes recompute, stats and
   hard delete.
5. When signed in, sync uploads unsent points first and then downloads resolved
   server visits with their place names. Each phase keeps its own cursor, so a
   failed download does not undo an upload that the server already accepted.

Server recompute runs as a background job. Start `python -m app.worker` beside
the API, call `POST /visits/recompute`, and follow the returned id at
`GET /jobs/{job_id}`. The next successful app sync refreshes local visits from
the server.

## Conventions

- Add libraries with `npx expo install <pkg>` so versions match the SDK.
- Run `npm run typecheck && npm test` before opening a PR; CI runs the same plus
  `expo-doctor` and the backend tests.
- `expo-env.d.ts` and `.expo/` are generated by `npx expo start` and gitignored.
- No `ios/` or `android/` folders are committed (managed workflow / CNG).
- Read the SDK 57 docs, not "latest": https://docs.expo.dev/versions/v57.0.0/
