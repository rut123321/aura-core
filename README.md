<div align="center">
  <h1>
    <code>aura-core</code>
  </h1>
  <p><strong>Autonomous AI coding agent for the terminal</strong></p>
  <p>
    <a href="https://github.com/rut123321/aura-core/releases"><img src="https://img.shields.io/github/v/release/rut123321/aura-core" alt="version"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-%23f9f9f9" alt="Bun runtime"></a>
    <a href="https://github.com/rut123321/aura-core/actions"><img src="https://img.shields.io/github/actions/workflow/status/rut123321/aura-core/ci.yml?label=CI" alt="CI status"></a>
    <a href="https://github.com/rut123321/aura-core/issues"><img src="https://img.shields.io/github/issues/rut123321/aura-core" alt="GitHub issues"></a>
  </p>
  <br>
</div>

**aura-core** is an elite autonomous AI coding agent that operates directly in your terminal. It follows the **ReAct (Reasoning → Action → Observation)** loop to understand, modify, and manage codebases with minimal supervision.

It supports **12 AI providers**, **50+ models**, and comes with **9 native tools** — file read/write/patch, shell execution, glob, search, web search, file watching, and user prompts.

Sessions auto-save after every interaction and restore on restart. Your last provider, model, and API key are persisted locally.

---

## Features

### Multi-Provider AI
| Provider | Models | Reasoning |
|---|---|---|
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku | ✓ |
| **OpenAI** | GPT-4o, GPT-4o-mini, o3, o4-mini, o1, o1-mini | ✓ |
| **MiniMax** | MiniMax-Text-01 | ✓ (Token Plans) |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | ✓ |
| **Groq** | Llama 3.3, Llama 3.2, Gemma 2, Mixtral | ✗ |
| **Together AI** | Llama 3.3, Qwen 2.5, DeepSeek | ✗ |
| **Fireworks** | Llama 3.1, DeepSeek, Qwen 2 | ✗ |
| **Mistral** | Mistral Large, Mistral Nemo, Codestral | ✓ |
| **Cerebras** | Llama 3.1 8B, Llama 3.1 70B | ✗ |
| **OpenRouter** | All OpenRouter models | varies |
| **OpenAI-Compatible** | Any OpenAI-compatible endpoint | varies |
| **Anthropic-Compatible** | Any Anthropic-compatible endpoint | varies |

### 9 Native Tools
- `list_files` — Map project structure (respects .gitignore)
- `view_file` — Read file contents
- `write_file` — Create new files
- `patch_file` — Surgical edits (saves tokens)
- `execute_shell` — Run commands (dangerous commands blocked)
- `search_files` — Full-text search
- `glob` — Pattern-based file matching (`minimatch`-powered)
- `web_search` — Real-time web queries
- `ask_user` — Ask you questions with predefined options or free-text input

### Beautiful Terminal UI
- **Comprehensive formatting system** — 40+ `format.ts` helpers for consistent, beautiful output across all commands
- **Boxed sections** — All model info, session status, cost breakdowns framed in rounded boxes
- **Interactive command picker** — Type `/` to open a categorized command select menu with inline arg prompts
- **Unicode tool icons** — Each tool has a unique glyph (⚙ ✎ ✑ ☰ ≡ ⌕ ⁎ ☁ ❓)
- **Clean tables** — Structured data in Unicode-bordered tables (`/cost`, `/model`, `status`, `/sessions`, `/plans`, `--list-models`)
- **Animated spinners** — Visual progress indicators for long-running operations
- **Context progress bar** — Visual █ bar showing context window usage
- **Diff highlighting** — Color-coded diff display (green additions, red deletions, cyan hunks)
- **Branch visualization** — Current branch shown as ●, others as ○
- **Reasoning badge** — Color-coded reasoning effort indicator (off/green/yellow/magenta/red)
- **Command categories** — Help organized by Git, Code Quality, Sessions, etc.
- **Consistent status messages** — ✓ success, ✗ error, ⚠ warning, ℹ info, ⊘ cancelled
- **Session summary** — Model · Provider · Reasoning · Workdir on one line
- **Shell command display** — Colored $ with exit code, truncated long commands

### Session & Persistence
- **Auto-save** after every REPL interaction (last 10 kept)
- **Auto-restore** on next launch — pick a session to resume
- **API key persistence** — entered once, reused next time (not from env)
- **Global settings** — last provider, model, reasoning saved to `~/.aura-core/settings.json`

### Workflow Commands
| Command | Description |
|---|---|
| `/diff` | Show uncommitted changes |
| `/commit` | AI-generated commit message + commit |
| `/undo [n]` | Revert last N AI change(s) |
| `/log` | Recent commits |
| `/branch` | List/switch/create branches |
| `/changes` | Changed files summary |
| `/review` | AI code review of recent changes |
| `/test` | Auto-detect and run tests |
| `/lint` | Auto-detect and run linter |
| `/explain` | Explain code in a file |
| `/refactor` | AI refactoring suggestions |
| `/gen-test` | Generate tests for a file |
| `/doc` | Generate documentation |
| `/search` | Web search |
| `/pr` | Create GitHub PR |
| `/watch` | Auto-run tests on file changes |
| `/project` | Show detected project info |
| `/add <file>` | Add file to persistent context |
| `/drop <file>` | Remove file from context |
| `/compact` | Compact conversation history |
| `/init` | Create AURA.md project context |
| `/save [name]` | Save session |
| `/load [name]` | Load session |
| `/resume` | Pick a saved session to resume (shows history) |
| `/sessions` | List saved sessions |
| `/export` | Export to Markdown |
| `/todo add/done/rm/list/clear` | Task management |
| `/memory show/init/clear` | Agent long-term memory |
| `/provider` | Switch AI provider + model |
| `/model` | Change model |
| `/reasoning` | Set reasoning effort |
| `/plans` | MiniMax Token Plans |
| `/cost` | Show session cost |
| `@filename` | Inline file reference |
| `@general <task>` | Spawn subagent for a task |

