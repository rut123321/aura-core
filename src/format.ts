import pc from "picocolors";
import boxen from "boxen";
import Table from "cli-table3";

// ── Colors ─────────────────────────────────────────────────────────────
export const C = {
  dim: pc.dim,
  gray: pc.gray,
  white: pc.white,
  cyan: pc.cyan,
  magenta: pc.magenta,
  green: pc.green,
  yellow: pc.yellow,
  red: pc.red,
  bold: pc.bold,
  italic: pc.italic,
};

// ── Icons ──────────────────────────────────────────────────────────────
export const ICON = {
  check: pc.green("\u2713"),
  cross: pc.red("\u2717"),
  bullet: pc.cyan("\u25CF"),
  dot: pc.gray("\u00B7"),
  arrow: pc.cyan("\u25B6"),
  line: pc.gray("\u2503"),
  corner: pc.gray("\u2514"),
  dash: pc.gray("\u2500"),
  star: pc.yellow("\u2605"),
  warning: pc.yellow("\u26A0"),
  info: pc.cyan("\u2139"),
  diamond: pc.magenta("\u25C6"),
  heart: pc.red("\u2665"),
  pointer: pc.green("\u25B8"),
  cmd: pc.cyan("$"),
  build: pc.blue("\u2699"),
};

// ── Section header (boxed) ─────────────────────────────────────────────
export function section(title: string): string {
  return boxen("", {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 1, bottom: 0, left: 2, right: 0 },
    borderColor: "cyan",
    borderStyle: "round",
    title: C.bold(title),
    titleAlignment: "left",
    width: 50,
  }).split("\n")[0];
}

// ── Section header (inline) ────────────────────────────────────────────
export function sectionInline(title: string): string {
  return `  ${C.gray("\u25C6")} ${C.bold(title)}`;
}

// ── Pending action header ──────────────────────────────────────────────
export function pendingAction(text: string, detail?: string): string {
  const d = detail ? ` ${C.gray(detail)}` : "";
  return `  ${C.gray("\u25C6")} ${C.gray(text)}${d}`;
}

// ── Divider ────────────────────────────────────────────────────────────
export function divider(char: string = "\u2500", width: number = 50): string {
  return `  ${C.dim(char.repeat(width))}`;
}

// ── Box with title ─────────────────────────────────────────────────────
export function box(
  title: string,
  text: string = "",
  color: "cyan" | "green" | "yellow" | "red" | "magenta" | "blue" = "cyan",
): string {
  const content = text ? `  ${text.replace(/\n/g, "\n  ")}` : "";
  return boxen(content, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 1, bottom: 0, left: 2, right: 0 },
    borderColor: color,
    borderStyle: "round",
    title: C.bold(title),
    titleAlignment: "left",
  });
}

// ── Banner ──────────────────────────────────────────────────────────────
export function banner(): string {
  return boxen("", {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 1, bottom: 0, left: 2, right: 0 },
    borderColor: "cyan",
    borderStyle: "round",
    title: `${C.cyan(C.bold("AURA"))} ${C.magenta(C.bold("CORE"))}`,
    titleAlignment: "center",
  });
}

// ── Status dot ─────────────────────────────────────────────────────────
export function dot(
  color: "green" | "yellow" | "red" | "cyan" | "magenta" | "dim",
  label: string,
): string {
  const colors: Record<string, (s: string) => string> = {
    green: pc.green, yellow: pc.yellow, red: pc.red,
    cyan: pc.cyan, magenta: pc.magenta, dim: pc.dim,
  };
  return `  ${(colors[color] ?? pc.dim)("\u25CF")} ${C.gray(label)}`;
}

// ── Status line ────────────────────────────────────────────────────────
export function statusLine(parts: string[]): string {
  return `  ${parts.join(C.gray(" \u00B7 "))}`;
}

// ── Dim line ───────────────────────────────────────────────────────────
export function dimLine(text: string): string {
  return `  ${C.dim(text)}`;
}

