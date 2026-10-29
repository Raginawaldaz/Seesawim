import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Project root (src/core -> ../..) */
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

export const DEFAULT_SETTINGS = {
  extensions: {
    undo: 1,
    count: 1,
    lineNumbers: 1,
    cursorLine: 1,
    autoClearMessage: 1,
  },
};

function asFlag(v, fallback) {
  if (v === 1 || v === true || v === '1' || v === 'true' || v === 'on') return 1;
  if (v === 0 || v === false || v === '0' || v === 'false' || v === 'off') return 0;
  return fallback;
}

/**
 * Load settings.yaml from the project root. Missing file / missing keys
 * fall back to defaults. Parse errors also fall back, with an error message.
 * @returns {{ settings: typeof DEFAULT_SETTINGS, error: string|null }}
 */
export function loadSettings() {
  const filePath = path.join(PROJECT_ROOT, 'settings.yaml');
  const settings = {
    extensions: { ...DEFAULT_SETTINGS.extensions },
  };
  let error = null;

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { settings, error: null };
    }
    return {
      settings,
      error: `settings.yaml: ${err.message || err}`,
    };
  }

  try {
    const parsed = YAML.parse(raw) || {};
    const ext = parsed.extensions && typeof parsed.extensions === 'object'
      ? parsed.extensions
      : {};
    for (const key of Object.keys(DEFAULT_SETTINGS.extensions)) {
      if (Object.prototype.hasOwnProperty.call(ext, key)) {
        settings.extensions[key] = asFlag(
          ext[key],
          DEFAULT_SETTINGS.extensions[key]
        );
      }
    }
  } catch (err) {
    error = `settings.yaml parse error: ${err.message || err}`;
  }

  return { settings, error };
}

/** @param {number|boolean} flag */
export function isEnabled(flag) {
  return flag === 1 || flag === true;
}
