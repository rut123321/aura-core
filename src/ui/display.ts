import pc from "picocolors";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as TUI from "../tui";
import { C, divider, modeBadge, statusBadge, hint, reasonBadge, fmtTokens, fmtCost, fmtDate, pColor, pBadge, setScrollRegion, moveTo, getStatusBarHeight } from "./terminal";
import type { ModelInfo, Provider, ReasoningEffort } from "../types";
import { PROVIDERS } from "../types";
import { loadInitFile } from "../context";
import { detectProjectType, formatProjectInfo } from "../config";

const VERSION = "2.2.0";
const sessionStartTime = Date.now();

export function printBanner(): void {
  const lines = [
    "    \u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588   \u2588\u2588\u2588  \u2588\u2588\u2588   \u2588\u2588\u2588   \u2588\u2588\u2588   \u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588",
    "   \u2588\u2588     \u2588\u2588  \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588   \u2588\u2588 ",
    "   \u2588\u2588     \u2588\u2588\u2588\u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588  \u2588\u2588   \u2588\u2588 ",
    "   \u2588\u2588     \u2588\u2588 \u2588\u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588 \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588\u2588",
    "    \u2588\u2588\u2588\u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588  \u2588\u2588 \u2588\u2588   \u2588\u2588 ",
    "                                     \u2588\u2588  \u2588\u2588                  ",
    "                                     \u2588\u2588\u2588\u2588                    ",
  ];
  const gradBanner = TUI.gradLines(lines, "fab2a4", "5d9bdb");
  console.log(gradBanner);
  console.log(`  ${TUI.gradText("autonomous AI coding agent", "sunset")}  ${pc.dim("v" + VERSION)}`);
  console.log("");
}

export function printWelcome(): void {
  const caps: TUI.WelcomeItem[] = [
    { icon: TUI.pill("13+", [86, 182, 194]), title: "Multi-provider", desc: "Anthropic, OpenAI, Groq, DeepSeek, MiniMax, custom" },
    { icon: TUI.pill("PLAN", [147, 112, 219]), title: "Plan mode", desc: "Plan first, review, approve, then execute" },
    { icon: TUI.pill("FIX", [127, 216, 143]), title: "Self-healing", desc: "Auto-runs lint/typecheck after each edit" },
    { icon: TUI.pill("CTX", [245, 167, 66]), title: "Smart context", desc: "Prunes tool results, prompt caching" },
    { icon: TUI.pill("STREAM", [92, 156, 245]), title: "Streaming", desc: "Real-time output, cancel anytime (Ctrl+C)" },
    { icon: TUI.pill("GIT", [224, 108, 117]), title: "Git-aware", desc: "Auto-branch, commit, PR via gh" },
    { icon: TUI.pill("LSP", [157, 124, 216]), title: "LSP + MCP", desc: "TypeScript/Python/Go/Rust servers, MCP clients" },
    { icon: TUI.pill("AGENTS", [250, 178, 131]), title: "Custom agents", desc: "reviewer, tester, docs, refactorer" },
  ];
  console.log(TUI.welcome(caps, VERSION));
}

export function printReplHeader(): void {
  console.log("");
  console.log(`  ${pc.cyan("\u2728")} ${pc.bold("Ready")} ${pc.dim("\u2014")} ${pc.gray("type your task, or")} ${pc.cyan("/")} ${pc.gray("for commands")}`);
  console.log("");
  console.log(hint("type your task, / for commands, ? for help, \\\\plan for plan mode"));
  console.log("");
}

function helpRow(cmd: string, desc: string, w = 18): string {
  return `  ${pc.cyan(cmd.padEnd(w))} ${pc.dim("\u2502")} ${pc.gray(desc)}`;
}

function helpSection(title: string, icon: string, items: Array<[string, string]>): string[] {
  const out: string[] = [];
  const header = `  ${icon}  ${pc.bold(pc.white(title.toUpperCase()))}`;
  out.push("");
  out.push(header);
  out.push(`  ${TUI.divider("gradient", 60)}`);
  for (const [cmd, desc] of items) {
    out.push(helpRow(cmd, desc));
  }
  return out;
}

