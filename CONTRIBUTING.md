# Contributing to aura-core

Thanks for your interest in contributing!

## Setup

```bash
# Prerequisites: Bun >=1.1.0
curl -fsSL https://bun.sh/install | bash

git clone https://github.com/rut123321/aura-core.git
cd aura-core
bun install
```

## Development

```bash
# Start in REPL mode
bun start

# Watch mode
bun run dev

# Type-check
bun run typecheck

# Build binary
bun run build
```

## Code Style

- **TypeScript** with strict mode
- No semicolons (project convention)
- No unused variables or parameters (`noUnusedLocals`, `noUnusedParameters`)
- Prefer `patch_file`-friendly code patterns
- Keep functions focused and files under ~500 lines where possible

## Project Structure

```
src/
├── cli.ts       # Entry point & REPL
├── agent.ts     # ReAct loop & streaming
├── tools.ts     # Tool implementations
├── types.ts     # Types & provider configs
├── models.ts    # Model definitions
├── config.ts    # Project detection
├── context.ts   # File context
├── session.ts   # Session management
├── git.ts       # Git operations
├── diff.ts      # Diffs & web search
├── pr.ts        # GitHub PR creation
├── watcher.ts   # File watcher
├── todo.ts      # Task management
├── subagent.ts  # Sub-agent spawning
└── tokenplan.ts # Token plans
```

## Pull Request Process

1. Open an issue describing the change
2. Fork the repo and create a branch
3. Make your changes
4. Run `bun run typecheck` to verify types
5. If adding a new provider/model, update `src/types.ts` and `src/models.ts`
6. Submit a PR with a clear description

## Adding a New Provider

1. Add config to `PROVIDERS` in `src/types.ts`
2. Add models to `ALL_CURATED` in `src/models.ts`
3. Add pricing to `PROVIDER_PRICING` in `src/types.ts` (optional)
4. Add environment variable to README table

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
