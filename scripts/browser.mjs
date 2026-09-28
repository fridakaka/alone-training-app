import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

// Uses a locally installed Chromium (preinstalled in CI/cloud, or your own Chrome).
export function launch() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const executablePath = candidates.find((p) => existsSync(p));
  return chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
}
