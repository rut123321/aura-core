import * as readline from "node:readline";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface AutocompleteOptions {
  prompt: string;
  placeholder?: string;
  workdir: string;
  history?: string[];
  onSubmit?: (text: string) => Promise<boolean> | boolean;
}

const HISTORY_MAX = 100;

export async function promptWithAutocomplete(opts: AutocompleteOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: opts.prompt,
      historySize: HISTORY_MAX,
    });
    if (opts.history) {
      for (const h of opts.history.slice(-HISTORY_MAX)) (rl as unknown as { history: string[] }).history.push(h);
    }

    let buffer = "";
    let cursorPos = 0;
    let lastMatches: string[] = [];
    let matchIndex = -1;
    let activePrefix = "";

    const cleanup = () => {
      rl.close();
    };

    const redraw = () => {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write("\x1b[K");
      process.stdout.write(opts.prompt);
      process.stdout.write(buffer);
      if (cursorPos < buffer.length) {
        readline.moveCursor(process.stdout, -(buffer.length - cursorPos), 0);
      }
    };

    const getCompletions = (prefix: string): string[] => {
      const expanded = prefix.startsWith("~") ? join(process.env.HOME || "", prefix.slice(1)) : prefix;
      let dir: string;
      let partial: string;
      if (expanded.includes("/") || expanded.includes("\\")) {
        const lastSlash = Math.max(expanded.lastIndexOf("/"), expanded.lastIndexOf("\\"));
        dir = expanded.slice(0, lastSlash) || ".";
        partial = expanded.slice(lastSlash + 1);
      } else {
        dir = ".";
        partial = expanded;
      }
      const absDir = dir.startsWith("/") || /^[A-Z]:/.test(dir) ? dir : join(opts.workdir, dir);
      if (!existsSync(absDir)) return [];
      try {
        const entries = readdirSync(absDir);
        return entries
          .filter(e => e.toLowerCase().startsWith(partial.toLowerCase()))
          .filter(e => {
            try {
              const stat = statSync(join(absDir, e));
              if (e.startsWith(".") && !partial.startsWith(".")) return false;
              return stat.isFile() || stat.isDirectory();
            } catch { return false; }
          })
          .map(e => {
            const fullPath = join(absDir, e);
            try {
              return statSync(fullPath).isDirectory() ? e + "/" : e;
            } catch { return e; }
          })
          .slice(0, 20);
      } catch { return []; }
    };

    const findAtTrigger = (text: string, pos: number): { start: number; prefix: string } | null => {
      let i = pos - 1;
      while (i >= 0) {
        const ch = text[i];
        if (ch === "@") {
          const prefix = text.slice(i + 1, pos);
          if (prefix.length > 0 && /^[a-zA-Z0-9._/\\~-]*$/.test(prefix)) {
            return { start: i + 1, prefix };
          }
          return null;
        }
        if (/\s/.test(ch)) return null;
        i--;
      }
      return null;
    };

    const handleTab = (): void => {
      const trig = findAtTrigger(buffer, cursorPos);
      if (!trig) {
        process.stdout.write("\x07");
        return;
      }
      const matches = getCompletions(trig.prefix);
      if (matches.length === 0) {
        process.stdout.write("\x07");
        return;
      }
      if (matches.length === 1) {
        const before = buffer.slice(0, trig.start);
        const after = buffer.slice(cursorPos);
        buffer = before + matches[0] + after;
        cursorPos = trig.start + matches[0].length;
        activePrefix = "";
        matchIndex = -1;
        lastMatches = [];
        redraw();
        return;
      }
      if (activePrefix !== trig.prefix) {
        activePrefix = trig.prefix;
        matchIndex = 0;
        lastMatches = matches;
      } else {
        matchIndex = (matchIndex + 1) % lastMatches.length;
      }
      const match = lastMatches[matchIndex];
      const before = buffer.slice(0, trig.start);
      const after = buffer.slice(cursorPos);
      buffer = before + match + after;
      cursorPos = trig.start + match.length;
      redraw();
      setTimeout(() => {
        if (lastMatches.length > 1) {
          process.stdout.write("\n");
          const cols = Math.min(process.stdout.columns ?? 80, 100);
          const colWidth = Math.max(...lastMatches.map(m => m.length)) + 2;
          const perRow = Math.floor(cols / colWidth);
          for (let i = 0; i < lastMatches.length; i++) {
            if (i > 0 && i % perRow === 0) process.stdout.write("\n");
            process.stdout.write(lastMatches[i].padEnd(colWidth));
          }
          process.stdout.write("\n");
          process.stdout.write(opts.prompt);
          process.stdout.write(buffer);
          if (cursorPos < buffer.length) {
            readline.moveCursor(process.stdout, -(buffer.length - cursorPos), 0);
          }
        }
      }, 10);
    };

    const handleKeypress = (_str: string, key: readline.Key): void => {
      if (!key) return;
      if (key.name === "tab") {
        handleTab();
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        process.stdout.write("\n");
        const text = buffer;
        cleanup();
        resolve(text);
        return;
      }
      if (key.ctrl && key.name === "c") {
        process.stdout.write("^C\n");
        cleanup();
        resolve(null);
        return;
      }
      if (key.name === "backspace") {
        if (cursorPos > 0) {
          buffer = buffer.slice(0, cursorPos - 1) + buffer.slice(cursorPos);
          cursorPos--;
          activePrefix = "";
          matchIndex = -1;
          lastMatches = [];
          redraw();
        }
        return;
      }
      if (key.name === "delete") {
        if (cursorPos < buffer.length) {
          buffer = buffer.slice(0, cursorPos) + buffer.slice(cursorPos + 1);
          redraw();
        }
        return;
      }
      if (key.name === "left") {
        if (cursorPos > 0) { cursorPos--; redraw(); }
        return;
      }
      if (key.name === "right") {
        if (cursorPos < buffer.length) { cursorPos++; redraw(); }
        return;
      }
      if (key.ctrl && key.name === "a") { cursorPos = 0; redraw(); return; }
      if (key.ctrl && key.name === "e") { cursorPos = buffer.length; redraw(); return; }
      if (key.ctrl && key.name === "k") { buffer = buffer.slice(0, cursorPos); redraw(); return; }
      if (key.ctrl && key.name === "u") { buffer = buffer.slice(cursorPos); cursorPos = 0; redraw(); return; }
      if (key.ctrl && key.name === "w") {
        let i = cursorPos - 1;
        while (i >= 0 && /\s/.test(buffer[i])) i--;
        while (i >= 0 && !/\s/.test(buffer[i])) i--;
        buffer = buffer.slice(0, i + 1) + buffer.slice(cursorPos);
        cursorPos = i + 1;
        redraw();
        return;
      }
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        buffer = buffer.slice(0, cursorPos) + key.sequence + buffer.slice(cursorPos);
        cursorPos += key.sequence.length;
        activePrefix = "";
        matchIndex = -1;
        lastMatches = [];
        redraw();
      }
    };

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on("keypress", handleKeypress);

    process.stdout.write(opts.prompt);
    if (opts.placeholder && buffer === "") {
      process.stdout.write(`\x1b[2m${opts.placeholder}\x1b[0m`);
    }

    rl.on("close", () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", handleKeypress);
    });
  });
}
