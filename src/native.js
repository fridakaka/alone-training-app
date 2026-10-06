// The only place that talks to iOS. In the PWA (a normal browser) every function here
// does nothing, so the web app works exactly as before.
//
// In the iOS app, Capacitor injects window.Capacitor; native plugins are reached through it
// (no bundler needed): Preferences (durable storage), Filesystem + Share (save files),
// and the app's own LiveActivity plugin (ios/App/App/LiveActivityPlugin.swift).

const cap = () => globalThis.Capacitor;

export function isNativeApp() {
  try {
    return Boolean(cap()?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function plugin(name) {
  const C = cap();
  if (!C) return null;
  return C.Plugins?.[name] ?? (typeof C.registerPlugin === 'function' ? C.registerPlugin(name) : null);
}

// ---------- durable storage (iOS: UserDefaults via @capacitor/preferences) ----------

export async function readDurable(key) {
  if (!isNativeApp()) return null;
  try {
    const { value } = await plugin('Preferences').get({ key });
    return value ?? null;
  } catch {
    return null;
  }
}

export function writeDurable(key, value) {
  if (!isNativeApp()) return;
  plugin('Preferences')?.set({ key, value }).catch(() => {});
}

// ---------- Live Activity ----------

export async function startLiveActivity(payload) {
  if (!isNativeApp()) return { started: false, reason: 'web' };
  try {
    return await plugin('LiveActivity').start(payload);
  } catch (err) {
    return { started: false, reason: String(err?.message || err) };
  }
}

export async function endLiveActivity() {
  if (!isNativeApp()) return;
  try {
    await plugin('LiveActivity').end();
  } catch {}
}

// ---------- files (iOS: write to the app's cache, then the share sheet → "Save to Files") ----------

export async function shareFileNative(fileName, text) {
  const fs = plugin('Filesystem');
  const share = plugin('Share');
  const { uri } = await fs.writeFile({ path: fileName, data: text, directory: 'CACHE', encoding: 'utf8' });
  try {
    await share.share({ title: fileName, url: uri, files: [uri] });
    return true;
  } catch (err) {
    if (/cancel/i.test(String(err?.message || err))) return false;
    throw err;
  }
}
