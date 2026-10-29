/**
 * Simulate undo extension grouping without a TUI.
 * Run: node scripts/sanity-undo.js
 */
import { TextBuffer } from '../src/core/buffer.js';
import undoExt from '../src/extensions/undo/index.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

const buffer = TextBuffer.fromString('hello world');
const state = {
  mode: 'command',
  buffer,
  cursor: { row: 0, col: 0 },
  dirty: false,
  inputText: '',
  inputCol: 0,
};

const listeners = new Map();
function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
}
function emit(event, payload) {
  for (const fn of listeners.get(event) || []) fn(payload);
}

const commandKeys = [];
const ctx = {
  state,
  buffer,
  paint() {},
  setMessage() {},
  on,
  addCommandKey(fn) {
    commandKeys.push(fn);
  },
};

buffer.on((ev) => emit('change', ev));
undoExt.setup(ctx);

function runCmd(cmdKey, full) {
  for (const fn of commandKeys) {
    const r = fn(cmdKey, { full });
    if (r && r.handled) return r;
  }
  return null;
}

console.log('Insert session as one undo group');
{
  emit('modeChange', { from: 'command', to: 'insert' });
  state.mode = 'insert';
  state.cursor = { row: 0, col: 5 };
  buffer.setLine(0, 'helloX world', {
    cursorBefore: { row: 0, col: 5 },
    cursorAfter: { row: 0, col: 6 },
  });
  buffer.setLine(0, 'helloXY world', {
    cursorBefore: { row: 0, col: 6 },
    cursorAfter: { row: 0, col: 7 },
  });
  buffer.splitLine(0, 7, { cursorBefore: { row: 0, col: 7 } });
  state.cursor = { row: 1, col: 0 };
  emit('modeChange', { from: 'insert', to: 'command' });
  state.mode = 'command';

  assert(buffer.toString() === 'helloXY\n world', `after insert: ${JSON.stringify(buffer.toString())}`);

  const u = runCmd('u', 'u');
  assert(u && u.handled, 'undo handled');
  assert(buffer.toString() === 'hello world', `undone: ${JSON.stringify(buffer.toString())}`);

  const r = runCmd('', 'C-r');
  assert(r && r.handled, 'redo handled');
  assert(buffer.toString() === 'helloXY\n world', `redone: ${JSON.stringify(buffer.toString())}`);

  runCmd('u', 'u');
  assert(buffer.toString() === 'hello world', 'undo again');
}

console.log('Empty undo message');
{
  const msg = runCmd('u', 'u');
  assert(
    msg && msg.message === 'Already at oldest change',
    'oldest message'
  );
}

console.log('');
console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
