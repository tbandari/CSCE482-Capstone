/**
 * Installs the expo-sqlite `localStorage` polyfill on iOS and Android.
 * The web variant of this file is intentionally empty: browsers already have
 * localStorage, and bundling the polyfill would drag wasm SQLite into the web build.
 */
import 'expo-sqlite/localStorage/install';
