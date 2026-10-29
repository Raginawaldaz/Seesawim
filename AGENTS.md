# AGENTS.md — Seesawim project context

## What this project is

Seesawim is a small terminal text editor inspired by Vim, built with Node.js
(ESM) and the `neo-blessed` TUI library. Its distinctive idea is a **"seesaw"
layout** instead of Vim's global mode flip: the top is a read-only code
viewport, the bottom is a dedicated input row. `Ctrl+↑` / `Ctrl+↓` (or
`Ctrl+K` / `Ctrl+J`) tip the seesaw between command mode and insert mode.

Author: Reynolds. License: Apache-2.0. `"type": "module"`, Node >= 18.

## Commands

```bash
npm install                 # install deps (neo-blessed, yaml)
npm start                   # open demo.txt (project root) in the TUI
npm start -- path/to/file.txt   # open a specific file (mind the space after --)
npm run install-global      # install a global `ssw` launcher (user-writable dir, no symlink/admin)
npm run uninstall-global
node scripts/sanity-buffer.js   # one-shot TextBuffer / undo-invert checks
```

There is **no test suite, linter, or build step**. "Running" it means launching
the interactive TUI. It must be run in a real terminal (Windows Terminal etc.),
not an IDE integrated terminal — see the README for why.

## Architecture

```
src/
  main.js                      # CLI entry
  core/
    editor.js                  # Mode state machine, key handlers, save/quit, extension host wiring
    buffer.js                  # TextBuffer class (replaceLines primitive + change events)
    cursor.js                  # Pure cursor helpers (clamp/move against buffer)
    commands.js                # Core command-mode motions (hjkl) + i / :
    ex.js                      # Ex-command parsing (:w :q :wq :x)
    keys.js                    # blessed key -> mode/command normalization
    settings.js                # Load settings.yaml (defaults on missing/invalid)
    extensions.js              # Extension host (hooks, events, enable flags)
    ui/
      screen.js                # neo-blessed layout, Windows cls patch, real cursor
      text.js                  # displayWidth / sliceDisplay / escapeTags
      renderer.js              # Viewport-only paint, dirty regions, coalesced redraw
  extensions/
    index.js                   # Registry
    undo/                      # u / Ctrl+R
    count/                     # Digit count prefix
    lineNumbers/               # Gutter line numbers
    cursorLine/                # Current-line marker
    autoClearMessage/          # Clear status message on next key
bin/ssw.js
scripts/
  install-global.js
  uninstall-global.js
  sanity-buffer.js
settings.yaml                  # Extension 1/0 switches
demo.txt
```

### Data flow

1. `startEditor(filePath)` reads the file (or treats `ENOENT` as a new file),
   builds `TextBuffer` + `state`, creates the UI, loads extensions from
   `settings.yaml`, and installs a single `screen.on('keypress')` handler.
   **There is no nested textbox** — all keys route through one handler.
2. `state` holds: `mode`, `buffer` (TextBuffer), `cursor` `{row,col}`,
   `countPrefix`, `filePath`, `dirty`, `message`/`messageKind`, and input-line
   state (`inputText`, `inputCol`, `inputHScroll`).
3. `requestPaint()` coalesces redraws via `setImmediate`. The renderer paints
   only the visible viewport (no full-buffer `setContent`), skips unchanged
   regions (title/status/input/code), then moves the **real** terminal cursor
   to the input caret (insert/ex) or hides it (command).
4. Modes:
   - **command**: bottom row shows a red `> `; `hjkl` motion with optional
     count prefix (count extension), `i` → insert, `:` → ex, `u` / `Ctrl+R`
     undo/redo when enabled.
   - **insert**: bottom row shows the current line; edits sync into the buffer
     on every keystroke. `Enter` **splits** at the caret; Backspace at column 0
     joins with the previous line.
   - **ex**: bottom row starts with `:`; `Enter` runs `runExCommand`.

### Key files to read first

- `src/core/editor.js` — the heart of the editor; most behavior lives here.
- `src/core/ui/renderer.js` — viewport rendering and paint coalescing.
- `src/core/buffer.js` — TextBuffer mutation API + change events.
- `src/core/extensions.js` — how optional features plug in.

## Conventions & gotchas (important)

- **ESM everywhere**: use `import`/`export`, not `require`. `ui/screen.js` and
  `ui/text.js` use `createRequire` to load neo-blessed (CJS).
- **CJK / display width matters.** `ui/text.js` has `displayWidth`,
  `sliceDisplay`, and `escapeTags` that slice by display columns (CJK = 2).
  The status/title use ASCII-only marks (e.g. ` *` for dirty) because Unicode
  glyphs break column math on Windows consoles. Gutter width ignores blessed
  tags when measuring.
- **Real cursor management**: blessed can leave a stray cursor position, so
  paint hides the cursor before `screen.render()` and then explicitly
  repositions it via `placeCursor`/`hideRealCursor`. Don't fight this pattern.
- **Windows quirks already handled** (keep them):
  - `suppressBlessedWindowsCls()` in `ui/screen.js` patches
    `child_process.execSync` to skip neo-blessed's `cls` calls.
  - `pickTerminal()` forces `xterm-256color` on win32 / dumb terminals.
  - `consumeEnter` de-duplicates paired "enter"/"return" events within 80ms
    (same-name repeats are *not* swallowed, so rapid Enter still splits).
  - `install-global.js` writes shims directly instead of `npm link`.
- **Ex command grammar** (in `ex.js`): regex
  `^(write|wq|quit|xit|x|w|q)(!?)(?:\s+(.*))?$`.
  `:q` on a dirty buffer returns `E37`; `:q!` overrides; `:x` writes only when
  dirty or given an arg.
- **Extensions** are toggled in root `settings.yaml` (`1`/`0`). Each module
  exports `{ name, setup(ctx) }`. Core stays usable with every extension off.
- **No visual mode, no syntax highlighting, no plugins beyond the built-in
  extensions** yet. Don't assume they exist.
- The status line is `{inverse} MODE {/inverse} row:col` plus optional
  count (`xN`) and message. With `autoClearMessage` on, messages clear on the
  next keypress.

## Style notes

- Keep helper modules pure where possible (`cursor.js`): they take
  `buffer`/`cursor` and return new values without mutating screen state.
- All buffer mutations go through `TextBuffer` (`replaceLines` / `setLine` /
  `splitLine` / `joinWithPrevious`) so undo and the renderer see `change`
  events and `version` bumps.
- New command-mode keys in extensions should follow the result-object shape:
  `{ handled, enterInsert, enterEx, message }` (return `null` to fall through).