// ── Success / Error / Warn / Info / Cancelled ──────────────────────────
export function success(text: string): string {
  return `  ${ICON.check} ${C.green(text)}`;
}

export function successLabel(label: string, detail?: string): string {
  const d = detail ? ` ${C.gray(detail)}` : "";
  return `  ${ICON.check} ${C.green(label)}${d}`;
}

export function error(text: string): string {
  return `  ${ICON.cross} ${C.red(text)}`;
}

export function errorLabel(label: string, detail?: string): string {
  const d = detail ? ` ${C.gray(detail)}` : "";
  return `  ${ICON.cross} ${C.red(label)}${d}`;
}

export function warn(text: string): string {
  return `  ${ICON.warning}  ${C.gray(text)}`;
}

export function warnLabel(label: string, detail?: string): string {
  const d = detail ? ` ${C.gray(detail)}` : "";
  return `  ${ICON.warning}  ${C.gray(label)}${d}`;
}

export function infoMsg(text: string): string {
  return `  ${ICON.info} ${C.gray(text)}`;
}

export function cancelled(): string {
  return `  ${C.gray("\u2298")} ${C.gray("Cancelled")}`;
}

// ── Conditional result ─────────────────────────────────────────────────
export function resultLine(ok: boolean, msg: string): string {
  return ok ? successLabel(msg) : errorLabel(msg);
}

// ── Usage / Empty state ────────────────────────────────────────────────
export function usage(text: string): string {
  return `  ${C.gray(`Usage: ${text}`)}`;
}

export function emptyState(text: string): string {
  return `  ${C.gray(text)}`;
}

// ── Label + value ──────────────────────────────────────────────────────
export function labelValue(label: string, value: string): string {
  return `  ${C.gray(`${label}:`)} ${C.white(value)}`;
}

// ── Goodbye ────────────────────────────────────────────────────────────
export function goodbye(): string {
  return C.gray("  goodbye");
}

// ── Timestamp ──────────────────────────────────────────────────────────
export function ts(): string {
  return C.gray(new Date().toLocaleTimeString());
}

// ── Model line ─────────────────────────────────────────────────────────
export function modelLine(label: string, id: string, color: (s: string) => string): string {
  return `  ${C.bold(color(label))} ${C.gray(id)}`;
}

// ── Instruction line ───────────────────────────────────────────────────
export function instructionLine(text: string): string {
  return `  ${C.gray(">")} ${C.white(text)}`;
}

// ── Run metric ─────────────────────────────────────────────────────────
export function runMetric(label: string, value: string): string {
  return `  ${C.gray(label)} ${C.gray(value)}`;
}

// ── Cost / Token formatting ────────────────────────────────────────────
export function fmtCost(cost: number): string {
  if (cost <= 0) return "";
  if (cost < 0.01) return `$${(cost).toFixed(6)}`;
  if (cost < 1) return `$${(cost).toFixed(4)}`;
  return `$${(cost).toFixed(2)}`;
}

export function fmtTokens(count: number): string {
  return count.toLocaleString("en-US");
}

export function usageSummary(tokens: number, cost: number): string {
  const parts = [`${fmtTokens(tokens)} tokens`];
  if (cost > 0) parts.push(fmtCost(cost));
  return parts.join(C.gray(" \u00B7 "));
}

// ── Progress / Context bar ─────────────────────────────────────────────
export function contextBar(tokens: number, maxTokens: number | null): string {
  if (!maxTokens || maxTokens <= 0) return "";
  const pct = Math.min(100, (tokens / maxTokens) * 100);
  const barLen = 10;
  const filled = Math.round((pct / 100) * barLen);
  const bar = pc.green("\u2588".repeat(filled)) + C.gray("\u2588".repeat(barLen - filled));
  return C.gray(`ctx ${bar} ${pct.toFixed(0)}%`);
}

