import { watch, type FSWatcher } from "node:fs";
import { join, relative } from "node:path";
import { readdirSync, statSync } from "node:fs";
import pc from "picocolors";

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo", "coverage", ".bun", ".cache"]);
const IGNORED_EXTS = new Set([".log", ".lock", ".tmp"]);
const DEBOUNCE_MS = 500;

export interface WatchEvent {
  path: string;
  type: "change" | "add" | "unlink";
}

export class FileWatcher {
  private watchers: FSWatcher[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private onChange: (events: WatchEvent[]) => void;
  private workingDir: string;
  private running = false;

  constructor(workingDir: string, onChange: (events: WatchEvent[]) => void) {
    this.workingDir = workingDir;
    this.onChange = onChange;
  }

  start(): void {
    this.running = true;
    this.watchDir(this.workingDir);
  }

  stop(): void {
    this.running = false;
    for (const w of this.watchers) {
      try { w.close(); } catch { void 0; }
    }
    this.watchers = [];
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  private watchDir(dir: string): void {
    if (!this.running) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    try {
      const watcher = watch(dir, (_eventType, filename) => {
        if (!filename || !this.running) return;
        const fullPath = join(dir, filename);
        const relPath = relative(this.workingDir, fullPath).replace(/\\/g, "/");

        if (this.isIgnored(relPath)) return;

        const key = relPath;
        const existing = this.debounceTimers.get(key);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(key, setTimeout(() => {
          this.debounceTimers.delete(key);
          if (!this.running) return;

          let type: WatchEvent["type"] = "change";
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              this.watchDir(fullPath);
              return;
            }
            type = "change";
          } catch {
            type = "unlink";
          }

          this.onChange([{ path: relPath, type }]);
        }, DEBOUNCE_MS));
      });
      this.watchers.push(watcher);
    } catch {
      void 0;
    }

    for (const name of entries) {
      if (IGNORED_DIRS.has(name)) continue;
      const fullPath = join(dir, name);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          this.watchDir(fullPath);
        }
      } catch {
        continue;
      }
    }
  }

  private isIgnored(relPath: string): boolean {
    const parts = relPath.split("/");
    for (const part of parts) {
      if (IGNORED_DIRS.has(part)) return true;
    }
    for (const ext of IGNORED_EXTS) {
      if (relPath.endsWith(ext)) return true;
    }
    return false;
  }
}

export function formatWatchEvents(events: WatchEvent[]): string {
  return events.map(e => {
    const icon = e.type === "add" ? "+" : e.type === "unlink" ? "-" : "~";
    return `${pc.gray(icon)} ${e.path}`;
  }).join("\n");
}
