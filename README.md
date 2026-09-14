# CSCE 482 Capstone — Mobile App

A cross-platform mobile app built with [Expo](https://expo.dev) (React Native) and TypeScript.
Runs on iOS, Android, and the web from a single codebase.

## Prerequisites

- **Node.js 20+** (this project was set up on v22). If you use `nvm`: `nvm install 22 && nvm use 22`
- **Expo Go** on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)) — the fastest way to see your changes on a real device
- Optional, for simulators: Xcode (iOS, macOS only) or Android Studio (Android)

## Getting started

```bash
git clone https://github.com/tbandari/CSCE482-Capstone.git
cd CSCE482-Capstone
npm install
npx expo start
```

Then scan the QR code with Expo Go, or press `i` for the iOS simulator, `a` for Android, `w` for web.

## Scripts

| Command | What it does |
| --- | --- |
| `npx expo start` | Start the dev server (hot reload) |
| `npm run ios` | Start and open the iOS simulator |
| `npm run android` | Start and open the Android emulator |
| `npm run web` | Start and open in the browser |
| `npx tsc --noEmit` | Typecheck the whole project |
| `npx expo-doctor` | Check the project for dependency/config problems |
| `npm run reset-project` | Move the starter screens aside and start from a blank `src/app` |

## Project layout

```
src/
  app/              # Screens. File-based routing — the filename IS the route.
    _layout.tsx     #   Root layout, wraps every screen
    index.tsx       #   "/"        — the home screen
    explore.tsx     #   "/explore"
  components/       # Reusable UI components
  constants/        # Theme tokens (colors, etc.)
  hooks/            # Custom React hooks
assets/             # Images, fonts, icons
app.json            # Expo app config — name, icon, splash, plugins
```

### Routing

This uses [Expo Router](https://docs.expo.dev/router/introduction/): add a file to `src/app/`
and it becomes a route. `src/app/profile.tsx` is reachable at `/profile`. Typed routes are
enabled, so TypeScript will catch links to routes that don't exist.

### Path aliases

Import with `@/` instead of long relative paths:

```ts
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
```

`@/` maps to `src/`, and `@/assets/` maps to `assets/`.

## Notes for the team

- **`expo-env.d.ts` and `.expo/` are generated and gitignored.** They appear the first time you
  run `npx expo start`. If your editor shows errors about `.css` imports before you've ever
  started the dev server, that's why — run it once.
- **There are no `ios/` or `android/` folders, and that's intentional.** This is a managed Expo
  project; the native projects are generated when needed (`npx expo prebuild`) or built in the
  cloud with [EAS Build](https://docs.expo.dev/build/introduction/). Don't commit them.
- **Adding a library?** Prefer `npx expo install <pkg>` over `npm install` — it picks the version
  that matches this Expo SDK.
- Run `npx expo-doctor` before opening a PR; it catches version mismatches early.

## Docs

Expo SDK 57 (the version pinned here): https://docs.expo.dev/versions/v57.0.0/
