/**
 * Android emulators reach the host at 10.0.2.2; physical phones need the
 * development machine's LAN address. Override this with EXPO_PUBLIC_API_URL.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(
  /\/$/,
  '',
);
