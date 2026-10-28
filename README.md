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
npm start
```

Open a specific file:

```bash
npm start -- path/to/file.txt
```

With no argument, Seesawim opens `demo.txt` in the project root.

## Modes

| Mode | How to enter | What it does |
|------|----------------|--------------|
| **Command** | `Ctrl+↑` | Bottom line is empty. Keys are commands (`hjkl`, counts, `i`, `:`). Code caret is hidden; current line stays highlighted. |
| **Insert** | `Ctrl+↓` or `i` | Bottom line shows the current buffer line. Edit there; changes sync to the viewport. `Enter` moves to the next line (creates one if needed). |
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
| `i` or `Ctrl+↓` | Insert mode |
| `Ctrl+↑` | Command mode |
| `Enter` (insert) | Finish current line, go to next line |

### Ex commands

| Command | Action |
|---------|--------|
| `:w` | Save |
| `:q` | Quit (refuses if there are unsaved changes) |
| `:wq` | Save and quit |
| `:q!` | Quit without saving |

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
