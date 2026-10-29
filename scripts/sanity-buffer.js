/**
 * One-shot sanity checks for TextBuffer split/join and undo round-trip.
 * Run: node scripts/sanity-buffer.js
 */
import { TextBuffer } from '../src/core/buffer.js';

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

console.log('TextBuffer basics');
{
  const b = TextBuffer.fromString('hello\nworld');
  assert(b.lineCount === 2, 'two lines from string');
  assert(b.getLine(0) === 'hello', 'getLine 0');
  assert(b.getLine(1) === 'world', 'getLine 1');

  const next = b.splitLine(0, 2);
  assert(next.row === 1 && next.col === 0, 'split cursor');
  assert(b.toString() === 'he\nllo\nworld', `split content (${JSON.stringify(b.toString())})`);

  const joined = b.joinWithPrevious(1);
  assert(joined && joined.row === 0 && joined.col === 2, 'join cursor');
  assert(b.toString() === 'hello\nworld', 'join restores');
}

console.log('CRLF normalize');
{
  const b = TextBuffer.fromString('a\r\nb\rc');
  assert(b.toString() === 'a\nb\nc', 'crlf -> lf');
}

console.log('replaceLines + change events');
{
  const b = TextBuffer.fromString('one\ntwo\nthree');
  const events = [];
  b.on((ev) => events.push(ev));
  b.replaceLines(1, 1, ['TWO', '2.5']);
  assert(b.toString() === 'one\nTWO\n2.5\nthree', 'replace mid');
  assert(events.length === 1, 'one change event');
  assert(events[0].removed.join('|') === 'two', 'removed');
  assert(events[0].inserted.join('|') === 'TWO|2.5', 'inserted');
  assert(b.version === 1, 'version bumped');
}

console.log('setLine no-op');
{
  const b = TextBuffer.fromString('x');
  let n = 0;
  b.on(() => {
    n += 1;
  });
  b.setLine(0, 'x');
  assert(n === 0 && b.version === 0, 'identical setLine is no-op');
  b.setLine(0, 'y');
  assert(n === 1 && b.version === 1, 'real setLine emits');
}

console.log('undo round-trip (manual invert)');
{
  const b = TextBuffer.fromString('abc');
  const log = [];
  b.on((ev) => log.push({ ...ev, removed: ev.removed.slice(), inserted: ev.inserted.slice() }));

  b.splitLine(0, 1); // a | bc
  assert(b.toString() === 'a\nbc', 'after split');

  // Invert last change
  const last = log[log.length - 1];
  b.replaceLines(last.row, last.inserted.length, last.removed);
  assert(b.toString() === 'abc', 'undo split via invert');
}

console.log('100k-line viewport cost (construct only)');
{
  const lines = [];
  for (let i = 0; i < 100_000; i++) lines.push(`line-${i}`);
  const t0 = Date.now();
  const b = new TextBuffer(lines);
  b.setLine(50_000, 'mutated');
  const t1 = Date.now();
  assert(b.lineCount === 100_000, '100k lines');
  assert(b.getLine(50_000) === 'mutated', 'mid mutate');
  assert(t1 - t0 < 2000, `mutate under 2s (${t1 - t0}ms)`);
}

console.log('');
console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