export function printHelp(): void {
  const lines: string[] = [];
  const title = TUI.gradText("AURA", "aura") + pc.dim(" \u2014 ") + pc.gray("command reference");
  lines.push("");
  lines.push(`  ${title}`);
  lines.push(`  ${TUI.divider("gradient", 60)}`);
  lines.push(`  ${pc.dim("Usage:")} ${pc.white("aura")} ${pc.gray("[options] [instruction]")}`);
  lines.push("");
  lines.push(`  ${pc.bold(pc.magenta("\u25CF"))}  ${pc.bold(pc.white("OPTIONS"))}`);
  lines.push(`  ${TUI.divider("gradient", 60)}`);
  const opts: Array<[string, string]> = [
    ["-p, --provider", `AI provider (${Object.values(PROVIDERS).map(p => p.label).join(", ")})`],
    ["-m, --model", "Model ID"],
    ["-r, --reasoning", "Reasoning: off \u00B7 low \u00B7 medium \u00B7 high \u00B7 max"],
    ["-y, --yes", "Auto-confirm all actions"],
    ["-l, --list-models", "List available models for provider"],
    ["-h, --help", "Show this help"],
    ["-v, --version", "Show version"],
  ];
  for (const [cmd, desc] of opts) lines.push(helpRow(cmd, desc));

  lines.push(...helpSection("Git & PR", pc.green("\u2387"), [
    ["/diff", "Show uncommitted changes"],
    ["/commit", "AI commit message + commit"],
    ["/undo [n]", "Revert last AI change(s)"],
    ["/log", "Recent commits"],
    ["/branch", "List/switch/create branches"],
    ["/changes", "Changed files summary"],
    ["/pr", "Create GitHub Pull Request"],
  ]));

  lines.push(...helpSection("Code Quality", pc.cyan("\u2728"), [
    ["/review", "AI review of changes"],
    ["/test", "Run tests (auto-detected)"],
    ["/lint", "Run linter (auto-detected)"],
    ["/explain <f>", "Explain code in a file"],
    ["/refactor", "AI refactoring suggestions"],
    ["/gen-test <f>", "Generate tests for a file"],
    ["/doc <f>", "Generate documentation"],
    ["/watch", "Auto-run tests on file changes"],
  ]));

  lines.push(...helpSection("Context & Memory", pc.magenta("\u25C6"), [
    ["/add <f>", "Add file to persistent context"],
    ["/drop <f>", "Remove file from context"],
    ["/context", "List context files"],
    ["/compact", "Compact conversation history"],
    ["/init", "Create AURA.md project context"],
    ["/memory", "Show/edit agent memory"],
    ["/config", "Edit .aurarc config"],
  ]));

  lines.push(...helpSection("Plan Mode", pc.yellow("\u25B3"), [
    ["/plan", "Toggle plan mode"],
    ["/plan-show, /ps", "Show current plan"],
    ["/plan-approve, /pa", "Approve & execute plan"],
    ["/plan-cancel, /pc", "Discard plan"],
    ["/mode", "Show TUI mode (chat/plan/exec)"],
    ["/agent", "Switch agent persona (reviewer/tester/docs/...)"],
  ]));

  lines.push(...helpSection("Sessions", pc.blue("\u25C6"), [
    ["/save [n]", "Save session"],
    ["/load [n]", "Load session"],
    ["/resume", "Pick a saved session"],
    ["/sessions", "List saved sessions"],
    ["/export", "Export to Markdown"],
  ]));

  lines.push(...helpSection("Provider & Model", pc.cyan("\u25CB"), [
    ["/provider", "Switch AI provider"],
    ["/model", "Change model"],
    ["/reasoning", "Set reasoning effort"],
    ["/cost", "Show session cost (with sparklines)"],
  ]));

  lines.push(...helpSection("Other", pc.gray("\u25CB"), [
    ["/search", "Web search"],
    ["/project", "Show detected project info"],
    ["/config", "Edit .aurarc config"],
    ["/mcp", "Show MCP servers"],
    ["/lsp", "Show LSP status"],
    ["/lang", "Switch language"],
    ["/plans", "Show Token Plans"],
  ]));

  lines.push("");
  lines.push(`  ${pc.bold(pc.magenta("\u25CF"))}  ${pc.bold(pc.white("BUILT-IN SHORTCUTS"))}`);
  lines.push(`  ${TUI.divider("gradient", 60)}`);
  const shortcuts: Array<[string, string]> = [
    ["@filename", "Inline file reference"],
    ["@general", "Spawn subagent for task"],
    ["!<command>", "Run shell command directly"],
    ["\\\\plan, \\\\p", "Toggle plan mode"],
    ["\\\\mode, \\\\m", "Cycle TUI mode"],
    ["model", "Show model info"],
    ["status", "Show session status"],
    ["clear", "Clear conversation"],
    ["help", "Show this help"],
    ["exit, :q", "Exit session"],
  ];
  for (const [cmd, desc] of shortcuts) lines.push(helpRow(cmd, desc));

  lines.push("");
  lines.push(`  ${pc.dim("Tip:")} ${pc.gray("Type")} ${pc.cyan("/")} ${pc.gray("at the prompt to open the command picker.")}`);
  lines.push("");
  console.log(lines.join("\n"));
}

