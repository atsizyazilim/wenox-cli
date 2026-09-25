<div align="center">
  <img src="banner.png" alt="WenOX CLI" width="100%">
</div>

<h1 align="center">WenOX CLI</h1>

<p align="center">
  <strong>An agentic coding assistant that lives in your terminal.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wenox/cli"><img src="https://img.shields.io/npm/v/@wenox/cli?color=0ea5e9&label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@wenox/cli"><img src="https://img.shields.io/npm/dt/@wenox/cli?color=0ea5e9&label=downloads" alt="downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933" alt="node">
</p>

<p align="center">
  Read, search, edit and create files, run commands, and query a language<br>
  server — all driven by WenOX AI, in a full-screen terminal interface.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README_tr.md">Türkçe</a>
</p>

<div align="center">
  <img src="preview.png" alt="WenOX CLI" width="100%">
</div>

---

## ✨ Why WenOX CLI

- **Actually agentic.** One prompt isn't one answer. The assistant keeps calling
  tools — read, search, edit, run — until the task is finished, then reports back.
- **Built for the terminal.** Full-screen interface with a framed prompt, a chat
  transcript you can scroll, a status bar and a command palette. No browser tab.
- **You stay in control.** Command execution asks first. Anything outside your
  project asks first. Plan mode changes nothing at all.
- **A real language server.** Go-to-definition, references and hover come from an
  LSP server, not from grep.
- **Remembers where you were.** Every conversation is saved and given a title;
  pick it up later exactly where you left off.
- **Speaks your language.** Turkish and English interface, with the model replying
  in whichever language you write in.
- **Extensible.** MCP servers (stdio or HTTP) plug in as tools, and you can paste
  an image from the clipboard straight into the conversation.
- **Stays cheap in long sessions.** Requests are built so that the provider's
  prefix cache hits; the part that doesn't change is never recomputed.

<img src="slimbanner.png" width="100%">

## 📦 Install

```bash
npm install -g @wenox/cli
```

Node.js **20 or newer**. Everything ships with the package — no extra steps, no
native build.

<img src="slimbanner.png" width="100%">

## 🚀 First run

Start `wenox` and it walks you through setup:

1. **Language** — Turkish or English (Enter keeps the detected one)
2. **API key** — paste the key; `Ctrl+O` opens the key page in your browser
3. **Verification** — the key is checked before it is ever saved
4. **Welcome** — your name, subscription and remaining credits