// ── Reason badge ───────────────────────────────────────────────────────
export function reasonBadge(effort: string): string {
  if (effort === "off") return C.gray("off");
  const colors: Record<string, (s: string) => string> = {
    low: pc.green, medium: pc.yellow, high: pc.magenta, max: pc.red,
  };
  return (colors[effort] ?? C.gray)(effort);
}

// ── Table ──────────────────────────────────────────────────────────────
export function createTable(headers: string[], widths?: number[]): Table.Table {
  return new Table({
    style: { head: ["cyan"], border: ["gray"] },
    chars: {
      "top": "\u2500", "top-mid": "\u252C", "top-left": "\u250C", "top-right": "\u2510",
      "bottom": "\u2500", "bottom-mid": "\u2534", "bottom-left": "\u2514", "bottom-right": "\u2518",
      "left": "\u2502", "left-mid": "\u251C", "mid": "\u2500", "mid-mid": "\u253C",
      "right": "\u2502", "right-mid": "\u2524",
    },
    colWidths: widths,
    head: headers.map((h) => C.bold(h)),
  });
}

// ── Diff ───────────────────────────────────────────────────────────────
export function diffAdd(line: string): string {
  return `  ${pc.green(line)}`;
}

export function diffDel(line: string): string {
  return `  ${pc.red(line)}`;
}

export function diffContext(line: string): string {
  return `  ${C.gray(line)}`;
}

export function diffHunk(line: string): string {
  return `  ${pc.cyan(line)}`;
}

export function diffMore(n: number): string {
  return `  ${C.gray(`... ${n} more`)}`;
}

// ── File items ─────────────────────────────────────────────────────────
export function fileHeader(path: string): string {
  return `  ${C.gray("\u2503")} ${C.white(path)}`;
}

export function fileUnsaved(path: string): string {
  return `  ${pc.yellow("\u270E")} ${pc.yellow(path)}`;
}

export function fileStatusItem(status: string, path: string, color: (s: string) => string = pc.gray): string {
  return `  ${color(status)} ${path}`;
}

// ── Branches ───────────────────────────────────────────────────────────
export function branchCurrent(name: string): string {
  return `  ${pc.green("\u25CF")} ${pc.green(C.bold(name))} ${C.gray("(current)")}`;
}

export function branchOther(name: string): string {
  return `  ${C.gray("\u25CB")} ${C.white(name)}`;
}

// ── Shell commands ─────────────────────────────────────────────────────
export function shellCmdLine(cmd: string): string {
  return `  ${C.gray("$")} ${C.gray(cmd)}`;
}

export function shellExit(code: number): string {
  return `  ${C.gray(`exit ${code}`)}`;
}

// ── Previous messages ──────────────────────────────────────────────────
export function userMsg(text: string): string {
  return `  ${pc.cyan("\u25B6")} ${C.white(text)}`;
}

export function assistantMsg(text: string): string {
  return `  ${pc.green("\u25A0")} ${C.gray(text)}`;
}

// ── Greeting line ──────────────────────────────────────────────────────
export function greeting(): string {
  return `${divider()}\n${dot("green", "ready")}  ${C.dim("type your task or")} ${C.cyan("/")} ${C.dim("for commands")}`;
}

// ── Session info line ──────────────────────────────────────────────────
export function sessionLine(model: string, provider: string, workdir: string, effort?: string): string {
  const parts: string[] = [C.bold(model), C.gray(provider)];
  if (effort) parts.push(reasonBadge(effort));
  parts.push(C.gray(workdir));
  return statusLine(parts);
}

// ── Tool call / result lines (agent.ts) ────────────────────────────────
export function toolStart(name: string, label: string): string {
  return `   ${C.cyan(toolGlyph(name))} ${C.gray(label)}`;
}

export function toolOk(label: string, detail: string = ""): string {
  const d = detail ? C.gray(` (${detail})`) : "";
  return `   ${ICON.check} ${C.gray(label)}${d}`;
}

export function toolFail(label: string, err: string = ""): string {
  const lines = [`   ${ICON.cross} ${C.red(label)}`];
  if (err) lines.push(`     ${C.red(err.slice(0, 100))}`);
  return lines.join("\n");
}

