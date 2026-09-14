# WenOX CLI

The official command-line interface for WenOX AI — an agentic coding assistant
that runs in your terminal. It can read, search, edit and create files in your
project, run shell commands, and query a language server, all driven by WenOX
models.

[Türkçe README](README.tr.md)

## Features

- **Agentic tool loop** — one prompt can trigger dozens of tool calls (read, edit, search, run) until the task is done.
- **Full-screen TUI** — logo, framed input, chat transcript, status bar, command palette.
- **Real token streaming** — replies appear as the model writes them.
- **Command cards** — each `run_command` shows `$ command` and its output; click a card to expand/collapse long output.
- **Sessions** — every conversation is saved with an auto-generated title; resume with `wenox -s <id>`.
- **Build / Plan modes** — Plan is read-only and proposes a plan; Build can modify files and run commands.
- **Permissions** — access outside the working directory asks for confirmation; grants are remembered per project.
- **Workspace safety** — warns when you start in a home/system directory and requires permission for every path there.
- **Language server** — `code_intel` for go-to-definition, references, hover and document symbols.
- **Turkish and English UI** — model-facing prompts stay English; the interface is localised.

## Requirements

Node.js **20 or newer**.

## Install

```bash
npm install -g @wenox/cli
```

All dependencies ship with the package — no extra steps, no native build.

## First run

If no API key is stored, the CLI walks you through it:

1. **Language** — pick Turkish or English (Enter keeps the detected one).
2. **API key** — it shows the key page and opens it in your browser on Enter, or you paste the key directly.
3. **Verification** — the key is checked against `GET /v1/me`; an invalid key is re-prompted.
4. **Welcome** — a greeting with your name, subscription and remaining credits.

Get a key at <https://me.wenox.co/api-key>.

## Usage

```bash
wenox                                # interactive session
wenox -p "how many files are here?"  # one-shot, prints the answer and exits
wenox -m 2 -y                        # GLM 5.3 Flash, auto-approve commands
wenox -s ses_abc123                  # resume a saved session
```

### Options

| Option | Description |
|---|---|
| `-m, --model <id\|no>` | Model to use (`1`: Grok 4.6, `2`: GLM 5.3 Flash, `3`: Big Pickle) |
| `-k, --key <key>` | WenOX API key (saved permanently) |
| `-s, --session <id>` | Resume a saved session |
| `-d, --cwd <path>` | Starting working directory |
| `-y, --auto-approve` | Run commands without asking |
| `-p, --prompt <text>` | Run a single prompt and exit |
| `-v, --version` | Show version |
| `-h, --help` | Show help |

## Interface

The interactive app is full screen. A command renders as a card with a `$ line`
and its output; long output is shortened to six lines — **click the card** to see
the rest and click again to collapse.

While the model is replying the input stays usable: anything you type is queued
(`QUEUED`) and sent as soon as the current turn finishes.

### Keyboard

| Key | Action |
|---|---|
| `Enter` | Send |
| `/` | Command menu (filters as you type, `↑/↓` + `Enter`) |
| `Tab` | Switch mode — **Build** / **Plan** (completes commands when the slash menu is open) |
| `Ctrl+P` | Command palette |
| `Esc` | Close a menu · cancel the running reply **or command** |
| `Ctrl+C` | Works in any state: closes a panel, cancels, or exits |
| `↑` / `↓` | Input history |
| `PgUp` / `PgDn` | Scroll the conversation |
| Mouse wheel | Scroll the conversation |

Selecting text: drag with the mouse, then `Ctrl+C` copies it (a toast confirms).
Start with `WENOX_NO_MOUSE=1` to hand the wheel and selection back to your terminal.

### In-session commands

| Command | Description |
|---|---|
| `/help` | Show commands and shortcuts |
| `/model` | Change model — the list is fetched from `GET /v1/models` |
| `/lang` | Change interface language |
| `/key` | Update the API key (verified before saving) |
| `/me` | Account info and remaining credits |
| `/compact` | Summarise the context to free space |
| `/new` | Clear the context (new session) |
| `/sessions` | List and load past sessions |
| `/auto` | Toggle auto-approve |
| `/status` | Session status |
| `/exit` | Quit |

## Modes

The active mode is shown in the status bar; `Tab` switches.

| Mode | Behaviour |
|---|---|
| **Plan** (default on start) | Read-only. The model inspects and proposes a plan; `write_file`, `edit_file` and `run_command` are blocked. |
| **Build** | The model may read, edit files and run commands. |

## Languages

The interface supports **Turkish** and **English**; the language is detected from
your system and can be changed with `/lang` or `WENOX_LANG=tr|en`.

Only the interface is localised. The system prompt and tool schemas stay English,
and the model replies in whichever language you write in.

## Sessions

Every conversation is saved under `~/.wenox/sessions/`. After four user messages a
short **title** is generated. On exit the terminal prints how to come back:

```
  Session   Greeting
  Continue  wenox -s ses_f78edf902ffe
```

Resuming restores the messages, token counter, model and working directory.
`/sessions` lists past sessions and loads the one you pick.

## Configuration

The API key, active model and language live in `~/.wenox/config.json`
(user-readable only). Precedence:

1. Environment variables — `WENOX_API_KEY`, `WENOX_DEFAULT_MODEL`, `WENOX_LANG`, `WENOX_API_BASE_URL`, `WENOX_REQUEST_TIMEOUT_MS`
2. `~/.wenox/config.json`
3. Built-in defaults

Other files: `~/.wenox/permissions.json` (per-project directory grants),
`~/.wenox/sessions/` (conversations).

## Capabilities

The assistant works on your project through these tools:

`read_file`, `write_file`, `edit_file`, `list_dir`, `search_code`, `run_command`,
`code_intel`, `ask_user`.

`code_intel` uses a real language server:

| Language | Server | Install |
|---|---|---|
| TypeScript / JavaScript | `typescript-language-server` | `npm i -g typescript-language-server` |
| Python | `pyright-langserver` | `npm i -g pyright` |
| Go | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| Rust | `rust-analyzer` | `rustup component add rust-analyzer` |

If no server is installed the tool reports the install command instead of failing.

`ask_user` lets the model ask you a short multiple-choice question when a real
decision is needed — it won't nag you otherwise.

## Permissions and safety

`run_command` asks for confirmation before running; `-y` auto-approves.

**Outside the working directory:** when the model touches a path outside your
project you choose **Allow once**, **Allow always** (remembered per project in
`~/.wenox/permissions.json`) or **Reject**.

**Unsafe working directory:** started in a home directory, drive root or a system
folder, the CLI warns you, tells the model to be careful, and requires permission
for every path — including `list_dir`.

Commands that would kill the CLI's own Node process (`taskkill /IM node.exe`,
`pkill node`, …) are refused. `Esc`/`Ctrl+C` stop a running command and its child
processes.

## Development

```bash
npm install
npm test        # node --test
npm start       # node bin/wenox.js
```

## License

MIT
