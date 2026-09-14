/**
 * Minimal change notification so screens refresh after imports, tracking
 * fixes and recomputes without threading callbacks through the app.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeToData(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyDataChanged(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn('data listener failed', error);
    }
  }
}