function toolGlyph(name: string): string {
  const glyphs: Record<string, string> = {
    execute_shell: "\u2699",
    write_file: "\u270E",
    patch_file: "\u2711",
    view_file: "\u2630",
    list_files: "\u2261",
    search_files: "\u2315",
    glob: "\u204E",
    web_search: "\u2601",
    ask_user: "\u2753",
    read_file: "\u2630",
    rename: "\u2192",
  };
  return glyphs[name] ?? "\u25B8";
}

// ── Agent status ──────────────────────────────────────────────────────
export function thinking(effort: string): string {
  const colors: Record<string, (s: string) => string> = {
    low: pc.green, medium: pc.yellow, high: pc.magenta, max: pc.red, off: pc.gray,
  };
  const c = colors[effort] ?? pc.cyan;
  return `   ${c("\u25CB")} ${C.gray(`${effort} reasoning`)}`;
}

export function buildInfo(model: string, duration: number): string {
  return `   ${ICON.build} ${C.gray("Build")} ${C.gray("|")} ${C.gray(model)} ${C.gray("|")} ${C.gray(duration + "s")}`;
}

export function cmdRun(cmd: string): string {
  return `     ${ICON.cmd} ${C.gray(truncateMid(cmd, 70))}`;
}

export function cmdOk(cmd: string, exitCode: number): string {
  const icon = exitCode === 0 ? pc.green("$") : C.red("$");
  const color = exitCode === 0 ? C.gray : C.red;
  return `     ${icon} ${color(truncateMid(cmd, 50))} ${color(`exit ${exitCode}`)}`;
}

export function cmdFail(cmd: string): string {
  return `     ${C.red("$")} ${C.red(truncateMid(cmd, 50))}`;
}

function truncateMid(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.floor(max / 2)) + C.gray("...") + s.slice(-Math.floor(max / 2));
}

export function interrupted(): string {
  return `   ${pc.yellow("\u25CB")} ${C.gray("Interrupted")}`;
}

export function compacting(): string {
  return `   ${pc.yellow("\u25B3")} ${C.gray("Auto-compacting context...")}`;
}

export function compacted(prevLen: number): string {
  return `   ${ICON.check} ${C.gray(`Compacted (${prevLen} messages \u2192 1)`)}`;
}

export function healingLimit(attempts: number): string {
  return `   ${pc.yellow("\u25B3")} ${pc.yellow("Self-healing limit")} ${C.gray(`(${attempts} attempts)`)}`;
}

export function maxIterations(n: number): string {
  return `   ${pc.yellow("\u25B3")} ${pc.yellow(`Max iterations (${n})`)}`;
}

export function declined(): string {
  return `     ${C.red("\u2190")} ${C.red("Declined")}`;
}

export function blocked(reason: string): string {
  return `     ${C.red("$")} ${C.red("Blocked:")} ${C.red(reason)}`;
}

// ── Beautiful TUI helpers ───────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function gradient(text: string, fromHex: string, toHex: string): string {
  const c1 = hexToRgb(fromHex);
  const c2 = hexToRgb(toHex);
  const chars = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const t = chars.length === 1 ? 0 : i / (chars.length - 1);
    out.push(lerpColor(c1, c2, t) + chars[i] + "\x1b[39m");
  }
  return out.join("");
}

const AURA_ASCII = [
  "    ___         ___           ___      ",
  "   /   | __  __/   | __  __  /   |  ___",
  "  / /| |/ / / / /| |/ / / / / /| | / _ \\",
  " / ___ / /_/ / ___ / /_/ / ___ |/  __/",
  "/_/  |_\\__,_/_/  |_\\__, /_/  |_|\\___| ",
  "                    __/ /             ",
  "                   |___/              ",
];

