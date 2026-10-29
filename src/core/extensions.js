import { loadSettings, isEnabled } from './settings.js';
import { allExtensions } from '../extensions/index.js';

/**
 * Create the extension host, load enabled extensions, and return hooks.
 * @param {object} deps
 * @param {object} deps.state
 * @param {import('./buffer.js').TextBuffer} deps.buffer
 * @param {() => void} deps.paint
 * @param {(text: string, kind?: string) => void} deps.setMessage
 */
export function createExtensionHost({ state, buffer, paint, setMessage }) {
  const { settings, error: settingsError } = loadSettings();

  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  /** @type {Function[]} */
  const commandKeyHandlers = [];
  /** @type {Function[]} */
  const gutters = [];
  /** @type {Function[]} */
  const lineDecorators = [];

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch {
        /* ignore */
      }
    }
  }

  const ctx = {
    state,
    buffer,
    paint,
    setMessage,
    settings,
    on,
    addCommandKey(fn) {
      commandKeyHandlers.push(fn);
    },
    addGutter(fn) {
      gutters.push(fn);
    },
    addLineDecorator(fn) {
      lineDecorators.push(fn);
    },
  };

  const enabled = [];
  for (const ext of allExtensions) {
    const flag = settings.extensions[ext.name];
    if (!isEnabled(flag)) continue;
    try {
      ext.setup(ctx);
      enabled.push(ext.name);
    } catch (err) {
      setMessage(
        `extension ${ext.name}: ${err && err.message ? err.message : err}`,
        'error'
      );
    }
  }

  // Forward buffer changes to host listeners
  buffer.on((ev) => emit('change', ev));

  return {
    settings,
    settingsError,
    enabled,
    emit,
    on,
    runCommandKeys(cmdKey, rawKey) {
      for (const fn of commandKeyHandlers) {
        try {
          const result = fn(cmdKey, rawKey);
          if (result && result.handled) return result;
        } catch {
          /* ignore */
        }
      }
      return null;
    },
    hooks: { gutters, lineDecorators },
  };
}
