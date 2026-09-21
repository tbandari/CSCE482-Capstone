/** Native token persistence is encrypted by the platform keychain/keystore. */
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'orbit.session.v1';

export function readStoredSession(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export function writeStoredSession(value: string): Promise<void> {
  return SecureStore.setItemAsync(SESSION_KEY, value);
}

export function deleteStoredSession(): Promise<void> {
  return SecureStore.deleteItemAsync(SESSION_KEY);
}