export function auraBanner(version: string): string {
  const lines = AURA_ASCII.map((line, i) => {
    const t = i / (AURA_ASCII.length - 1);
    const r = Math.round(120 + (250 - 120) * t);
    const g = Math.round(180 + (140 - 180) * t);
    const b = Math.round(220 + (180 - 220) * t);
    return `\x1b[38;2;${r};${g};${b}m${line}\x1b[39m`;
  });
  const tagline = gradient("autonomous AI coding agent", "fab2a4", "5d9bdb");
  const ver = pc.dim(`v${version}`);
  return [
    ...lines,
    `  ${tagline}  ${ver}`,
    "",
  ].join("\n");
}

export interface CapabilityItem {
  icon: string;
  label: string;
  desc: string;
}

export function welcomeScreen(caps: CapabilityItem[]): string {
  const out: string[] = [];
  const title = gradient("Welcome to AURA", "fab2a4", "9d7cd8");
  out.push(`  ${title}`);
  out.push(`  ${pc.gray("\u2500".repeat(46))}`);
  out.push(`  ${pc.dim("What AURA can do for you:")}`);
  out.push("");
  for (const c of caps) {
    out.push(`  ${c.icon}  ${pc.white(pc.bold(c.label))}  ${pc.dim("\u2014")}  ${pc.gray(c.desc)}`);
  }
  out.push("");
  out.push(`  ${pc.gray("\u2500".repeat(46))}`);
  out.push(`  ${pc.dim("Type")} ${pc.cyan("your task")} ${pc.dim("to begin, or")} ${pc.cyan("/")} ${pc.dim("for commands, or")} ${pc.cyan("?")} ${pc.dim("for help")}`);
  return out.join("\n");
}

export function modeBadge(mode: string): string {
  if (mode === "plan") return `\x1b[48;2;157;124;216m\x1b[38;2;30;30;30m  PLAN  \x1b[39m\x1b[49m`;
  if (mode === "exec") return `\x1b[48;2;245;167;66m\x1b[38;2;30;30;30m  EXEC  \x1b[39m\x1b[49m`;
  return `\x1b[48;2;92;156;245m\x1b[38;2;30;30;30m  CHAT  \x1b[39m\x1b[49m`;
}

export function statusBadge(label: string, color: "green" | "yellow" | "red" | "blue" | "magenta" | "cyan"): string {
  const colors: Record<string, string> = {
    green: "127,216,143",
    yellow: "245,207,102",
    red: "224,108,117",
    blue: "92,156,245",
    magenta: "157,124,216",
    cyan: "86,182,194",
  };
  return `\x1b[48;2;${colors[color]}m\x1b[38;2;30;30;30m ${label} \x1b[39m\x1b[49m`;
}

export function bigDivider(width = 80): string {
  const left = "\u256D";
  const right = "\u256E";
  return pc.gray(`${left}${"\u2500".repeat(width)}${right}`);
}

export function sectionDivider(width = 80): string {
  return pc.gray(`\u2502${" ".repeat(width)}\u2502`);
}

export function kvLine(key: string, value: string, keyWidth = 12): string {
  return `  ${pc.dim(key.padEnd(keyWidth))} ${pc.white(value)}`;
}

export function infoBox(title: string, lines: string[]): string {
  const w = Math.max(title.length + 4, ...lines.map(l => l.length + 2));
  const top = pc.gray("\u256D" + "\u2500".repeat(w) + "\u256E");
  const mid = pc.gray("\u2502") + " " + pc.bold(title).padEnd(w - 1) + pc.gray("\u2502");
  const sep = pc.gray("\u251C" + "\u2500".repeat(w) + "\u2524");
  const bot = pc.gray("\u2570" + "\u2500".repeat(w) + "\u256F");
  const body = lines.map(l => pc.gray("\u2502") + " " + l.padEnd(w - 1) + pc.gray("\u2502"));
  return [top, mid, sep, ...body, bot].join("\n");
}

export function hint(text: string): string {
  return `  ${pc.cyan("\u203A")} ${pc.gray(text)}`;
}
