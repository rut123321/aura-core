# Changelog

## [2.2.0] - 2026-07-03

### Added
- `src/format.ts` — comprehensive terminal formatting system with 40+ helpers
- `src/ui/splash.tsx` — beautiful ink-based animated splash screen
- `src/ui/app.tsx` — ink React app scaffold (reserved for future full-screen UI)
- Unicode tool glyphs (⚙ ✎ ✑ ☰ ≡ ⌕ ⁎ ☁ ❓) for each agent tool
- `sectionInline()`, `pendingAction()`, `labelValue()`, `runMetric()` for consistent section headers
- `diffAdd()`, `diffDel()`, `diffContext()`, `diffHunk()`, `diffMore()` for color-coded diffs
- `branchCurrent()`, `branchOther()` for branch listing with ●/○ indicators
- `toolStart()`, `toolOk()`, `toolFail()` for agent tool call display
- `thinking()`, `buildInfo()`, `interrupted()`, `compacting()`, `compacted()`, `healingLimit()`, `maxIterations()`, `declined()`, `blocked()` for agent status messages
- `cmdOk()`, `cmdFail()` for shell command results with exit code

### Changed
- All CLI section headers use unified `sectionInline()` format (`◆ Title`)
- Status bar uses `statusLine()` with `contextBar()` and `divider()`
- Agent tool output uses `toolStart()`/`toolOk()`/`toolFail()` with Unicode glyphs
- Agent shell command output uses `cmdOk()`/`cmdFail()` with exit code colors
- All agent status messages (interrupted, compacting, healing, etc.) use format.ts helpers
- Banner uses clean divider lines
- Session info uses `sessionLine()` showing model · provider · reasoning · workdir
- Windows `\r\n` console.log override preserved

## [2.1.0] - 2026-07-02

### Added
- Session resume: startup prompt asks to resume a previous session when sessions exist
- `/resume` command in REPL — pick and load a saved session interactively
- Global settings persistence: last used provider, model, reasoning effort, API key saved to `~/.aura-core/settings.json`, auto-restored on next launch
- Auto-save sessions after every REPL interaction (named `auto-{timestamp}`, keeps last 10)
- Auto-save on exit (Ctrl+C / `exit` command)
- API key saved in settings when entered interactively (not from env var)
- New project types: Elixir, .NET/C#, Swift, PHP, Deno, C/C++ (CMake, Makefile)
- Gradle support alongside Maven for Java projects
- `minimatch` library for proper glob pattern matching (supports `{a,b}`, `[!abc]`, `[0-9]`)
- `@filename` references now work for files without extensions (`@Dockerfile`, `@Makefile`)
- `CONTRIBUTING.md` — contribution guide
- `CHANGELOG.md` — project history
- `typecheck` script (`tsc --noEmit`)

### Fixed
- Vitest detection: now checks if test script contains "vitest" instead of looking for `scripts.vitest`
- Self-healing counter: resets only when a shell command succeeds, not when any non-shell tool is present
- Duplicated `generateUnifiedDiff` and `resolveSafePath` — consolidated to single sources
- `toolGlob` regex anchoring bug that matched `*.ts` against `something.ts.backup`
- `toolSearchFiles` dead code: `ALWAYS_IGNORED_DIRS.has(name)` on files (never true)

### Changed
- `resolveSafePath` exported from `tools.ts`, imported by `context.ts` (no more duplication)
- Self-healing logic: `shellSucceededInThisBatch` flag properly tracks shell success separately

## [2.0.0] - 2026-06-30

### Added
- Initial public release
- ReAct loop with 10 AI providers
- 8 native tools: list_files, view_file, write_file, patch_file, execute_shell, search_files, glob, web_search
- Git integration: diff, commit, undo, log, branch, changes
- Session save/load/export
- File watching with auto-test
- Todo management
- Agent memory (MEMORY.md)
- Self-healing on command failure
- Sub-agent spawning
- Token plans for MiniMax
