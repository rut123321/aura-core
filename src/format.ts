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
