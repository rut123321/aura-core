import { readdirSync, statSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, normalize } from "node:path";
import { Minimatch } from "minimatch";
import type { Tool, ShellResult, ProjectFile, FileBackup } from "./types";

const ALWAYS_IGNORED_DIRS = new Set([".git", "node_modules", ".next", ".turbo", ".cache", "coverage", ".bun"]);
const ALWAYS_IGNORED_FILES = new Set([".DS_Store", "Thumbs.db"]);
const MAX_FILE_SIZE = 200_000;
const MAX_OUTPUT = 50_000;
const DEFAULT_TIMEOUT = 60_000;

function parseGitignore(content: string): string[] {
  const patterns: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    patterns.push(trimmed);
  }
  return patterns;
}

function gitignorePatternToRegex(pattern: string): RegExp {
  let p = pattern.replace(/^\//, "");
  const dirOnly = p.endsWith("/");
  p = p.replace(/\/$/, "");
  p = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  p = p.replace(/\*\*/g, ".__GLOBSTAR__.");
  p = p.replace(/\*/g, "[^/]*");
  p = p.replace(/\?/g, "[^/]");
  p = p.replace(/\.__GLOBSTAR__\./g, ".*");
  const suffix = dirOnly ? "(/|$)" : "($|/)";
  return new RegExp(`(^|/)${p}${suffix}`);
}

function isIgnored(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) continue;
    const regex = gitignorePatternToRegex(pattern);
    if (regex.test(relPath)) return true;
  }
  return false;
}

function isNegated(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (!pattern.startsWith("!")) continue;
    const regex = gitignorePatternToRegex(pattern.slice(1));
    if (regex.test(relPath)) return true;
  }
  return false;
}

function getIgnoredPatterns(workingDir: string): string[] {
  const gitignorePath = join(workingDir, ".gitignore");
  if (!existsSync(gitignorePath)) return [];
  return parseGitignore(readFileSync(gitignorePath, "utf-8"));
}

function listFilesRecursive(
  dir: string,
  workingDir: string,
  patterns: string[],
): ProjectFile[] {
  const result: ProjectFile[] = [];

  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return result;
  }

  for (const name of names) {
    if (ALWAYS_IGNORED_FILES.has(name)) continue;

    const fullPath = join(dir, name);
    const relPath = normalize(fullPath.slice(workingDir.length + 1)).replace(/\\/g, "/");

    let isDir = false;
    let isFile = false;
    let fileSize = 0;
    try {
      const stat = statSync(fullPath);
      isDir = stat.isDirectory();
      isFile = stat.isFile();
      fileSize = stat.size;
    } catch {
      continue;
    }

    if (isDir && ALWAYS_IGNORED_DIRS.has(name)) continue;
    if (isIgnored(relPath, patterns) && !isNegated(relPath, patterns)) continue;

    if (isDir) {
      result.push({ path: relPath, type: "directory", size: 0 });
      result.push(...listFilesRecursive(fullPath, workingDir, patterns));
    } else if (isFile) {
      result.push({ path: relPath, type: "file", size: fileSize });
    }
  }

  return result;
}

function formatFileList(files: ProjectFile[]): string {
  if (files.length === 0) return "Directory is empty.";

  const dirs = files.filter((f) => f.type === "directory").sort((a, b) => a.path.localeCompare(b.path));
  const regularFiles = files.filter((f) => f.type === "file").sort((a, b) => a.path.localeCompare(b.path));

  const lines: string[] = [];
  lines.push(`Directories: ${dirs.length}, Files: ${regularFiles.length}\n`);

  if (dirs.length > 0) {
    lines.push("Directories:");
    for (const d of dirs) lines.push(`  ${d.path}/`);
  }

  if (regularFiles.length > 0) {
    if (dirs.length > 0) lines.push("");
    lines.push("Files:");
    for (const f of regularFiles) {
      const sizeStr = f.size < 1024 ? `${f.size} B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
      lines.push(`  ${f.path} [${sizeStr}]`);
    }
  }

  return lines.join("\n");
}

export function resolveSafePath(inputPath: string, workingDir: string): string {
  const normalizedWorking = resolve(workingDir);
  const resolved = resolve(workingDir, inputPath);
  const normalizedResolved = normalize(resolved);
  if (!normalizedResolved.startsWith(normalizedWorking)) {
    throw new Error(`Security: Path "${inputPath}" resolves outside the working directory.`);
  }
  return normalizedResolved;
}

function truncateOutput(text: string, max: number = MAX_OUTPUT): string {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return (
    text.slice(0, half) +
    `\n\n... [output truncated: ${text.length - max} characters omitted] ...\n\n` +
    text.slice(-half)
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function toolListFiles(dir: string, workingDir: string): Promise<string> {
  const safeDir = resolveSafePath(dir, workingDir);
  if (!existsSync(safeDir)) {
    throw new Error(`Directory not found: ${dir}`);
  }
  const stat = statSync(safeDir);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${dir}`);
  }

  const patterns = getIgnoredPatterns(workingDir);
  const files = listFilesRecursive(safeDir, workingDir, patterns);
  return formatFileList(files);
}

