import pc from "picocolors";
import type { Provider } from "../types";
import { C, divider, modeBadge, statusBadge, hint, reasonBadge, fmtTokens, fmtCost } from "../format";
export { C, divider, modeBadge, statusBadge, hint, reasonBadge, fmtTokens, fmtCost };

const PLACEHOLDERS = [
  "Fix a TODO in the codebase",
  "What is the tech stack?",
  "Fix broken tests",
  "Add input validation to auth.ts",
  "Explain the architecture",
  "Refactor utils for readability",
  "Implement a new feature",
  "Review last 10 commits",
  "Generate API docs",
  "Optimize slow queries",
];

let placeholderIdx = Math.floor(Math.random() * PLACEHOLDERS.length);

export function nextPlaceholder(): string {
  const p = PLACEHOLDERS[placeholderIdx];
  placeholderIdx = (placeholderIdx + 1) % PLACEHOLDERS.length;
  return p;
}

export function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
}

export function pColor(provider: Provider): (s: string) => string {
  const colors: Record<string, (s: string) => string> = {
    anthropic: (s) => `\x1b[38;2;224;159;191m${s}\x1b[39m`,
    openai: (s) => `\x1b[38;2;127;216;143m${s}\x1b[39m`,
    fireworks: (s) => `\x1b[38;2;250;140;180m${s}\x1b[39m`,
    groq: (s) => `\x1b[38;2;250;178;131m${s}\x1b[39m`,
    together: (s) => `\x1b[38;2;147;112;219m${s}\x1b[39m`,
    openrouter: (s) => `\x1b[38;2;92;156;245m${s}\x1b[39m`,
    deepseek: (s) => `\x1b[38;2;86;182;194m${s}\x1b[39m`,
    mistral: (s) => `\x1b[38;2;255;202;40m${s}\x1b[39m`,
    cerebras: (s) => `\x1b[38;2;255;105;180m${s}\x1b[39m`,
    "MiniMax": (s) => `\x1b[38;2;120;178;232m${s}\x1b[39m`,
    "openai-compatible": (s) => `\x1b[38;2;152;195;121m${s}\x1b[39m`,
    "anthropic-compatible": (s) => `\x1b[38;2;224;159;191m${s}\x1b[39m`,
  };
  return colors[provider] ?? ((s: string) => pc.cyan(s));
}

export function pBadge(provider: Provider): string {
  const c = pColor(provider);
  return c(`\u25C6 ${provider}`);
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

let statusBarHeight = 5;

export function getStatusBarHeight(): number { return statusBarHeight; }
export function setStatusBarHeight(h: number): void { statusBarHeight = h; }

export function setScrollRegion(top: number, bottom: number): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\x1b[${top};${bottom}r`);
}

export function moveTo(row: number, col: number): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\x1b[${row};${col}H`);
}

export function resetScrollRegion(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write("\x1b[r");
  process.stdout.write("\x1b[?25h");
}

export function infoBox(title: string, text: string, color: "cyan" | "green" | "yellow" | "red" | "magenta" | "blue" = "cyan"): string {
  const c = color === "cyan" ? pc.cyan : color === "green" ? pc.green : color === "yellow" ? pc.yellow : color === "red" ? pc.red : color === "magenta" ? pc.magenta : pc.blue;
  return c(`\u256D\u2500 ${title} \u2500\u256E\n\u2502 ${text} \u2502\n\u2570${"\u2500".repeat(title.length + 4)}\u256F`);
}
