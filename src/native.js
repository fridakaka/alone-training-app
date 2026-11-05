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

// ---------- "target reached": vibration ----------

/** A short tap. iOS app: Haptics. Browser: navigator.vibrate (Android; iPhone Safari has none). */
export function buzz() {
  if (isNativeApp()) {
    plugin('Haptics')?.notification({ type: 'SUCCESS' }).catch(() => {});
    return;
  }
  try {
    globalThis.navigator?.vibrate?.([120, 80, 120]);
  } catch {}
}

/** iOS app: a local notification at the target time (asks for permission the first time). */
export async function scheduleReminder(id, { at, title, body }) {
  if (!isNativeApp()) return false;
  try {
    const ln = plugin('LocalNotifications');
    await ln.cancel({ notifications: [{ id }] }).catch(() => {});
    await ln.schedule({
      notifications: [{ id, title, body, schedule: { at: new Date(at) }, sound: 'default', foreground: false }],
    });
    return true;
  } catch {
    return false; // e.g. notifications not allowed: the tap in the open app still works
  }
}

export async function cancelReminder(id) {
  if (!isNativeApp()) return;
  try {
    await plugin('LocalNotifications').cancel({ notifications: [{ id }] });
  } catch {}
}
