// Starts the app. In the iOS app the saved data is first read from durable native storage
// (UserDefaults) into the page's storage, and every save is mirrored back. In the PWA this
// does nothing extra.
import { isNativeApp, readDurable, writeDurable } from './native.js';
import { KEY, setPersistHook } from './store.js';

if (isNativeApp()) {
  const durable = await readDurable(KEY);
  try {
    if (durable) localStorage.setItem(KEY, durable);
    else {
      // First run of this version: keep whatever the web view already had.
      const local = localStorage.getItem(KEY);
      if (local) writeDurable(KEY, local);
    }
  } catch {}
  setPersistHook((key, value) => writeDurable(key, value));
}

await import('./app.js');
