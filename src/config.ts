import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import type { AuraConfig, ProjectTypeInfo } from "./types";

const CONFIG_FILE = ".auracore.json";

export function loadConfig(workdir: string): AuraConfig | null {
  const path = join(workdir, CONFIG_FILE);
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as AuraConfig;
  } catch {
    return null;
  }
}

export function saveConfig(workdir: string, config: AuraConfig): boolean {
  const path = join(workdir, CONFIG_FILE);
  try {
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function createDefaultConfig(): AuraConfig {
  return {
    provider: null,
    model: null,
    reasoningEffort: null,
    autoConfirm: false,
    contextFiles: [],
  };
}

export function mergeConfig(loaded: AuraConfig | null, overrides: Partial<AuraConfig>): AuraConfig {
  const base = loaded ?? createDefaultConfig();
  return {
    provider: overrides.provider ?? base.provider,
    model: overrides.model ?? base.model,
    reasoningEffort: overrides.reasoningEffort ?? base.reasoningEffort,
    autoConfirm: overrides.autoConfirm ?? base.autoConfirm,
    contextFiles: overrides.contextFiles ?? base.contextFiles,
  };
}

export function detectProjectType(workdir: string): ProjectTypeInfo {
  const has = (f: string) => existsSync(join(workdir, f));
  const readPkg = () => {
    try { return JSON.parse(readFileSync(join(workdir, "package.json"), "utf-8")); } catch { return null; }
  };

  if (has("bunfig.toml") || has("bun.lock")) {
    const pkg = readPkg();
    return {
      type: "bun",
      language: "TypeScript/JavaScript",
      buildCmd: pkg?.scripts?.build ?? "bun build",
      testCmd: pkg?.scripts?.test ?? "bun test",
      lintCmd: pkg?.scripts?.lint ?? null,
      runCmd: pkg?.scripts?.dev ?? "bun run dev",
      packageManager: "bun",
    };
  }

  if (has("package.json")) {
    const pkg = readPkg();
    const pm = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm";
    const testScript = pkg?.scripts?.test ?? "";
    return {
      type: "node",
      language: pkg?.type === "module" ? "ESM JavaScript" : "JavaScript/TypeScript",
      buildCmd: pkg?.scripts?.build ? `${pm} run build` : null,
      testCmd: testScript ? (testScript.includes("vitest") ? `npx vitest run` : `${pm} test`) : null,
      lintCmd: pkg?.scripts?.lint ? `${pm} run lint` : has(".eslintrc") ? "npx eslint ." : null,
      runCmd: pkg?.scripts?.dev ? `${pm} run dev` : pkg?.scripts?.start ? `${pm} start` : null,
      packageManager: pm,
    };
  }

  if (has("pyproject.toml") || has("setup.py") || has("requirements.txt")) {
    return {
      type: "python",
      language: "Python",
      buildCmd: null,
      testCmd: has("pytest.ini") || has("pyproject.toml") ? "pytest" : "python -m pytest",
      lintCmd: has(".ruff.toml") ? "ruff check ." : has(".flake8") ? "flake8 ." : null,
      runCmd: null,
      packageManager: "pip",
    };
  }

  if (has("Cargo.toml")) {
    return {
      type: "rust",
      language: "Rust",
      buildCmd: "cargo build",
      testCmd: "cargo test",
      lintCmd: "cargo clippy",
      runCmd: "cargo run",
      packageManager: "cargo",
    };
  }

  if (has("go.mod")) {
    return {
      type: "go",
      language: "Go",
      buildCmd: "go build ./...",
      testCmd: "go test ./...",
      lintCmd: has(".golangci.yml") ? "golangci-lint run" : null,
      runCmd: "go run .",
      packageManager: "go",
    };

  }

  if (has("Gemfile")) {
    return {
      type: "ruby",
      language: "Ruby",
      buildCmd: null,
      testCmd: "bundle exec rspec",
      lintCmd: "bundle exec rubocop",
      runCmd: "bundle exec rails server",
      packageManager: "bundler",
    };
  }

  if (has("pom.xml") || has("build.gradle")) {
    const hasGradle = has("build.gradle");
    return {
      type: "java",
      language: "Java",
      buildCmd: hasGradle ? (has("gradlew") ? "./gradlew build" : "gradle build") : has("mvnw") ? "./mvnw compile" : "mvn compile",
      testCmd: hasGradle ? (has("gradlew") ? "./gradlew test" : "gradle test") : has("mvnw") ? "./mvnw test" : "mvn test",
      lintCmd: null,
      runCmd: null,
      packageManager: hasGradle ? "gradle" : "maven",
    };
  }

  if (has("mix.exs")) {
    return {
      type: "elixir",
      language: "Elixir",
      buildCmd: "mix compile",
      testCmd: "mix test",
      lintCmd: "mix credo --strict",
      runCmd: "mix run",
      packageManager: "mix",
    };
  }

  if (has("Package.swift")) {
    return {
      type: "swift",
      language: "Swift",
      buildCmd: "swift build",
      testCmd: "swift test",
      lintCmd: null,
      runCmd: "swift run",
      packageManager: "spm",
    };
  }

  if (has("composer.json")) {
    return {
      type: "php",
      language: "PHP",
      buildCmd: null,
      testCmd: has("vendor/bin/phpunit") ? "phpunit" : "vendor/bin/phpunit",
      lintCmd: has("vendor/bin/phpcs") ? "phpcs" : null,
      runCmd: null,
      packageManager: "composer",
    };
  }

  const hasSln = (() => { try { return readdirSync(workdir).some(f => f.endsWith(".sln")); } catch { return false; } })();
  const hasCsproj = (() => { try { return readdirSync(workdir).some(f => f.endsWith(".csproj")); } catch { return false; } })();
  if (hasSln || hasCsproj) {
    return {
      type: "dotnet",
      language: "C#",
      buildCmd: "dotnet build",
      testCmd: "dotnet test",
      lintCmd: null,
      runCmd: "dotnet run",
      packageManager: "nuget",
    };
  }

  if (has("deno.json") || has("deno.jsonc")) {
    return {
      type: "deno",
      language: "TypeScript/JavaScript",
      buildCmd: null,
      testCmd: "deno test",
      lintCmd: "deno lint",
      runCmd: "deno run",
      packageManager: "deno",
    };
  }

  if (has("CMakeLists.txt")) {
    return {
      type: "cmake",
      language: "C/C++",
      buildCmd: "cmake --build .",
      testCmd: "ctest",
      lintCmd: null,
      runCmd: null,
      packageManager: "cmake",
    };
  }

  if (has("Makefile")) {
    return {
      type: "make",
      language: "C/C++",
      buildCmd: "make",
      testCmd: "make test",
      lintCmd: null,
      runCmd: null,
      packageManager: "make",
    };
  }

  return {
    type: "unknown",
    language: "Unknown",
    buildCmd: null,
    testCmd: null,
    lintCmd: null,
    runCmd: null,
    packageManager: "unknown",
  };
}

export function formatProjectInfo(info: ProjectTypeInfo): string {
  const lines: string[] = [];
  lines.push(`${pc.gray("type")}     ${info.language}`);
  lines.push(`${pc.gray("pm")}       ${info.packageManager}`);
  if (info.buildCmd) lines.push(`${pc.gray("build")}    ${info.buildCmd}`);
  if (info.testCmd) lines.push(`${pc.gray("test")}     ${info.testCmd}`);
  if (info.lintCmd) lines.push(`${pc.gray("lint")}     ${info.lintCmd}`);
  if (info.runCmd) lines.push(`${pc.gray("run")}      ${info.runCmd}`);
  return lines.join("\n");
}
