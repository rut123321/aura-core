# Changelog

## [2.1.0] - 2026-07-02

### Added
- Session resume: startup prompt asks to resume a previous session when sessions exist
- `/resume` command in REPL — pick and load a saved session interactively
- Global settings persistence: last used provider, model, reasoning effort saved to `~/.aura-core/settings.json`, auto-restored on next launch
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
