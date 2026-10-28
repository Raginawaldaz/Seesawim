# Seesawim

A small terminal text editor inspired by Vim — without the usual mode-switching friction.

**Chinese version:** [README-CN.md](./README-CN.md)

## Background

I find Vim’s insert / normal mode switching annoying in day-to-day editing, but I still wanted to learn how Vim-style editors feel and work. Seesawim is a personal experiment: keep the useful command language (`hjkl`, counts, `:w`, `:q`), and change how modes are entered.

Instead of Esc / `i` as the main “flip the whole editor” gesture, Seesawim uses a **seesaw layout**:

- **Top:** code viewport (browse and navigate)
- **Bottom:** a dedicated input line (edit text or type `:` commands)

`Ctrl+↑` and `Ctrl+↓` tip the seesaw between command mode and insert mode. When you edit, you type in the bottom line; the buffer above stays in sync.

## Requirements

- Node.js 18+
- A real interactive terminal (Windows Terminal, macOS Terminal, iTerm, etc.)

## Install & run

```bash
npm install
```

### Global command `ssw` (recommended)

From the project directory, run once:

```bash
npm run install-global
```

Then use it from any directory:

```bash
ssw                  # open the bundled demo.txt
ssw notes.txt        # open a file in the current directory
ssw "D:\path\a.txt"  # open an absolute path
```

If `ssw` is not found, make sure Node’s global folder (`npm config get prefix`) is on your PATH. Uninstall with: `npm run uninstall-global`.

> On Windows, `npm link` often fails without symlink privileges; `install-global` avoids that (no admin / Developer Mode required).

### Run inside this project only

```bash
npm start
npm start -- path/to/file.txt
```

PowerShell example (keep a space after `--`):

```powershell
npm start -- "D:\Seesawim\Demo.txt"
```

With no argument, Seesawim opens `demo.txt` in the project root.

> **Terminal tip:** Run Seesawim in an external terminal (Windows Terminal, etc.). The Cursor / VS Code integrated terminal often breaks full-screen TUI apps (garbled UI, dead keys). If `Ctrl+↑/↓` is ignored by your terminal, use the fallbacks: `Ctrl+K` for command mode, `Ctrl+J` for insert mode.
>
> The editor uses the terminal's **alternate screen** and the **real cursor** (hidden in command mode, sitting in the input row in insert / ex). `:q` / `:wq` / `:q!` restore your previous terminal contents. On Windows it speaks xterm VT sequences (Windows Terminal and Windows 10+ conhost).

## Modes

| Mode | How to enter | What it does |
|------|----------------|--------------|
| **Command** | `Ctrl+↑` or `Ctrl+K` | Bottom line is empty. Keys are commands (`hjkl`, counts, `i`, `:`). Real cursor is hidden; current line stays highlighted. |
| **Insert** | `Ctrl+↓`, `Ctrl+J`, or `i` | Bottom line shows the current buffer line. The real cursor sits in that row (IME follows it). Edit there; changes sync to the viewport. `Enter` moves to the next line (creates one if needed). |
| **Ex** | `:` in command mode | Type ex commands in the bottom line (`:w`, `:q`, …), then `Enter`. |

`Esc` also returns to command mode from insert / ex (handy fallback). `Ctrl+C` quits the process.

## Keybindings (MVP)

### Navigation (command mode)

| Key | Action |
|-----|--------|
| `h` / `l` | Move left / right |
| `j` / `k` | Move down / up |
| `N` + motion | Repeat, e.g. `5j` |

### Editing

| Key | Action |
|-----|--------|
| `i`, `Ctrl+↓`, or `Ctrl+J` | Insert mode |
| `Ctrl+↑` or `Ctrl+K` | Command mode |
| `Enter` (insert) | Finish current line, go to next line |

### Ex commands

| Command | Action |
|---------|--------|
| `:w` | Save (`"path" NL, NB written`) |
| `:w file` | Save as |
| `:q` | Quit. Unsaved changes: stay in the editor and show `E37` |
| `:wq` / `:x` | Save and quit |
| `:q!` | Quit without saving (restores the previous terminal) |
| `:wq!` | Write and quit |

## Project layout

```
Seesawim/
  src/
    main.js       # CLI entry
    editor.js     # Mode state machine
    ui.js         # Terminal layout (neo-blessed)
    buffer.js     # Line buffer helpers
    cursor.js     # Cursor clamping / motion
    commands.js   # Command + ex parsing
    keys.js       # Key routing helpers
  demo.txt
  package.json
```

## Status

Early MVP: enough to open a file, navigate, edit line-by-line, save, and quit. No visual mode, undo stack, syntax highlight, or plugins yet.

## License

Copyright 2026 Reynolds.

Licensed under the [Apache License, Version 2.0](./LICENSE).