export function printSessionInfo(workdir: string, model: ModelInfo, effort: ReasoningEffort): void {
  console.log();
  const c = pColor(model.provider);
  const line = `  ${c(C.bold(model.label))} ${pc.dim("\u00B7")} ${C.gray(PROVIDERS[model.provider].label)} ${pc.dim("\u00B7")} ${pc.gray(workdir)}`;
  console.log(line);
  if (model.contextLength) {
    console.log(`  ${C.dim("context:")} ${C.white(model.contextLength.toLocaleString() + " tokens")}`);
  }
  const initFile = loadInitFile(workdir);
  if (initFile) {
    console.log(`  ${C.dim("init:")} ${C.green("AURA.md loaded")}`);
  }
  const aurarcPath = join(workdir, ".aurarc");
  if (existsSync(aurarcPath)) {
    console.log(`  ${C.dim("config:")} ${C.green(".aurarc loaded")}`);
  }
  if (effort !== "off") {
    console.log(`  ${C.dim("reasoning:")} ${reasonBadge(effort)}`);
  }
  console.log();
}

export function printStatusBar(state: AgentState): void {
  const usage = state.agent.getTokenUsage();
  const ctxLen = state.config.contextLength;
  const totalTokens = usage.total;
  const cost = state.agent.getCost();
  const shortModel = state.modelInfo.label;
  const providerColor = pColor(state.modelInfo.provider);

  const tuiMode = state.agent.getTuiMode();
  const planMode = state.agent.isPlanMode();
  const historyLen = state.agent.getHistoryLength();
  const activeAgent = state.agent.getActiveAgent?.() ?? "default";

  const projectName = state.config.workingDirectory.split(/[\\/]/).filter(Boolean).pop() ?? ".";
  let gitBranch = "";
  try {
    const cp = require("node:child_process") as typeof import("node:child_process");
    gitBranch = cp.execSync("git rev-parse --abbrev-ref HEAD", { cwd: state.config.workingDirectory, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { /* not a git repo */ }
  const uptime = TUI.uptime((Date.now() - sessionStartTime) / 1000);

  const line1Left = [
    providerColor(C.bold(shortModel)),
    pc.dim("\u00B7"),
    pc.gray(PROVIDERS[state.config.provider].label),
    pc.dim("\u00B7"),
    pc.white(projectName),
  ];
  if (gitBranch) {
    line1Left.push(pc.dim("\u00B7"));
    line1Left.push(`\x1b[38;2;127;216;143m\u2387 ${gitBranch}\x1b[39m`);
  }
  if (state.config.reasoningEffort !== "off") line1Left.push(reasonBadge(state.config.reasoningEffort));
  const line1Right: string[] = [];
  if (uptime) line1Right.push(pc.dim(`\u23F1 ${uptime}`));
  if (historyLen > 0) line1Right.push(pc.dim(`${historyLen} msgs`));

  const width = (process.stdout.columns ?? 80) - 4;
  const leftStr = line1Left.join(" ");
  const rightStr = line1Right.join(" ");
  const padLen = Math.max(1, width - leftStr.length - rightStr.length - 4);
  const line1 = `  ${leftStr}${" ".repeat(padLen)}${rightStr}`;

  const tags: string[] = [modeBadge(tuiMode)];
  if (planMode) tags.push(statusBadge("PLANNING", "magenta"));
  if (state.config.autoConfirm) tags.push(statusBadge("AUTO", "green"));
  if (activeAgent !== "default") tags.push(TUI.pill(`\uD83E\uDD16 ${activeAgent}`, [157, 124, 216]));
  const line2 = `  ${tags.join(" ")}`;

  const line3Content: string[] = [];
  if (ctxLen && ctxLen > 0 && totalTokens > 0) {
    line3Content.push(TUI.tokenBar(usage.input, usage.output, ctxLen, Math.max(10, Math.min(30, width - 50))));
  } else {
    line3Content.push(TUI.tokenBar(usage.input, usage.output, Math.max(usage.input + usage.output, 1), 20));
  }
  if (cost.total > 0) line3Content.push(TUI.pill(`$${cost.total.toFixed(4)}`, [245, 207, 102]));
  const costHistory = state.agent.getCostHistory?.() ?? [];
  if (costHistory.length >= 2) {
    line3Content.push(pc.dim("trend:") + " " + TUI.costSparkline(costHistory.map(h => h.total), 16));
  }
  const line3 = `  ${line3Content.join(" " + pc.gray("\u2502") + " ")}`;

  if (!process.stdout.isTTY) {
    console.log(divider());
    console.log(line1);
    console.log(line2);
    console.log(line3);
    console.log(divider());
    return;
  }
  const height = process.stdout.rows ?? 24;
  setScrollRegion(1, height - getStatusBarHeight());
  for (let i = 0; i < getStatusBarHeight(); i++) {
    moveTo(height - getStatusBarHeight() + 1 + i, 1);
    process.stdout.write("\x1b[2K");
  }
  moveTo(height - getStatusBarHeight() + 1, 1);
  process.stdout.write(`${divider()}\n`);
  process.stdout.write(`${line1}\n`);
  process.stdout.write(`${line2}\n`);
  process.stdout.write(`${line3}\n`);
  process.stdout.write(`${divider()}\n`);
  process.stdout.write("\x1b[1A");
  moveTo(height - getStatusBarHeight(), 1);
}

export interface AgentState {
  agent: {
    getTokenUsage: () => { input: number; output: number; total: number };
    getCost: () => { input: number; output: number; total: number };
    isPlanMode: () => boolean;
    getHistoryLength: () => number;
    getTuiMode: () => "chat" | "plan" | "exec";
    getActiveAgent?: () => string;
    getCostHistory?: () => Array<{ total: number }>;
  };
  modelInfo: ModelInfo;
  config: {
    provider: Provider;
    reasoningEffort: ReasoningEffort;
    autoConfirm: boolean;
    workingDirectory: string;
    contextLength: number | null;
  };
}

export function printModelInfo(state: AgentState): void {
  const m = state.modelInfo;
  console.log();
  console.log(`  ${pc.dim("model:")}     ${pc.white(m.id)}`);
  console.log(`  ${pc.dim("label:")}     ${pColor(m.provider)(m.label)}`);
  console.log(`  ${pc.dim("provider:")}  ${PROVIDERS[m.provider].label}`);
  if (m.contextLength) {
    console.log(`  ${pc.dim("context:")}   ${m.contextLength.toLocaleString()} tokens`);
  }
  console.log(`  ${pc.dim("reasoning:")} ${state.config.reasoningEffort}`);
  if (state.config.autoConfirm) console.log(`  ${pc.dim("auto-confirm:")} ${pc.green("on")}`);
  console.log();
}

export function printStatus(state: AgentState): void {
  const usage = state.agent.getTokenUsage();
  const cost = state.agent.getCost();
  console.log();
  console.log(`  ${pc.dim("tokens:")}   in ${fmtTokens(usage.input)} / out ${fmtTokens(usage.output)} / total ${fmtTokens(usage.total)}`);
  console.log(`  ${pc.dim("cost:")}     $${cost.total.toFixed(6)}`);
  console.log(`  ${pc.dim("model:")}    ${state.modelInfo.id}`);
  console.log(`  ${pc.dim("history:")}  ${state.agent.getHistoryLength()} messages`);
  console.log();
}

export function printModelTable(models: ModelInfo[]): void {
  const Table = require("cli-table3") as typeof import("cli-table3");
  const t = new Table({ head: ["ID", "Label", "Context"] });
  for (const m of models) {
    t.push([m.id, m.label, m.contextLength?.toLocaleString() ?? "-"]);
  }
  console.log();
  console.log(t.toString());
  console.log();
}

export function printProjectInfo(): void {
  const info = detectProjectType(process.cwd());
  console.log();
  console.log(`  ${pc.gray("\u2503")} ${pc.bold("Project")}`);
  console.log(`  ${pc.gray("\u2503")} ${formatProjectInfo(info)}`.replace(/\n/g, `\n  ${pc.gray("\u2503")} `));
  console.log();
}

export async function handleTokenPlans(): Promise<void> {
  const { printTokenPlans, checkSubscriptionKey, getSetupInstructions } = await import("../tokenplan");
  const envKey = process.env["MINIMAX_API_KEY"];
  printTokenPlans();
  if (!envKey) {
    console.log(`  ${pc.yellow("\u26A0")}  ${pc.gray("MINIMAX_API_KEY not set")}`);
    console.log();
    console.log(`  ${pc.gray("Setup:")}`);
    for (const step of getSetupInstructions()) {
      console.log(`    ${pc.gray(step)}`);
    }
    console.log();
  } else {
    const check = await checkSubscriptionKey(envKey);
    const color = check.valid ? pc.green : pc.yellow;
    console.log(`  ${color("\u25CF")} ${pc.gray("API key:")} ${color(check.message)}`);
    console.log();
  }
}

export { fmtTokens, fmtCost, fmtDate, pBadge, pColor };
