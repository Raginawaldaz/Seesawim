# Seesawim

一个受 Vim 启发的小型终端文本编辑器——尽量去掉「模式来回切」的烦躁感。

**English version:** [README.md](./README.md)

## 背景

我觉得 Vim 的插入 / 普通模式切换在日常编辑里很烦人，但又很想亲身体验一下 Vim 式编辑器到底是怎么回事。Seesawim 是一次个人实验：保留有用的指令语言（`hjkl`、数字重复、`:w`、`:q`），同时改掉进入模式的方式。

主交互不是靠 Esc / `i` 把整个编辑器「翻面」，而是采用 **跷跷板式布局**：

- **上方：** 代码视口（浏览、移动）
- **下方：** 专用输入行（改文字或敲 `:` 命令）

用 `Ctrl+↑` / `Ctrl+↓` 在指令模式和输入模式之间切换。编辑时在下面一行打字，上面的缓冲区会同步更新。

## 环境要求

- Node.js 18+
- 可交互的真实终端（Windows Terminal、macOS Terminal、iTerm 等）

## 安装与启动

```bash
npm install
```

### 全局命令 `ssw`（推荐）

在项目目录执行一次：

```bash
npm run install-global
```

之后任意目录都能用：

```bash
ssw                  # 打开项目自带的 demo.txt
ssw notes.txt        # 打开当前目录下的文件
ssw "D:\path\a.txt"  # 打开绝对路径
```

若提示找不到 `ssw`，确认 Node 的全局目录（`npm config get prefix`）已在 PATH 里。卸载：`npm run uninstall-global`。

> Windows 上若 `npm link` 因 symlink 权限失败，请用上面的 `install-global`（不依赖管理员 / 开发者模式）。

### 仅在本项目内启动

```bash
npm start
npm start -- path/to/file.txt
```

PowerShell 示例（注意 `--` 后有空格）：

```powershell
npm start -- "D:\Seesawim\Demo.txt"
```

不传参数时，默认打开项目根目录的 `demo.txt`。

> **终端提示：** 请在 **Windows Terminal**、系统自带终端等外部终端里运行。Cursor / VS Code 内置终端对全屏 TUI（neo-blessed）支持很差，经常出现画面错乱、按键无响应。若 `Ctrl+↑/↓` 无效，可用备用键：`Ctrl+K` 进指令模式，`Ctrl+J` 进输入模式。

## 模式说明

| 模式 | 如何进入 | 做什么 |
|------|----------|--------|
| **指令（Command）** | `Ctrl+↑` 或 `Ctrl+K` | 底部输入行清空。按键当指令（`hjkl`、数字前缀、`i`、`:`）。代码区不显示闪烁光标，仅高亮当前行。 |
| **输入（Insert）** | `Ctrl+↓`、`Ctrl+J` 或 `i` | 底部显示当前行全文，在此编辑并同步到上方。`Enter` 切到下一行（必要时新建空行）。 |
| **Ex** | 指令模式下按 `:` | 在底部输入 `:w`、`:q` 等，回车执行。 |

从输入 / Ex 回到指令模式也可用 `Esc`（备用）。`Ctrl+C` 直接退出进程。

## 快捷键（MVP）

### 移动（指令模式）

| 按键 | 作用 |
|------|------|
| `h` / `l` | 左 / 右 |
| `j` / `k` | 下 / 上 |
| `N` + 动作 | 重复，例如 `5j` |

### 编辑

| 按键 | 作用 |
|------|------|
| `i`、`Ctrl+↓` 或 `Ctrl+J` | 进入输入模式 |
| `Ctrl+↑` 或 `Ctrl+K` | 进入指令模式 |
| `Enter`（输入模式） | 提交当前行并前往下一行 |

### Ex 命令

| 命令 | 作用 |
|------|------|
| `:w` | 保存 |
| `:q` | 退出（有未保存改动时会拒绝） |
| `:wq` | 保存并退出 |
| `:q!` | 不保存强制退出 |

## 项目结构

```
Seesawim/
  src/
    main.js       # 启动入口
    editor.js     # 模式状态机
    ui.js         # 终端布局（neo-blessed）
    buffer.js     # 行缓冲
    cursor.js     # 光标夹紧 / 移动
    commands.js   # 指令与 ex 解析
    keys.js       # 按键分流
  demo.txt
  package.json
```

## 现状

早期 MVP：能打开文件、移动、按行编辑、保存、退出。尚无可视模式、撤销栈、语法高亮或插件。

## 许可

Copyright 2026 Reynolds.

采用 [Apache License, Version 2.0](./LICENSE) 授权。