### Self-Healing
When a shell command or file write fails, aura-core automatically analyzes the error and retries with a corrected approach — up to 5 attempts by default.

---

## Quickstart

### Install

```bash
# Requires Bun
curl -fsSL https://bun.sh/install | bash

# Run directly
bunx aura-core
```

Or download the pre-built binary from [Releases](https://github.com/rut123321/aura-core/releases).

Or clone and run locally:

```bash
git clone https://github.com/rut123321/aura-core.git
cd aura-core
bun install
bun run build   # produces aura.exe
```

### Set an API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# or
export OPENAI_API_KEY="sk-..."
```

If no env var is set, you'll be prompted to enter the key — it will be saved for next time.

### Use

```bash
# One-shot instruction
aura "Fix all TODOs in the codebase"

# Interactive REPL (auto-resume prompt if sessions exist)
aura

# Specify model and reasoning
aura -p deepseek -m deepseek-reasoner -r high "Refactor the auth module"

# Open command picker
# Type / in the REPL to browse commands by category
```

---

## Project Detection

aura-core auto-detects your project type and suggests the right test/build/lint commands:

| File | Detected as |
|---|---|
| `bun.lock` / `bunfig.toml` | Bun |
| `package.json` | Node.js |
| `pyproject.toml` / `setup.py` | Python |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `Gemfile` | Ruby |
| `pom.xml` / `build.gradle` | Java (Maven/Gradle) |
| `mix.exs` | Elixir |
| `Package.swift` | Swift |
| `composer.json` | PHP |
| `*.sln` / `*.csproj` | .NET / C# |
| `deno.json` / `deno.jsonc` | Deno |
| `CMakeLists.txt` | C/C++ (CMake) |
| `Makefile` | C/C++ (Make) |

---

## Environment Variables

| Variable | Required for |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENAI_API_KEY` | OpenAI |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `GROQ_API_KEY` | Groq |
| `TOGETHER_API_KEY` | Together AI |
| `FIREWORKS_API_KEY` | Fireworks |
| `MISTRAL_API_KEY` | Mistral |
| `CEREBRAS_API_KEY` | Cerebras |
| `OPENROUTER_API_KEY` | OpenRouter |
| `MINIMAX_API_KEY` | MiniMax |

---

## Editor Integration

Add to your `~/.bashrc` or `~/.zshrc` for quick access:

```bash
alias aura='bunx aura-core'
```

### VS Code
Create a task in `.vscode/tasks.json`:

```json
{
  "version": "2.1.0",
  "tasks": [{
    "label": "Aura: AI Agent",
    "type": "shell",
    "command": "bunx aura-core",
    "problemMatcher": []
  }]
}
```

---

## Comparison

| Feature | aura-core | Claude Code | Codex CLI | opencode |
|---|---|---|---|---|
| Providers | 12+ | 1 (Anthropic) | 1 (Anthropic) | 7+ |
| Open Source | ✓ MIT | ✗ | ✓ Apache 2.0 | ✓ Apache 2.0 |
| Self-Healing | ✓ | ✓ | ✗ | ✗ |
| Interactive Command Picker | ✓ | ✓ | ✗ | ✗ |
| Gradient UI / Tables / Spinners | ✓ | ✗ | ✗ | ✗ |
| Session Auto-Save | ✓ | ✓ | ✗ | ✓ |
| Session Resume | ✓ | ✓ | ✗ | ✓ |
| File Watching | ✓ | ✗ | ✗ | ✗ |
| Web Search | ✓ | ✓ | ✓ | ✓ |
| PR Creation | ✓ | ✗ | ✓ | ✗ |
| API Key Persist | ✓ | ✗ | ✗ | ✗ |
| Custom Provider Support | ✓ | ✗ | ✗ | ✓ |
| Sub-Agent Spawning | ✓ | ✓ | ✓ | ✓ |
| Ask User Prompts | ✓ | ✗ | ✗ | ✗ |
| Project Detection | 15 types | — | — | — |

---

## Architecture

```
src/
├── cli.ts          # Entry point — REPL, commands, command picker
├── agent.ts        # ReAct loop — streaming, tool execution, self-healing
├── tools.ts        # Tool implementations + backup/undo
├── types.ts        # Type definitions, 12 provider configs, pricing
├── models.ts       # Model definitions & selection
├── config.ts       # Project detection (15 types) & config loading
├── context.ts      # File context, AURA.md, MEMORY.md
├── session.ts      # Session save/load/export, global settings, auto-save
├── git.ts          # Git operations (status, diff, commit, branch)
├── diff.ts         # Diff generation & web search
├── pr.ts           # GitHub PR creation (via gh CLI)
├── watcher.ts      # File watcher for auto-test
├── todo.ts         # Task management
├── subagent.ts     # Sub-agent spawning
├── tokenplan.ts    # MiniMax Token Plans
├── format.ts       # Terminal UI formatting (40+ helpers)
└── ui/             # Ink/React components (scaffold)
    ├── index.tsx
    ├── splash.tsx
    └── app.tsx
site/
├── index.html      # Landing page
├── styles.css      # Dark theme with glassmorphism
└── script.js       # Animations & interactivity
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE) © 2025 aura-core
