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
npm install          # install deps (only neo-blessed)
npm start            # open demo.txt (project root) in the TUI
npm start -- path/to/file.txt   # open a specific file (mind the space after --)
npm run install-global   # install a global `ssw` launcher (user-writable dir, no symlink/admin)
npm run uninstall-global
```

There is **no test suite, linter, or build step**. "Running" it means launching
the interactive TUI. It must be run in a real terminal (Windows Terminal etc.),
not an IDE integrated terminal — see the README for why.

## Architecture

```
src/
  main.js       # CLI entry: resolves the target path (argv[2] or demo.txt), calls startEditor
  editor.js     # Core: mode state machine (command/insert/ex), key handlers, save/quit, paint()
  ui.js         # neo-blessed layout + rendering helpers (renderCode/renderTitle/renderStatus/renderInput)
  buffer.js     # Pure line-buffer helpers (split/join/get/set/advanceAfterEnter)
  cursor.js     # Pure cursor helpers (create/clamp/moveBy/moveVertical/moveHorizontal)
  commands.js   # Command-mode motion + counts, ex-command parsing (:w :q :wq :x)
  keys.js       # blessed key -> mode/command normalization
bin/ssw.js      # same entry logic as main.js, for the global launcher
scripts/
  install-global.js    # writes ssw / ssw.cmd / ssw.ps1 to a writable bin dir, updates User PATH
  uninstall-global.js
demo.txt        # default file opened when no arg is given
```

### Data flow

1. `startEditor(filePath)` reads the file (or treats `ENOENT` as a new file),
   builds `state` and the `ui`, and installs a single `screen.on('keypress')`
   handler. **There is no nested textbox** — all keys route through one handler.
2. `state` holds: `mode`, `lines` (array of strings), `cursor` `{row,col}`,
   `countPrefix`, `filePath`, `dirty`, `message`/`messageKind`, and input-line
   state (`inputText`, `inputCol`, `inputHScroll`).
3. `paint()` is the single render entry point: it clamps the cursor, redraws
   title/code/status/input, calls `screen.render()`, then moves the **real**
   terminal cursor to the input caret (insert/ex) or hides it (command).
4. Modes:
   - **command**: bottom row shows a red `> `; `hjkl` motion with optional
     count prefix, `i` → insert, `:` → ex.
   - **insert**: bottom row shows the current line; edits sync into
     `state.lines[row]` on every keystroke (`syncInsertToBuffer`). `Enter`
     commits the line and advances (creating a blank line if at the end).
   - **ex**: bottom row starts with `:`; `Enter` runs `runExCommand`.

### Key files to read first

- `src/editor.js` — the heart of the editor; most behavior lives here.
- `src/ui.js` — layout and all rendering; many Windows/cursor quirks are
  documented inline.

## Conventions & gotchas (important)

- **ESM everywhere**: use `import`/`export`, not `require`. `ui.js` uses
  `createRequire` to load neo-blessed (CJS).
- **CJK / display width matters.** The editor supports CJK input; `ui.js` has
  `displayWidth`, `sliceDisplay`, and `escapeTags` that slice by display
  columns (CJK = 2). The status/title use ASCII-only marks (e.g. ` *` for
  dirty) because Unicode glyphs break column math on Windows consoles.
- **Real cursor management**: blessed can leave a stray cursor position, so
  `paint()` hides the cursor before `screen.render()` and then explicitly
  repositions it via `placeCursor`/`hideRealCursor`. Don't fight this pattern.
- **Windows quirks already handled** (keep them):
  - `suppressBlessedWindowsCls()` in `ui.js` patches `child_process.execSync`
    to skip neo-blessed's `cls` calls, which would wipe terminal scrollback
    and break alternate-screen save/restore.
  - `pickTerminal()` forces `xterm-256color` on win32 / dumb terminals.
  - `consumeEnter` de-duplicates the double "enter"/"return" events Windows
    emits for a single keypress.
  - `install-global.js` writes shims directly instead of `npm link` (symlink
    privileges fail on Windows).
- **Ex command grammar** (in `commands.js`): regex `^(write|wq|quit|xit|x|w|q)(!?)(?:\s+(.*))?$`.
  `:q` on a dirty buffer returns `E37`; `:q!` overrides; `:x` writes only when
  dirty or given an arg.
- **No undo, no visual mode, no syntax highlighting, no plugins** yet — the
  README explicitly lists these as future work. Don't assume they exist.
- The status line is `{inverse} MODE {/inverse} row:col` plus optional
  count (`xN`) and message. Messages auto-clear on the next keypress via
  `clearMessage()`.

## Style notes

- Keep helper modules pure where possible (`buffer.js`, `cursor.js`): they take
  `lines`/`cursor` and return new values without mutating screen state.
- `state.lines` is a plain mutable array of strings; `setLine`/`ensureLine`
  mutate it in place and return it.
- New commands should follow the `handleCommandKey` result-object shape:
  `{ handled, enterInsert, enterEx, message }`.
