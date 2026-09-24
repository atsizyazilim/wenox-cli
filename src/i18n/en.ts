export default {
  common: {
    on: "on",
    off: "off",
    unknownError: "Unknown error",
  },

  markdown: {
    image: "[image: {alt}]",
  },

  commands: {
    auto: "toggle auto-approve",
    compact: "summarize context (free up space)",
    exit: "exit",
    help: "show commands",
    init: "generate AGENTS.md for this project",
    key: "update API key",
    lang: "change language",
    me: "account and credits",
    model: "change model",
    new: "clear context (new session)",
    sessions: "list past sessions",
    status: "session status",
  },

  help: {
    cliSubtitle: "— Advanced Coding Agent",
    usage: "Usage:",
    usageLine: "wenox [options]",
    options: "Options:",
    optionLines: [
      "-m, --model <id|no>    Model to use (1: Grok 4.6, 2: GLM 5.3 Flash, 3: Big Pickle)",
      "-k, --key <key>        WenOX API key (saved permanently)",
      "-s, --session <id>     Resume a saved session",
      "-d, --cwd <path>       Starting working directory / project path",
      "-y, --auto-approve     Run commands without confirmation",
      "-p, --prompt <text>    Run a one-shot command and exit",
      "-v, --version          Show version",
      "-h, --help             Show this help",
    ],
    examples: "Examples:",
    exampleLines: [
      "wenox",
      'wenox -p "how many files are in this project?"',
      "wenox -m 2 -y",
    ],
    tui: `Commands
  /help            This help
  /model           Change model
  /key             Update API key
  /me              Account and credits
  /lang            Change language
  /compact         Summarize context (free up space)
  /new             Clear context
  /sessions        List and load past sessions
  /auto            Toggle auto-approve
  /status          Session status
  /exit            Exit

Shortcuts
  /        command menu     Tab     switch mode (Build/Plan)
  Ctrl+P   command palette  Esc     cancel
  PgUp/PgDn  scroll         Ctrl+C  cancel / exit`,
    tableCommand: "Command",
    tableDescription: "Description",
    commandRows: [
      ["/model", "Change the active model"],
      ["/key", "Show or update the WenOX API key"],
      ["/lang", "Change the interface language"],
      ["/compact", "Summarize the context and free up space"],
      ["/sessions", "List past sessions with their titles"],
      ["/clear", "Reset the current conversation context and history"],
      ["/history", "Show the number of messages in the current conversation"],
      ["/help", "Show the help menu"],
      ["/exit, /quit", "Terminate the program"],
    ],
  },

  status: {
    autoApprove: "auto-approve",
    premium: "premium",
    modeBuild: "Build",
    modePlan: "Plan",
    keysHint: "tab mode   ctrl+p ",
    commands: "commands",
    imageHint: "ctrl+v image   ",
    credits: "Credits: ",
    noCredits: "—",
  },

  images: {
    reading: "Reading image…",
    noVision: "The selected model does not support images ({model}). Switch with /model.",
    none: "No image in the clipboard.",
    added: "{count} image(s) added.",
    tooLarge: "Image is too large ({mb} MB max).",
    readFailed: "Could not read the image.",
  approval: {
    title: "The model wants to run a command",
    hint: "←/→ or Tab: select    ·    Enter: confirm    ·    Esc: reject",
  },

  permission: {
    title: "Permission required",
    accessExternal: "← Access external directory {path}",
    patterns: "Patterns",
    allowOnce: "Allow once",
    allowAlways: "Allow always",
    reject: "Reject",
    hint: "←/→ select    ·    Enter confirm    ·    Esc reject",
    prompt: "Allow? [o]nce / [a]lways / [r]eject: ",
  },

  question: {
    own: "Write your own answer",
    hintSelect: "↑↓ select    enter submit    esc close",
    hintType: "type your answer  ·  enter submit  ·  esc back",
  },

  working: {
    cancel: "cancel",
  },

  logo: {
    product: "WenOX AI CLI",
    tagline: "  ·  Advanced Coding Agent",
  },

  input: {
    keyPrefix: "API key",
    answerPrefix: "Your answer",
  },

  paste: {
    label: "[~{lines} lines pasted]",
  },

  lang: {
    selected: "Language: {name}",
    title: "Select language",
  },

  menu: {
    hint: "↑/↓ navigate    ·    Enter select    ·    Esc close",
  },

  session: {
    loaded: "Session loaded: {name}",
    notFound: "Session not found: {id}",
    untitled: "(untitled)",
    none: "No saved sessions.",
    past: "Past sessions:",
    pastHint: "To continue: wenox -s <id>",
  },

  context: {
    warning: "⚠️  Context is filling up (~{pct}%). Use /compact to summarize and free space.",
    cleared: "Context cleared. New session ready.",
    messages: "{count} messages in the current context.",
    chatCleared: "Chat history cleared.",
  },

  compact: {
    running: "Summarizing context…",
    busy: "An operation is in progress. Try /compact when it finishes.",
    empty: "There is no conversation to summarize.",
    summarized: "Context summarized, space freed.",
    auto: "⚠️  Context near full — compacting automatically…",
    done: "Context summarized, space freed.\n\n{summary}",
    failed: "Summarization failed: {message}",
  },

  models: {
    fetchFailed: "Could not fetch models, using the built-in list.",
    head: ["No", "Model Name", "Model ID", "Description", "Status"],
    active: "✓ Active",
    unknown: "Unknown Model",
    custom: "Custom Model",
    contextWindow: "{k}K context",
  },

  auto: {
    on: "Auto-approve on.",
    off: "Auto-approve off.",
  },

  statusLine:
    "Model: {model}  ·  Directory: {cwd}  ·  Auto-approve: {auto}  ·  Messages: {count}",

  notices: {
    unknownCommand: "Unknown command: /{cmd}",
    apiKeyUpdated: "API key updated.",
    apiKeyAccount: "Signed in as {name}",
    queueCleared: "Queue cleared.",
    commandRejected: "Command rejected.",
    modelSelected: "Model: {name}",
    modeChanged: "Mode: {mode}",
    copied: "Copied to clipboard",
    unsafeDir:
      "⚠️  You don't appear to be in a project directory: {cwd}\nBe careful — the agent can read files here, and every path it touches asks for permission. Consider moving to a project folder.",
    errorPrefix: "Error: {message}",
  },

  ask: {
    noInterface: "(question could not be asked)",
    notAnswered: "(no answer given)",
    closed: "(user closed the question)",
    prompt: "Pick a number or type your own answer: ",
    retry: "Operation canceled. Type /exit to quit.",
  },

  tool: {
    read: "read ({count} lines)",
    written: "written",
    updated: "updated",
    items: "{count} items",
    matches: "{count} matches",
    exitCode: "exit code {code}",
    noOutput: "(no output)",
    running: "running…",
    expandHint: "… +{count} more lines  ·  click to expand",
    collapseHint: "… click to collapse",
    results: "{count} results",
    done: "done",
    error: "error",
    readTotal: "↳ Read successfully ({count} lines total)",
    itemsListed: "↳ {count} items listed",
    matchesFound: "↳ {count} matches found",
    output: "Output:",
    errorOutput: "Error Output:",
    exitCodeLine: "Exit Code: {code}",
    resultTitle: "Command Result",
    applyingChange: "(Applying change)",
    searchingFor: "Searching:",
    linesSuffix: "({count} lines)",
    rangeEnd: "end",
  },

  view: {
    thinking: "+ Thinking: {ms}ms",
    thought: "Thought: {time}",
    thinkingLive: "Thinking",
    build: "▣ Build · {model}{seconds}",
    questionAsked: "→ Question asked",
    answer: "  ↳ Answer: {answer}",
    queued: " QUEUED ",
  },

  boot: {
    steps: [
      "Preparing systems",
      "Loading core modules",
      "Verifying API connection",
      "Syncing AI models",
      "Preparing terminal interface",
    ],
    ready: "✓ Systems ready!",
    opening: "   Opening prompt…",
  },

  banner: {
    tagline: "  —  Advanced Coding Agent",
    apiEndpoint: "API Endpoint:",
    activeModel: "Active Model:   ",
    activeDir: "Active Directory:   ",
    sessionLabel: "Session:        ",
    ready: "Ready and listening",
    commandsTitle: "Available Commands:",
    hint: "✎  Type something and press Enter — WenOX is listening!",
    windowTitle: "◆ WenOX Terminal",
    windowSubtitle: "● Systems Active — Prompt Ready",
    commandRows: [
      ["/model", "Change model"],
      ["/lang", "Change language"],
      ["/key", "Update API key"],
      ["/compact", "Summarize context (free up space)"],
      ["/sessions", "List past sessions"],
      ["/clear", "Clear chat history"],
      ["/help", "Show the help screen"],
      ["/exit", "Exit"],
    ],
  },

  assistant: {
    name: "◆ WenOX Assistant",
    typing: "— typing… (ESC to cancel)",
  },

  sink: {
    thinking: "Model is thinking...",
    approvalTitle: "⚠️  The model wants to run this command:",
    approvalPrompt: "Allow this command to run? [y/N]: ",
  },

  repl: {
    modelPrompt: "\nModel number or ID to switch to (Enter to cancel): ",
    modelChanged: "Active model changed: {name} ({id})",
    currentKey: "Current API Key: {key}",
    newKey: "Enter your new API key (Enter to keep current): ",
    keyUpdated: "API key updated and saved successfully.",
    goodbye: "Goodbye! WenOX CLI terminated.",
  },

  cli: {
    mcpFailed: "Could not connect to the MCP server — {message}",
    argError: "Argument error: {message}",
    unexpectedError: "Unexpected error: {message}",
  },

  onboarding: {
    needKey: "To use WenOX AI you need an API key.",
    getKeyHere: "Get your API key here: {url}",
    openHint: "Press Enter on the empty box to open the page in your browser",
    openFailed: "Could not open the browser. Open this manually: {url}",
    opening: "Opening the page in your browser…",
    verifying: "Verifying key…",
    invalid: "Invalid API key. Please check it and try again.",
    network: "Could not reach the server. Check your connection and try again.",
    serverError: "The server is unavailable right now. Please try again shortly.",
    chooseLanguage: "Interface language",
    langHint: "↑/↓ select    ·    Enter confirm",
    verifyHint: "Enter to verify the key",
    continueHint: "Press Enter to continue",
    welcomeNamed: "Hi {name}, welcome to WenOX CLI!",
    welcomeAnon: "Welcome to WenOX CLI!",
    premiumDays: "Looks like you have an active subscription — {days} days left.",
    premium: "Looks like you have an active subscription.",
    noPremium: "Looks like you don't have an active subscription.",
    credits: "Credits remaining: {credits}",
    noTty: "No API key found. Run interactively, or provide one with --key or WENOX_API_KEY.",
  },

  account: {
    failed: "Could not retrieve account info.",
    name: "Name:     ",
    email: "Email:    ",
    credits: "Credits:  ",
    premiumYes: "Premium:  yes",
    premiumNo: "Premium:  no",
    daysLeft: " ({days} days left)",
  },

  agent: {
    thinking: "{model} is thinking...",
    cancelled: "⚠️  Canceled with ESC — operation stopped.",
    cancelledTools: "⚠️  Canceled with ESC — remaining tools skipped.",
    turnLimit:
      "⚠️ Reached the tool-call turn limit ({max}) for this step. Type 'continue' to keep going.",
    doomLoop: "⚠️ {tool} was called three times in a row with the same arguments — this looks like a loop, so I stopped. Type again to continue.",
    truncated: "⚠️  The reply hit the output limit — continuing where it left off, in smaller pieces.",
    authError: "❌ Invalid or unauthorized WenOX API Key.",
    authHint: "You can update the key with the '/key' command.",
    rateLimit: "❌ Rate limit exceeded. Please wait a bit and try again.",
    timeout: "❌ Request timed out — the server did not respond within {seconds}s. Please try again.",
    connection: "❌ Could not connect to the API server ({url}). Check your internet connection.",
    apiError: "❌ API Error (Code: {status}): {message}",
    unknownError: "❌ An unexpected error occurred: {message}",
    fallback: "Hi! I'm WenOX AI. How can I help you?",
  },

  update: {
    title: "Update required",
    installed: "Installed  ",
    available: "Available  ",
    body: "This version is no longer supported.",
    hint: "Restart after updating    ·    Q quit",
    forced: "Installed v{current}, latest v{latest}. This version is no longer supported.",
  },

  modelDescriptions: {
    "grok-4.6": "Powerful reasoning and coding model by xAI",
    "z-ai/glm-5.3-flash": "Very fast, lightweight and optimized coding model",
    "big-pickle": "Advanced problem solving and large-context model",
  },
};
