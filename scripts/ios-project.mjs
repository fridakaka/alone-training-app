// Small, careful text edits and checks for the Xcode project (project.pbxproj).
// Plain text on purpose: the file is never re-written as a whole, so parts this script doesn't
// know (e.g. Xcode 16 synchronized folders for the widget) stay exactly as Xcode wrote them.
// Pure functions – tested in tests/unit/ios-project.test.js.

export const WIDGET_TARGET = 'AloneTimeWidget';
const WIDGET_TEMPLATE_FILES = [
  // What Xcode's Widget Extension template creates. Replaced by native/ios/AloneTimeWidget/.
  'AloneTimeWidget.swift',
  'AloneTimeWidgetLiveActivity.swift',
  'AloneTimeWidgetControl.swift',
  'AppIntent.swift',
];
export { WIDGET_TEMPLATE_FILES };

// All objects of one isa, as { id, name, body } (body = the text between the braces).
function objects(pbx, isa) {
  const out = [];
  const re = new RegExp(`\\n\\t\\t([0-9A-F]{24}) (?:/\\* ([^*]*?) \\*/ )?= \\{\\n\\t\\t\\tisa = ${isa};([\\s\\S]*?)\\n\\t\\t\\};`, 'g');
  for (const m of pbx.matchAll(re)) out.push({ id: m[1], name: m[2] ?? '', body: m[3], text: m[0] });
  return out;
}

const setting = (body, key) => {
  const m = body.match(new RegExp(`\\n\\t+${key} = ("[^"]*"|[^;]*);`));
  return m ? m[1].replace(/^"|"$/g, '') : null;
};

/** Native targets with their build configurations and the settings that matter here. */
export function targets(pbx) {
  const configs = Object.fromEntries(objects(pbx, 'XCBuildConfiguration').map((c) => [c.id, c]));
  const lists = Object.fromEntries(objects(pbx, 'XCConfigurationList').map((l) => [l.id, l]));
  return objects(pbx, 'PBXNativeTarget').map((t) => {
    const listId = setting(t.body, 'buildConfigurationList')?.split(' ')[0];
    const ids = [...(lists[listId]?.body.match(/[0-9A-F]{24}/g) ?? [])];
    return {
      id: t.id,
      name: setting(t.body, 'name'),
      productType: setting(t.body, 'productType'),
      configs: ids.filter((id) => configs[id]).map((id) => {
        const b = configs[id].body;
        return {
          id,
          name: setting(b, 'name'),
          bundleId: setting(b, 'PRODUCT_BUNDLE_IDENTIFIER'),
          deviceFamily: setting(b, 'TARGETED_DEVICE_FAMILY'),
          marketingVersion: setting(b, 'MARKETING_VERSION'),
          buildNumber: setting(b, 'CURRENT_PROJECT_VERSION'),
          deploymentTarget: setting(b, 'IPHONEOS_DEPLOYMENT_TARGET'),
        };
      }),
    };
  });
}

