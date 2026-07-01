<div align="center">
  <h1>
    <code>aura-core</code>
  </h1>
  <p><strong>Autonomous AI coding agent for the terminal</strong></p>
  <p>
    <a href="https://www.npmjs.com/package/aura-core"><img src="https://img.shields.io/npm/v/aura-core" alt="npm version"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-%23f9f9f9" alt="Bun runtime"></a>
    <a href="https://github.com/rut123321/aura-core/issues"><img src="https://img.shields.io/github/issues/rut123321/aura-core" alt="GitHub issues"></a>
  </p>
  <br>
</div>

**aura-core** is an elite autonomous AI coding agent that operates directly in your terminal. It follows the **ReAct (Reasoning → Action → Observation)** loop to understand, modify, and manage codebases with minimal supervision.

It supports **10 AI providers**, **50+ models**, and comes with **8 native tools** — file read/write/patch, shell execution, glob, search, web search, and file watching.

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

### 8 Native Tools
- `list_files` — Map project structure
- `view_file` — Read file contents
- `write_file` — Create new files
- `patch_file` — Surgical edits (saves tokens)
- `execute_shell` — Run commands
- `search_files` — Full-text search (ripgrep)
- `glob` — Pattern-based file matching
- `web_search` — Real-time web queries

### Workflow Commands
| Command | Description |
|---|---|
| `/diff` | Show uncommitted changes |
| `/commit` | AI-generated commit message + commit |
| `/undo` | Revert last AI change |
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
| `/add` | Add file to persistent context |
| `/drop` | Remove file from context |
| `/compact` | Compact conversation history |
| `/init` | Create AURA.md project context |
| `/save` `[name]` | Save session |
| `/load` `[name]` | Load session |
| `/sessions` | List saved sessions |
| `/export` | Export to Markdown |
| `/todo` | Task management |
| `/memory` | Agent long-term memory |
| `/provider` | Switch AI provider + model |
| `/model` | Change model |
| `/reasoning` | Set reasoning effort |
| `/plans` | MiniMax Token Plans |
| `/cost` | Show session cost |
| `@filename` | Inline file reference |

### Self-Healing
When a shell command or file write fails, aura-core automatically analyzes the error and retries with a corrected approach — up to 3 attempts by default.

---

## Quickstart

### Install

```bash
# Requires Bun
curl -fsSL https://bun.sh/install | bash

# Run directly
bunx aura-core
```

Or clone and run locally:

```bash
git clone https://github.com/rut123321/aura-core.git
cd aura-core
bun install
bun start
```

### Set an API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# or
export OPENAI_API_KEY="sk-..."
# or any provider from the list above
```

### Use

```bash
# One-shot instruction
aura "Fix all TODOs in the codebase"

# Interactive REPL
aura

# Specify model and reasoning
aura -p deepseek -m deepseek-reasoner -r high "Refactor the auth module"
```

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
  "version": "2.0.0",
  "tasks": [{
    "label": "Aura: AI Agent",
    "type": "shell",
    "command": "bunx aura-core",
    "problemMatcher": []
  }]
}
```

### JetBrains
Create a "Run Configuration" of type "Shell Script" with command `bunx aura-core`.

---

## Comparison

| Feature | aura-core | Claude Code | Codex CLI | opencode |
|---|---|---|---|---|
| Providers | 10+ | 1 (Anthropic) | 1 (Anthropic) | 1 (Anthropic) |
| Open Source | ✓ MIT | ✗ | ✗ | ✓ Apache 2.0 |
| Self-Healing | ✓ | ✓ | ✗ | ✗ |
| Session Save/Load | ✓ | ✗ | ✗ | ✓ |
| File Watching | ✓ | ✗ | ✗ | ✗ |
| Web Search | ✓ | ✗ | ✗ | ✗ |
| PR Creation | ✓ | ✗ | ✓ | ✗ |
| Todo/Memory | ✓ | ✗ | ✗ | ✓ |
| Token Plans | ✓ | ✗ | ✗ | ✗ |

---

## Architecture

```
src/
├── cli.ts          # Entry point — REPL & CLI
├── agent.ts        # ReAct loop — tool calling, self-healing
├── tools.ts        # Tool implementations (8 tools)
├── types.ts        # Type definitions & provider configs
├── models.ts       # Model selection & listing
├── config.ts       # Project detection & config loading
├── context.ts      # File context management
├── session.ts      # Session save/load/export
├── git.ts          # Git operations
├── diff.ts         # Diff generation & web search
├── pr.ts           # GitHub PR creation
├── watcher.ts      # File watcher for auto-test
├── todo.ts         # Task management
├── subagent.ts     # Sub-agent spawning
└── tokenplan.ts    # MiniMax Token Plans
```

---

## Contributing

Contributions are welcome! Please open an issue or PR.

---

## License

[MIT](LICENSE) © 2025 aura-core