export async function toolViewFile(path: string, workingDir: string): Promise<string> {
  const safePath = resolveSafePath(path, workingDir);
  const file = Bun.file(safePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`File not found: ${path}`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${formatSize(file.size)}. Maximum is ${formatSize(MAX_FILE_SIZE)}.`);
  }

  const text = await file.text();
  if (text.includes("\0")) {
    throw new Error(`File appears to be binary: ${path}`);
  }
  return text;
}

export async function toolWriteFile(path: string, content: string, workingDir: string): Promise<string> {
  const safePath = resolveSafePath(path, workingDir);
  if (existsSync(safePath)) {
    createBackup(path, workingDir);
  }
  const parentDir = dirname(safePath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
  await Bun.write(safePath, content);
  const writtenBytes = new TextEncoder().encode(content).length;
  return `File written: ${path} (${formatSize(writtenBytes)})`;
}

export async function toolPatchFile(
  path: string,
  search: string,
  replace: string,
  replaceAll: boolean,
  workingDir: string,
): Promise<string> {
  const safePath = resolveSafePath(path, workingDir);
  const file = Bun.file(safePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`File not found: ${path}`);
  }

  const content = await file.text();
  if (!content.includes(search)) {
    const preview = content.slice(0, 500);
    throw new Error(
      `Search string not found in ${path}.\nFirst 500 chars of file:\n${preview}`,
    );
  }

  const occurrences = content.split(search).length - 1;
  if (occurrences > 1 && !replaceAll) {
    throw new Error(
      `Found ${occurrences} occurrences of the search string in ${path}. ` +
        `Provide more surrounding context to uniquely identify the target, ` +
        `or set replace_all to true.`,
    );
  }

  let newContent: string;
  if (replaceAll) {
    newContent = content.split(search).join(replace);
  } else {
    newContent = content.replace(search, replace);
  }

  createBackup(path, workingDir);
  await Bun.write(safePath, newContent);
  const replacedCount = replaceAll ? occurrences : 1;
  return `Patched ${path}: ${replacedCount} replacement${replacedCount > 1 ? "s" : ""} applied.`;
}

export async function toolExecuteShell(
  command: string,
  workingDir: string,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<ShellResult> {
  const isWindows = process.platform === "win32";
  const shell = isWindows ? "cmd" : "/bin/sh";
  const shellFlag = isWindows ? "/c" : "-c";

  const proc = Bun.spawn({
    cmd: [shell, shellFlag, command],
    stdout: "pipe",
    stderr: "pipe",
    cwd: workingDir,
    env: { ...process.env },
  });

  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    try {
      proc.kill();
    } catch {
      void 0;
    }
  }, timeout);

  const [stdout, stderr, exitCode] = await Promise.all([
    proc.stdout ? new Response(proc.stdout).text() : "",
    proc.stderr ? new Response(proc.stderr).text() : "",
    proc.exited,
  ]);

  clearTimeout(timer);

  if (killed) {
    return {
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr) + `\n[Process killed: timeout after ${timeout}ms]`,
      exitCode: -1,
      success: false,
    };
  }

  return {
    stdout: truncateOutput(stdout),
    stderr: truncateOutput(stderr),
    exitCode,
    success: exitCode === 0,
  };
}

const MAX_SEARCH_RESULTS = 50;
const MAX_SEARCH_FILE_SIZE = 500_000;

export async function toolSearchFiles(
  pattern: string,
  workingDir: string,
  searchPath: string = ".",
  includePattern: string | null = null,
): Promise<string> {
  const safeDir = resolveSafePath(searchPath, workingDir);
  if (!existsSync(safeDir)) {
    throw new Error(`Directory not found: ${searchPath}`);
  }

  const results: Array<{ file: string; line: number; text: string }> = [];
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(escaped, "i");
  }

  const includeRegex = includePattern
    ? new RegExp("^" + includePattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$")
    : null;

  const gitignorePatterns = getIgnoredPatterns(workingDir);

  function searchInDir(dir: string): void {
    if (results.length >= MAX_SEARCH_RESULTS) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (results.length >= MAX_SEARCH_RESULTS) return;
      if (ALWAYS_IGNORED_FILES.has(name)) continue;
      const fullPath = join(dir, name);
      const relPath = normalize(fullPath.slice(workingDir.length + 1)).replace(/\\/g, "/");
      let isDir = false, isFile = false, size = 0;
      try {
        const st = statSync(fullPath);
        isDir = st.isDirectory();
        isFile = st.isFile();
        size = st.size;
      } catch {
        continue;
      }
      if (isDir) {
        if (ALWAYS_IGNORED_DIRS.has(name)) continue;
        if (isIgnored(relPath, gitignorePatterns)) continue;
        searchInDir(fullPath);
      } else if (isFile) {
        if (ALWAYS_IGNORED_DIRS.has(name)) continue;
        if (isIgnored(relPath, gitignorePatterns)) continue;
        if (includeRegex && !includeRegex.test(relPath)) continue;
        if (size > MAX_SEARCH_FILE_SIZE) continue;
        if (size === 0) continue;
        try {
          const content = readFileSync(fullPath, "utf-8");
          if (content.includes("\0")) continue;
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push({ file: relPath, line: i + 1, text: lines[i].trim().slice(0, 200) });
              if (results.length >= MAX_SEARCH_RESULTS) break;
            }
          }
        } catch {
          continue;
        }
      }
    }
  }

  searchInDir(safeDir);

  if (results.length === 0) {
    return `No matches found for pattern "${pattern}" in ${searchPath}.`;
  }

  const lines: string[] = [];
  lines.push(`Found ${results.length} match${results.length > 1 ? "es" : ""} for "${pattern}":\n`);
  for (const r of results) {
    lines.push(`  ${r.file}:${r.line}  ${r.text}`);
  }
  if (results.length >= MAX_SEARCH_RESULTS) {
    lines.push(`\n(Showing first ${MAX_SEARCH_RESULTS} results. Refine your pattern for more specific matches.)`);
  }
  return lines.join("\n");
}

export async function toolGlob(
  pattern: string,
  workingDir: string,
  searchPath: string = ".",
): Promise<string> {
  const safeDir = resolveSafePath(searchPath, workingDir);
  if (!existsSync(safeDir)) {
    throw new Error(`Directory not found: ${searchPath}`);
  }

  let mm: Minimatch;
  try {
    mm = new Minimatch(pattern, { dot: true, matchBase: false });
  } catch {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    mm = new Minimatch(escaped, { dot: true, matchBase: false });
  }

  const gitignorePatterns = getIgnoredPatterns(workingDir);
  const results: string[] = [];
  const MAX_GLOB = 200;

  function walkDir(dir: string): void {
    if (results.length >= MAX_GLOB) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (results.length >= MAX_GLOB) return;
      if (ALWAYS_IGNORED_FILES.has(name)) continue;
      const fullPath = join(dir, name);
      const relPath = normalize(fullPath.slice(workingDir.length + 1)).replace(/\\/g, "/");
      let isDir = false, isFile = false;
      try {
        const st = statSync(fullPath);
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch {
        continue;
      }
      if (isDir) {
        if (ALWAYS_IGNORED_DIRS.has(name)) continue;
        if (isIgnored(relPath, gitignorePatterns)) continue;
        walkDir(fullPath);
      } else if (isFile) {
        if (isIgnored(relPath, gitignorePatterns)) continue;
        if (mm.match(relPath) || mm.match(name)) {
          results.push(relPath);
        }
      }
    }
  }

  walkDir(safeDir);

  if (results.length === 0) {
    return `No files found matching "${pattern}" in ${searchPath}.`;
  }

  results.sort();
  const lines: string[] = [`Found ${results.length} file${results.length > 1 ? "s" : ""} matching "${pattern}":\n`];
  for (const r of results) {
    lines.push(`  ${r}`);
  }
  if (results.length >= MAX_GLOB) {
    lines.push(`\n(Showing first ${MAX_GLOB} results.)`);
  }
  return lines.join("\n");
}

const fileBackups: Map<string, FileBackup> = new Map();
const backupStack: FileBackup[] = [];

export function createBackup(relPath: string, workingDir: string): FileBackup | null {
  const safePath = resolveSafePath(relPath, workingDir);
  if (!existsSync(safePath)) return null;
  try {
    const content = readFileSync(safePath, "utf-8");
    const backup: FileBackup = { path: relPath, originalContent: content, timestamp: Date.now() };
    fileBackups.set(relPath, backup);
    backupStack.push(backup);
    return backup;
  } catch {
    return null;
  }
}

export function getBackup(relPath: string): FileBackup | null {
  return fileBackups.get(relPath) ?? null;
}

export function restoreBackup(relPath: string, workingDir: string): boolean {
  const backup = fileBackups.get(relPath);
  if (!backup) return false;
  const safePath = resolveSafePath(relPath, workingDir);
  try {
    writeFileSync(safePath, backup.originalContent, "utf-8");
    fileBackups.delete(relPath);
    const stackIdx = backupStack.findIndex(b => b.path === relPath);
    if (stackIdx !== -1) backupStack.splice(stackIdx, 1);
    return true;
  } catch {
    return false;
  }
}

export function undoNChanges(n: number, workingDir: string): { count: number; files: string[] } {
  const undone: string[] = [];
  for (let i = 0; i < n && backupStack.length > 0; i++) {
    const backup = backupStack.pop()!;
    const safePath = resolveSafePath(backup.path, workingDir);
    try {
      writeFileSync(safePath, backup.originalContent, "utf-8");
      fileBackups.delete(backup.path);
      undone.push(backup.path);
    } catch {
      backupStack.push(backup);
      break;
    }
  }
  return { count: undone.length, files: undone };
}

export function getBackupCount(): number {
  return backupStack.length;
}

export function generateUnifiedDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);
  const diffLines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  let added = 0, removed = 0;
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : null;
    const newLine = i < newLines.length ? newLines[i] : null;
    if (oldLine === newLine) {
      diffLines.push(` ${oldLine ?? ""}`);
    } else {
      if (oldLine !== null) {
        diffLines.push(`-${oldLine}`);
        removed++;
      }
      if (newLine !== null) {
        diffLines.push(`+${newLine}`);
        added++;
      }
    }
  }

  if (added === 0 && removed === 0) return "";
  return diffLines.join("\n");
}

export function getModifiedFiles(): string[] {
  return Array.from(fileBackups.keys());
}

export function clearBackups(): void {
  fileBackups.clear();
  backupStack.length = 0;
}

interface DangerousCheck {
  dangerous: boolean;
  reason: string;
}

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+-[a-z]*r[a-z]*f[a-z]*\s+[/~]/i, reason: "Recursive deletion of root or home directory" },
  { pattern: /rm\s+-[a-z]*f[a-z]*r[a-z]*\s+[/~]/i, reason: "Recursive deletion of root or home directory" },
  { pattern: /rm\s+-rf\s+\.\s*$/, reason: "Recursive deletion of current directory" },
  { pattern: /rm\s+-rf\s+\*/, reason: "Recursive deletion of all files in current directory" },
  { pattern: /mkfs/i, reason: "Filesystem formatting" },
  { pattern: /dd\s+if=.*of=\/dev\//i, reason: "Writing directly to a device" },
  { pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "Fork bomb" },
  { pattern: />\s*\/dev\/sd/i, reason: "Writing directly to disk device" },
  { pattern: /chmod\s+-R\s+0+\s+\//i, reason: "Recursive permission wipe on root" },
  { pattern: /chown\s+-R\s+.*\s+\//i, reason: "Recursive ownership change on root" },
];

const CONFIRM_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+/, reason: "File deletion" },
  { pattern: /git\s+push/, reason: "Git push to remote" },
  { pattern: /git\s+reset\s+--hard/, reason: "Git hard reset" },
  { pattern: /git\s+clean\s+-[a-z]*f/, reason: "Git clean (force)" },
  { pattern: /git\s+commit/, reason: "Git commit" },
  { pattern: /npm\s+uninstall/, reason: "Package uninstall" },
  { pattern: /npm\s+rm\s/, reason: "Package removal" },
  { pattern: /npx\s+create-/, reason: "Scaffolding new project" },
  { pattern: /bun\s+remove/, reason: "Package removal" },
  { pattern: /drop\s+table/i, reason: "Database drop table" },
  { pattern: /drop\s+database/i, reason: "Database drop" },
  { pattern: /truncate\s+table/i, reason: "Database truncate" },
  { pattern: /delete\s+from/i, reason: "Database delete" },
];

export function isDangerousCommand(command: string): DangerousCheck {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason };
    }
  }
  return { dangerous: false, reason: "" };
}

export function needsConfirmation(command: string): DangerousCheck {
  for (const { pattern, reason } of CONFIRM_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: false, reason };
    }
  }
  return { dangerous: false, reason: "" };
}

export function shouldConfirmCommand(command: string): { confirm: boolean; reason: string; blocked: boolean } {
  const dangerous = isDangerousCommand(command);
  if (dangerous.dangerous) {
    return { confirm: false, reason: dangerous.reason, blocked: true };
  }
  const confirm = needsConfirmation(command);
  if (confirm.reason) {
    return { confirm: true, reason: confirm.reason, blocked: false };
  }
  return { confirm: false, reason: "", blocked: false };
}

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "list_files",
    description:
      "Recursively list files and directories in the given directory. Respects .gitignore. " +
      "Use this to understand the project structure before making changes. Use '.' for the project root.",
    input_schema: {
      type: "object" as const,
      properties: {
        dir: {
          type: "string",
          description: "Directory path relative to the project root. Use '.' for the root directory.",
        },
      },
      required: ["dir"],
    },
  },
  {
    name: "view_file",
    description:
      "Read the full text contents of a file. Always use this before modifying a file. " +
      "Binary files are rejected. Maximum file size is 200 KB.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Path to the file, relative to the project root.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Create a new file or completely overwrite an existing file with the given content. " +
      "Parent directories are created automatically if they do not exist. " +
      "Prefer patch_file for modifying existing files to save tokens.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Path to the file, relative to the project root.",
        },
        content: {
          type: "string",
          description: "The full text content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "patch_file",
    description:
      "Apply a targeted string replacement in a file. The search string must match exactly " +
      "(including whitespace and indentation). If the search string appears multiple times, " +
      "set replace_all to true or provide more surrounding context for a unique match. " +
      "Always view_file before patching to get the exact text.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Path to the file, relative to the project root.",
        },
        search: {
          type: "string",
          description: "The exact string to find in the file (must match exactly, including whitespace).",
        },
        replace: {
          type: "string",
          description: "The replacement string.",
        },
        replace_all: {
          type: "boolean",
          description: "If true, replace all occurrences. If false (default), replace only the first occurrence.",
        },
      },
      required: ["path", "search", "replace"],
    },
  },
  {
    name: "execute_shell",
    description:
      "Execute a shell command and return stdout, stderr, and exit code. " +
      "Use for running tests, builds, linting, installs, git status, etc. " +
      "Dangerous commands (rm -rf /, mkfs, fork bombs) are blocked. " +
      "Destructive commands (rm, git push, git reset --hard) require user confirmation. " +
      "Output is truncated to 50,000 characters if too long.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 60000). The process is killed if it exceeds this.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "search_files",
    description:
      "Search for a text pattern (regex or plain string) across all files in the project. " +
      "Returns matching lines with file paths and line numbers. " +
      "Much more efficient than reading every file with view_file. " +
      "Respects .gitignore. Max 50 results. Use include to filter by file pattern (e.g. '*.ts').",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "The text pattern to search for. Supports regex.",
        },
        path: {
          type: "string",
          description: "Directory to search in (default: '.'). Relative to project root.",
        },
        include: {
          type: "string",
          description: "File pattern to filter (e.g. '*.ts', '*.py'). Supports * and ? wildcards.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "glob",
    description:
      "Find files by name pattern (glob). Returns matching file paths. " +
      "Use this to quickly find files by name without reading their contents. " +
      "Supports * (any chars except /), ** (any path), ? (single char). " +
      "Respects .gitignore. Max 200 results.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern (e.g. '**/*.ts', 'src/**/*.test.*', '*.json').",
        },
        path: {
          type: "string",
          description: "Directory to search in (default: '.'). Relative to project root.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the web for documentation, solutions, or current information. " +
      "Returns titles, URLs, and snippets from web search results. " +
      "Use this when you need up-to-date information, API docs, or solutions to errors not found in the codebase.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 5).",
        },
      },
      required: ["query"],
    },
  },
];
