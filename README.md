<h1 align="center">WenOX CLI</h1>

<p align="center">
  <strong>An agentic coding assistant that lives in your terminal.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wenox/cli"><img src="https://img.shields.io/npm/v/@wenox/cli?color=0ea5e9&label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@wenox/cli"><img src="https://img.shields.io/npm/dt/@wenox/cli?color=0ea5e9&label=downloads" alt="downloads"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-22c55e" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933" alt="node">
</p>

<p align="center">
  Read, search, edit and create files, run commands, and query a language<br>
  server — all driven by WenOX AI, in a full-screen terminal interface.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README_tr.md">Türkçe</a>
</p>

---

```text
 ██╗    ██╗███████╗███╗   ██╗ ██████╗ ██╗  ██╗
 ██║    ██║██╔════╝████╗  ██║██╔═══██╗╚██╗██╔╝
 ██║ █╗ ██║█████╗  ██╔██╗ ██║██║   ██║ ╚███╔╝
 ██║███╗██║██╔══╝  ██║╚██╗██║██║   ██║ ██╔██╗
 ╚███╔███╔╝███████╗██║ ╚████║╚██████╔╝██╔╝ ██╗
  ╚══╝╚══╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝
```

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

## 📦 Install

```bash
npm install -g @wenox/cli
```

Node.js **20 or newer**. Everything ships with the package — no extra steps, no
native build.

## 🚀 First run

Start `wenox` and it walks you through setup:

1. **Language** — Turkish or English (Enter keeps the detected one)
2. **API key** — the key page opens in your browser on Enter, or paste the key
3. **Verification** — the key is checked before it is ever saved
4. **Welcome** — your name, subscription and remaining credits

Get a key at **[me.wenox.co/api-key](https://me.wenox.co/api-key)**.

## 🖥️ Usage

```bash
wenox                                   # interactive session
wenox -p "how many files are in here?"  # one-shot answer, then exit
wenox -m 2 -y                           # GLM 5.3 Flash, auto-approve commands
wenox -s ses_f78edf902ffe               # resume a saved session
```

| Option | Description |
| --- | --- |
| `-m, --model <id\|no>` | Model to use (`1` Grok 4.6 · `2` GLM 5.3 Flash · `3` Big Pickle) |
| `-k, --key <key>` | WenOX API key (saved permanently) |
| `-s, --session <id>` | Resume a saved session |
| `-d, --cwd <path>` | Starting working directory |
| `-y, --auto-approve` | Run commands without asking |
| `-p, --prompt <text>` | Run a single prompt and exit |
| `-v, --version` | Show version |
| `-h, --help` | Show help |

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
| `Tab` | Switch mode: **Build** / **Plan** |
| `Ctrl+P` | Command palette |
| `Esc` | Close a menu · cancel the reply **or the running command** |
| `Ctrl+C` | Works anywhere: closes a panel, cancels, or exits |
| `↑` / `↓` | Input history |
| `PgUp` / `PgDn` | Scroll the conversation |
| Mouse wheel | Scroll the conversation |

Drag with the mouse to select text, then `Ctrl+C` to copy it. Prefer your
terminal's own selection and scrolling? Start with `WENOX_NO_MOUSE=1`.

## 🧰 Capabilities

The assistant works on your project through these tools:

`read_file` · `write_file` · `edit_file` · `list_dir` · `search_code` ·
`run_command` · `code_intel` · `ask_user`

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

## 🗺️ Modes

The active mode sits in the status bar; `Tab` switches.

| Mode | Behaviour |
| --- | --- |
| **Plan** — default | Read-only. Inspects and proposes a plan; writes and commands are blocked. |
| **Build** | Reads, edits files and runs commands to get the job done. |

Start in Plan, see what the assistant intends to do, then `Tab` into Build to let
it happen.

## 🌍 Languages

Turkish and English, detected from your system and switchable with `/lang` or
`WENOX_LANG`.

Only the interface is translated. Prompts and tool schemas stay in English, and
the assistant answers in whichever language you write in.

## 💾 Sessions

Conversations are saved automatically and titled after a few exchanges. On exit
the terminal shows how to come back:

```text
  Session   Greeting
  Continue  wenox -s ses_f78edf902ffe
```

Resuming restores the messages, the token counter, the model and the working
directory. `/sessions` lists everything and loads whichever you pick.

## ⚙️ Configuration

The API key, active model and language live in `~/.wenox/config.json`, readable
only by you. Precedence:

1. Environment — `WENOX_API_KEY`, `WENOX_DEFAULT_MODEL`, `WENOX_LANG`,
   `WENOX_API_BASE_URL`, `WENOX_REQUEST_TIMEOUT_MS`
2. `~/.wenox/config.json`
3. Built-in defaults

In-session commands:

| Command | Description |
| --- | --- |
| `/help` | Commands and shortcuts |
| `/model` | Change model — the list comes from the live API |
| `/lang` | Change interface language |
| `/key` | Update the API key (verified before saving) |
| `/me` | Account and remaining credits |
| `/compact` | Summarise the context to free space |
| `/new` | Clear the context |
| `/sessions` | List and load past sessions |
| `/auto` | Toggle auto-approve |
| `/status` | Session status |
| `/exit` | Quit |

## 🛠️ Development

```bash
npm install
npm test        # node --test
npm start       # node bin/wenox.js
```

## 📄 License

MIT