// Change one build setting inside one XCBuildConfiguration (add it if missing).
function setInConfig(pbx, configId, key, value) {
  const re = new RegExp(`(\\n\\t\\t${configId} (?:/\\* [^*]*? \\*/ )?= \\{\\n\\t\\t\\tisa = XCBuildConfiguration;(?:\\n\\t\\t\\t[^\\n]*?)*?\\n\\t\\t\\tbuildSettings = \\{)([\\s\\S]*?)(\\n\\t\\t\\t\\};)`);
  return pbx.replace(re, (all, head, settings, tail) => {
    const line = new RegExp(`\\n\\t\\t\\t\\t${key} = [^;]*;`);
    const next = `\n\t\t\t\t${key} = ${value};`;
    if (line.test(settings)) return head + settings.replace(line, next) + tail;
    // Keep Xcode's alphabetical order.
    const lines = settings.split('\n');
    const i = lines.findIndex((l) => l.trim() && l.trim().split(' ')[0].replace(/"/g, '') > key);
    if (i < 0) lines.push(next.slice(1));
    else lines.splice(i, 0, next.slice(1));
    return head + lines.join('\n') + tail;
  });
}

const isAppOrExtension = (t) =>
  t.productType === 'com.apple.product-type.application' || /app-extension/.test(t.productType ?? '');

/** iPhone only (TARGETED_DEVICE_FAMILY = 1) in every build configuration of the app and its extensions. */
export function iphoneOnly(pbx) {
  let out = pbx;
  for (const t of targets(pbx).filter(isAppOrExtension)) {
    for (const c of t.configs) if (c.deviceFamily !== '1') out = setInConfig(out, c.id, 'TARGETED_DEVICE_FAMILY', '1');
  }
  return out;
}

/** An app extension must have the same version and build number as the app (else upload fails). */
export function syncExtensionVersions(pbx) {
  const all = targets(pbx);
  const app = all.find((t) => t.productType === 'com.apple.product-type.application');
  if (!app) return pbx;
  let out = pbx;
  for (const ext of all.filter((t) => /app-extension/.test(t.productType ?? ''))) {
    for (const c of ext.configs) {
      const a = app.configs.find((x) => x.name === c.name) ?? app.configs[0];
      if (!a) continue;
      if (a.marketingVersion && c.marketingVersion !== a.marketingVersion) out = setInConfig(out, c.id, 'MARKETING_VERSION', a.marketingVersion);
      if (a.buildNumber && c.buildNumber !== a.buildNumber) out = setInConfig(out, c.id, 'CURRENT_PROJECT_VERSION', a.buildNumber);
    }
  }
  return out;
}

/**
 * What a TestFlight build needs from the project. Returns { problems: [], notes: [] }.
 * Never changes anything.
 */
export function checkProject(pbx, { widgetFiles = null, nativeWidgetFiles = [] } = {}) {
  const problems = [];
  const notes = [];
  const all = targets(pbx);
  const app = all.find((t) => t.productType === 'com.apple.product-type.application');
  const widget = all.find((t) => /app-extension/.test(t.productType ?? '') && /AloneTimeWidget/.test(t.name ?? ''));
  if (!app) problems.push('No app target found.');
  const appIds = new Set(app?.configs.map((c) => c.bundleId));
  if (app) notes.push(`App: bundle id ${[...appIds].join(', ')}, version ${app.configs[0]?.marketingVersion} (${app.configs[0]?.buildNumber}), iOS ${app.configs[0]?.deploymentTarget}`);
  if (appIds.size > 1) problems.push(`The app target has different bundle ids per configuration: ${[...appIds].join(', ')}`);

  if (!widget) {
    problems.push(`No "${WIDGET_TARGET}" widget extension target in the project (the Live Activity).`);
  } else {
    if (widget.productType !== 'com.apple.product-type.app-extension') notes.push(`Widget product type: ${widget.productType}`);
    for (const c of widget.configs) {
      const appId = app?.configs.find((x) => x.name === c.name)?.bundleId;
      if (!c.bundleId || !appId || !c.bundleId.startsWith(`${appId}.`)) {
        problems.push(`Widget (${c.name}): bundle id ${c.bundleId} must start with "${appId}."`);
      }
      if (c.deploymentTarget && Number(c.deploymentTarget) < 16.1) problems.push(`Widget (${c.name}): iOS ${c.deploymentTarget} – Live Activities need 16.1 or later (16.2 recommended).`);
    }
    notes.push(`Widget: bundle id ${widget.configs[0]?.bundleId}, iOS ${widget.configs[0]?.deploymentTarget}`);
    if (!new RegExp(`${widget.name}[^\\n]*\\.appex`).test(pbx) || !/dstSubfolderSpec = 13;/.test(pbx)) {
      problems.push('The app does not seem to embed the widget (no "Embed Foundation Extensions" build phase).');
    }
    for (const c of widget.configs) {
      const a = app?.configs.find((x) => x.name === c.name);
      if (a && (c.marketingVersion !== a.marketingVersion || c.buildNumber !== a.buildNumber)) {
        problems.push(`Widget (${c.name}) version ${c.marketingVersion} (${c.buildNumber}) differs from the app ${a.marketingVersion} (${a.buildNumber}) – run npm run ios:setup.`);
      }
    }
  }
  for (const t of all.filter(isAppOrExtension)) {
    for (const c of t.configs) {
      if (c.deviceFamily !== '1') problems.push(`${t.name} (${c.name}): TARGETED_DEVICE_FAMILY = ${c.deviceFamily ?? 'not set'} – should be 1 (iPhone only). Run npm run ios:setup.`);
    }
  }
  if (widgetFiles) {
    for (const f of nativeWidgetFiles) if (!widgetFiles.includes(f)) problems.push(`ios/App/${WIDGET_TARGET}/${f} is missing – run npm run ios:widget.`);
    const leftovers = widgetFiles.filter((f) => WIDGET_TEMPLATE_FILES.includes(f));
    if (leftovers.length) problems.push(`Xcode template files left in ios/App/${WIDGET_TARGET}: ${leftovers.join(', ')} – run npm run ios:widget.`);
    const unknown = widgetFiles.filter((f) => f.endsWith('.swift') && !nativeWidgetFiles.includes(f) && !WIDGET_TEMPLATE_FILES.includes(f));
    if (unknown.length) notes.push(`Other Swift files in ios/App/${WIDGET_TARGET} (left as they are): ${unknown.join(', ')}`);
  }
  if (/= undefined;/.test(pbx)) problems.push('project.pbxproj contains "= undefined;" values.');
  return { problems, notes, app, widget };
}