Get a key at **[me.wenox.co/api-key](https://me.wenox.co/api-key)**.

<img src="slimbanner.png" width="100%">

## 🖥️ Usage

```bash
wenox                                   # interactive session
wenox -p "how many files are in here?"  # one-shot answer, then exit
wenox -m <id> -y                        # pick a model, auto-approve commands
wenox -s ses_f78edf902ffe               # resume a saved session
wenox -c                                # continue the most recent session
wenox stats                             # token usage summary
```

| Option | Description |
| --- | --- |
| `-m, --model <id\|no>` | Model to use — see `/model` for the list |
| `-k, --key <key>` | WenOX API key (saved permanently) |
| `-s, --session <id>` | Resume a saved session |
| `-d, --cwd <path>` | Starting working directory |
| `-y, --auto-approve` | Run commands without asking |
| `-p, --prompt <text>` | Run a single prompt and exit |
| `-c, --continue` | Continue the most recent session |
| `--fork` | Fork the most recent session into a new one |
| `--format json` | With `-p`, print the result as JSON |
| `--debug` | Write a diagnostic log (`~/.wenox/debug.log`) |
| `-v, --version` | Show version |
| `-h, --help` | Show help |

There are also commands that never open the TUI:

| Command | Description |
| --- | --- |
| `wenox models [--format json]` | List models (context window, vision support) |
| `wenox sessions` | List past sessions |
| `wenox session delete <id>` | Delete a session |
| `wenox stats [--format json]` | Token usage summary |
| `wenox mcp list \| add \| remove` | Manage MCP servers |

<img src="slimbanner.png" width="100%">

## ⌨️ Interface

A command renders as a card — the `$` line, then its output. Long output is
shortened to six lines; **click the card** to see the rest, click again to
collapse it.

The prompt never locks. While the assistant is replying you can keep typing —
your message is queued and sent the moment the current turn ends.

| Key | Action |
| --- | --- |
| `Enter` | Send |
| `/` | Command menu — filters as you type, `↑/↓` to pick |
| `@` | File mention menu — inserts the file into the message as a chip |
| `!command` | Runs the command directly, without going to the model |
| `Tab` | Switch mode: **Build** / **Plan** |
| `Ctrl+P` | Command palette |
| `Ctrl+V` / `Alt+V` | Attach the image from your clipboard |
| `Esc` | Close a menu · cancel the reply **or the running command** |
| `Ctrl+C` | Works anywhere: closes a panel, cancels, or exits |
| `↑` / `↓` | Input history (your draft is restored) |
| `PgUp` / `PgDn` | Scroll the conversation |
| Mouse wheel | Scroll the conversation |

Drag with the mouse to select text, then `Ctrl+C` to copy it. Prefer your
terminal's own selection and scrolling? Start with `WENOX_NO_MOUSE=1`.

On wide terminals a panel sits on the right: context usage, open tasks, plan
limits and the files changed in this session. It is not drawn on narrow
terminals; tune it from the config (`sidebar`, `sidebarMinColumns`).

<img src="slimbanner.png" width="100%">

## 🧰 Capabilities

The assistant works on your project through these tools:

`read_file` · `write_file` · `edit_file` · `list_dir` · `search_code` · `glob` ·
`run_command` · `code_intel` · `webfetch` · `ask_user` · `todo_write`

**`code_intel`** uses a real language server:

| Language | Server | Install |
| --- | --- | --- |
| TypeScript / JavaScript | `typescript-language-server` | `npm i -g typescript-language-server` |
| Python | `pyright-langserver` | `npm i -g pyright` |
| Go | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| Rust | `rust-analyzer` | `rustup component add rust-analyzer` |

If a server isn't installed the tool says so and tells you how to get it — it
never just fails.

**`ask_user`** lets the assistant ask a short multiple-choice question when a real
decision is needed. It won't nag you with questions it can answer itself.

**Paste images.** `Ctrl+V` (or `Alt+V` on Windows Terminal) attaches the image on
your clipboard to the message: screenshots, design frames and error pictures are
read directly. `/model` shows which models support images; with one that doesn't,
the CLI warns you.

**Large files are written in pieces.** The assistant doesn't try to fit a whole
file into one giant output: it starts with `write_file` and appends section by
section with `edit_file`. If the response hits the output limit it continues from
where it stopped, and a half-finished tool call is never executed.

**Your project rules are read.** An `AGENTS.md` (or `CLAUDE.md`) in the project
root and in parent directories is added to the system prompt. If you don't have
one, `/init` inspects the project and writes it for you.

**MCP servers.** Connect one over stdio with
`wenox mcp add <name> <command> [args]`, or over HTTP by setting `url` in the
config; its tools are added to the assistant's tool list.

<img src="slimbanner.png" width="100%">

## 🔒 Safety

- **Commands ask first.** Execution is confirmed before it happens; `-y` opts out.
- **Outside your project asks first.** Choose *Allow once*, *Allow always*
  (remembered per project) or *Reject*.
- **Unsafe folders are flagged.** Start in a home directory, a drive root or a
  system folder and the CLI warns you, tells the assistant to be careful, and
  requires permission for **every** path — `list_dir` included.
- **Self-destructive commands are refused.** Anything that would kill every Node
  process (`taskkill /IM node.exe`, `pkill node`, …) is blocked, because the CLI
  itself is one of them.
- **`Esc` stops the work.** A running command is killed together with its child
  processes — a forgotten dev server included.
- **You can write permission rules.** Put entries like
  `{ "tool": "run_command", "pattern": "git *", "action": "ask" }` into the
  `permissions` list in the config: `deny` never runs it, `allow` never asks,
  `ask` asks every time.
- **Secret files ask separately.** Reading or writing a file like `.env` needs
  permission even when it is inside your project.

<img src="slimbanner.png" width="100%">

## 🗺️ Modes

The active mode sits in the status bar; `Tab` switches.

| Mode | Behaviour |
| --- | --- |
| **Plan** — default | Read-only. The writing and command tools are **not in the tool list at all**, so the assistant never even attempts them. It inspects and proposes a plan. |
| **Build** | Reads, edits files and runs commands to get the job done. |

Start in Plan, see what the assistant intends to do, then `Tab` into Build to let
it happen. The current mode is also repeated on every request, so older messages
in the conversation can't mislead it.

<img src="slimbanner.png" width="100%">

## 🌍 Languages

Turkish and English, detected from your system and switchable with `/lang` or
`WENOX_LANG`.

Only the interface is translated. Prompts and tool schemas stay in English, and
the assistant answers in whichever language you write in.

<img src="slimbanner.png" width="100%">

## 💾 Sessions

Conversations are saved automatically and titled after a few exchanges. On exit
the terminal shows how to come back:

```text
  Session   Greeting
  Continue  wenox -s ses_f78edf902ffe
```

Resuming restores the messages, the token counter, the model, the task list and
the working directory. `/sessions` lists everything and loads whichever you
pick; `wenox -c` continues the most recent session and `--fork` copies it into a
new one. From the terminal you can also list them with `wenox sessions` and drop
one with `wenox session delete <id>`.

<img src="slimbanner.png" width="100%">

## ⚙️ Commands

Everything is driven from inside the session — change the model, the language or
the key, inspect the account, manage the context. Settings can also be supplied
through environment variables: `WENOX_API_KEY`, `WENOX_DEFAULT_MODEL`,
`WENOX_LANG`, `WENOX_API_BASE_URL`, `WENOX_REQUEST_TIMEOUT_MS`, `WENOX_DEBUG`.

| Command | Description |
| --- | --- |
| `/help` | Commands and shortcuts |
| `/model` | Change model (listed with context window and vision support) |
| `/lang` | Change interface language |
| `/key` | Update the API key (verified before saving) |
| `/me` | Account, plan and limits (5-hour / weekly / monthly) |
| `/theme` | Pick a theme |
| `/keys` | Show the shortcuts |
| `/editor` | Compose the message in your `$EDITOR` |
| `/init` | Inspect the project and write `AGENTS.md` |
| `/compact` | Summarise the context to free space |
| `/new` | Clear the context |
| `/sessions` | List and load past sessions |
| `/auto` | Toggle auto-approve |
| `/status` | Session status |
| `/exit` | Quit |

Plan limits (5-hour / weekly / monthly) show up in the status bar and the side
panel with their percentage and reset time.

<img src="slimbanner.png" width="100%">

## 🛠️ Development

Written in TypeScript and compiled with `tsc`. The published package ships
the compiled output, so installing it needs nothing extra.

```bash
npm install
npm run build   # compile
npm start       # compile, then run the CLI
```

<img src="slimbanner.png" width="100%">

## 📄 License

MIT
