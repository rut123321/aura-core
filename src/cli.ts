#!/usr/bin/env bun
import * as p from "@clack/prompts";
import pc from "picocolors";
import ora from "ora";
import Table from "cli-table3";
import { Agent } from "./agent";
import { selectModelInteractive } from "./models";
import {
  DEFAULT_CONFIG,
  PROVIDER_LIST,
  PROVIDERS,
  REASONING_LABELS,
} from "./types";
import type { AgentConfig, AskUserFn, ConfirmFn, ModelInfo, Provider, ReasoningEffort } from "./types";
import {
  C, box, contextBar, createTable,
  sectionInline, pendingAction, divider,
  successLabel, errorLabel, greeting, sessionLine,
  reasonBadge as fmtReasonBadge,
  auraBanner, welcomeScreen, modeBadge, statusBadge,
  kvLine, hint,
  type CapabilityItem,
} from "./format";

// @ts-ignore - intentional console.log override for Windows \r\n compat
console.log = function (...args: unknown[]) {
  process.stdout.write(args.map(a => typeof a === "string" ? a : String(a)).join(" ") + "\r\n");
};
// @ts-ignore
console.error = function (...args: unknown[]) {
  process.stderr.write(args.map(a => typeof a === "string" ? a : String(a)).join(" ") + "\r\n");
};
import {
  isGitRepo, getGitDiff, getGitDiffStat, gitCommit, gitUndo,
  gitLog, gitBranch, gitCheckout, gitCreateBranch, gitChangesSummary,
} from "./git";
import {
  saveSession, loadSession, listSessions, listSessionsDetailed, exportSessionMarkdown, getSessionDir,
  loadGlobalSettings, saveGlobalSettings, autoSaveSession,
} from "./session";
import type { GlobalSettings, SessionSummary } from "./session";

import {
  addContextFile, dropContextFile, getContextFiles, clearContextFiles,
  parseFileReferences, createInitFile, loadInitFile,
} from "./context";
import { loadConfig, detectProjectType, formatProjectInfo, createAurarcTemplate } from "./config";
import { runSubagent } from "./subagent";
import { createPullRequest, isGhInstalled, generatePrBody } from "./pr";
import { FileWatcher, type WatchEvent } from "./watcher";
import { webSearch } from "./diff";
import { addTodo, updateTodoStatus, removeTodo, clearTodos, printTodos } from "./todo";
import { printTokenPlans, checkSubscriptionKey, getSetupInstructions } from "./tokenplan";
import { promptWithAutocomplete } from "./autocomplete";
import { startMCPServers, getMCPServers, stopMCPServers } from "./mcp";
import { startLSP, getLSP, stopLSP } from "./lsp";
import { existsSync, readFileSync, writeFileSync, unlinkSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VERSION = "2.2.0";

function clearScreen(): void {
  process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
}

async function editorPrompt(initial: string): Promise<string | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || "notepad";
  const tmp = join(tmpdir(), ".aura-edit.txt");
  try {
    writeFileSync(tmp, initial + "\n", "utf-8");
    const cp = require("child_process");
    cp.execSync(`"${editor}" "${tmp}"`, { stdio: "inherit" });
    const content = readFileSync(tmp, "utf-8");
    unlinkSync(tmp);
    return content;
  } catch {
    return initial;
  }
}

function pColor(provider: Provider): (s: string) => string {
  return PROVIDERS[provider].color;
}

function pBadge(provider: Provider): string {
  const c = PROVIDERS[provider].color;
  return c(PROVIDERS[provider].label);
}

function infoBox(title: string, text: string, color: "cyan" | "green" | "yellow" | "red" | "magenta" | "blue" = "cyan"): string {
  return box(title, text, color);
}

function reasonBadge(effort: ReasoningEffort): string {
  return fmtReasonBadge(effort);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return "$0";
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString().slice(0, 5);
}

interface ParsedArgs {
  instruction: string;
  autoConfirm: boolean;
  model: string | null;
  provider: Provider | null;
  reasoning: ReasoningEffort | null;
  showHelp: boolean;
  showVersion: boolean;
  listModels: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let autoConfirm = false, model: string | null = null, provider: Provider | null = null;
  let reasoning: ReasoningEffort | null = null, showHelp = false, showVersion = false, listModels = false;
  const instr: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--yes" || a === "-y") autoConfirm = true;
    else if (a === "--model" || a === "-m") model = args[++i] ?? null;
    else if (a === "--provider" || a === "-p") {
      const v = args[++i];
      if (v && v in PROVIDERS) provider = v as Provider;
      else if (v) { console.error(pc.red(`Unknown provider: "${v}"`)); process.exit(1); }
    } else if (a === "--reasoning" || a === "-r") {
      const v = args[++i]?.toLowerCase();
      if (v && v in REASONING_LABELS) reasoning = v as ReasoningEffort;
      else if (v) { console.error(pc.red(`Unknown reasoning: "${v}". Use: off, low, medium, high, max`)); process.exit(1); }
    } else if (a === "--list-models" || a === "-l") listModels = true;
    else if (a === "--help" || a === "-h") showHelp = true;
    else if (a === "--version" || a === "-v") showVersion = true;
    else instr.push(a);
  }

  return { instruction: instr.join(" ").trim(), autoConfirm, model, provider, reasoning, showHelp, showVersion, listModels };
}

function printBanner(): void {
  console.log(auraBanner(VERSION));
}

function printWelcome(): void {
  const caps: CapabilityItem[] = [
    { icon: pc.cyan("\u2728"), label: "Multi-provider", desc: "13+ providers: Anthropic, OpenAI, Groq, DeepSeek, MiniMax" },
    { icon: pc.green("\u26A1"), label: "Plan mode", desc: "Plan before execute, review diffs, approve steps" },
    { icon: pc.magenta("\u25C6"), label: "Self-healing", desc: "Auto-fixes lint/typecheck after each edit" },
    { icon: pc.yellow("\u2605"), label: "Smart context", desc: "Prunes old tool results, summarizes when full" },
    { icon: pc.cyan("\u25CB"), label: "Streaming", desc: "Real-time token output, cancel anytime" },
    { icon: pc.green("\u2713"), label: "Git-aware", desc: "Auto-branch, commit, PR with gh integration" },
    { icon: pc.gray("\u25CB"), label: "Sessions", desc: "Save/load/auto-tag with git branch info" },
    { icon: pc.cyan("$"), label: "Cost tracking", desc: "Sparklines, $/1M tokens, history" },
  ];
  console.log(welcomeScreen(caps));
}

function helpRow(cmd: string, desc: string, w = 18): string {
  return `  ${pc.cyan(cmd.padEnd(w))} ${pc.dim("\u2502")} ${pc.gray(desc)}`;
}

function helpSection(title: string, icon: string, items: Array<[string, string]>): string[] {
  const out: string[] = [];
  const header = `  ${icon}  ${pc.bold(pc.white(title.toUpperCase()))}`;
  out.push("");
  out.push(header);
  out.push(`  ${pc.gray("\u2500".repeat(60))}`);
  for (const [cmd, desc] of items) {
    out.push(helpRow(cmd, desc));
  }
  return out;
}

function printHelp(): void {
  const lines: string[] = [];
  const title = pc.cyan(pc.bold("AURA")) + pc.dim(" \u2014 ") + pc.gray("command reference");
  lines.push("");
  lines.push(`  ${title}`);
  lines.push(`  ${pc.gray("\u2500".repeat(60))}`);
  lines.push(`  ${pc.dim("Usage:")} ${pc.white("aura")} ${pc.gray("[options] [instruction]")}`);
  lines.push("");
  lines.push(`  ${pc.bold(pc.magenta("\u25CF"))}  ${pc.bold(pc.white("OPTIONS"))}`);
  lines.push(`  ${pc.gray("\u2500".repeat(60))}`);
  const opts: Array<[string, string]> = [
    ["-p, --provider", `AI provider (${PROVIDER_LIST.map(p => PROVIDERS[p].label).join(", ")})`],
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
    ["/plans", "Show Token Plans"],
  ]));

  lines.push("");
  lines.push(`  ${pc.bold(pc.magenta("\u25CF"))}  ${pc.bold(pc.white("BUILT-IN SHORTCUTS"))}`);
  lines.push(`  ${pc.gray("\u2500".repeat(60))}`);
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

function printSessionInfo(workdir: string, model: ModelInfo, effort: ReasoningEffort): void {
  const c = pColor(model.provider);
  console.log();
  const line = sessionLine(c(model.label), PROVIDERS[model.provider].label, workdir, effort === "off" ? undefined : effort);
  console.log(line);
  const infoLines: string[] = [];
  if (model.contextLength) infoLines.push(kvLine("context:", model.contextLength.toLocaleString() + " tokens"));
  const initFile = loadInitFile(workdir);
  if (initFile) infoLines.push(kvLine("init:", "AURA.md loaded"));
  const aurarcPath = join(workdir, ".aurarc");
  if (existsSync(aurarcPath)) infoLines.push(kvLine("config:", ".aurarc loaded"));
  if (infoLines.length > 0) {
    for (const l of infoLines) console.log(l);
  } else {
    console.log(`  ${hint("Tip: run /init to generate AURA.md + .aurarc")}`);
  }
  console.log();
}

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

function nextPlaceholder(): string {
  const p = PLACEHOLDERS[placeholderIdx];
  placeholderIdx = (placeholderIdx + 1) % PLACEHOLDERS.length;
  return p;
}

function formatMsgPreview(content: unknown, maxLen: number = 120): string {
  if (typeof content === "string") {
    return content.replace(/\n/g, " ").slice(0, maxLen);
  }
  if (Array.isArray(content)) {
    const textBlocks = content.filter((b: Record<string, unknown>) => b.type === "text");
    if (textBlocks.length > 0) return (textBlocks[0].text as string).replace(/\n/g, " ").slice(0, maxLen);
    const toolBlocks = content.filter((b: Record<string, unknown>) => b.type === "tool_use");
    if (toolBlocks.length > 0) return `[tool: ${toolBlocks.length} calls]`;
  }
  return "";
}

function printPreviousConversation(conv: unknown[]): void {
  const msgs = conv as Array<{ role: string; content: unknown }>;
  const toShow = msgs.filter(m => m.role === "user" || m.role === "assistant").slice(-6);
  if (toShow.length === 0) return;
  console.log(`  ${pc.gray("─".repeat(40))}`);
  for (const m of toShow) {
    if (m.role === "user") {
      console.log(`  ${pc.cyan("\u25B6")} ${pc.white(formatMsgPreview(m.content))}`);
    } else {
      const preview = formatMsgPreview(m.content);
      if (preview) console.log(`  ${pc.green("\u25A0")} ${pc.gray(preview)}`);
    }
  }
  console.log(`  ${pc.gray("─".repeat(40))}`);
  console.log();
}

function printReplHeader(): void {
  console.log(greeting());
  console.log();
  console.log(hint("type your task, / for commands, ? for help, \\\\plan for plan mode"));
  console.log();
}

let statusBarHeight = 5;

function setScrollRegion(top: number, bottom: number): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\x1b[${top};${bottom}r`);
}

function moveTo(row: number, col: number): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\x1b[${row};${col}H`);
}

function printStatusBar(state: ReplState): void {
  const usage = state.agent.getTokenUsage();
  const ctxLen = state.config.contextLength;
  const totalTokens = usage.total;
  const cost = state.agent.getCost();
  const shortModel = state.modelInfo.label;
  const providerColor = pColor(state.modelInfo.provider);

  const tuiMode = state.agent.getTuiMode();
  const planMode = state.agent.isPlanMode();
  const historyLen = state.agent.getHistoryLength();

  const leftParts: string[] = [
    providerColor(C.bold(shortModel)),
    C.gray(PROVIDERS[state.config.provider].label),
  ];
  if (state.config.reasoningEffort !== "off") leftParts.push(fmtReasonBadge(state.config.reasoningEffort));

  const rightParts: string[] = [];
  if (ctxLen && ctxLen > 0 && totalTokens > 0) rightParts.push(contextBar(totalTokens, ctxLen));
  if (cost.total > 0) rightParts.push(statusBadge(`$${cost.total.toFixed(4)}`, "yellow"));
  if (historyLen > 0) rightParts.push(statusBadge(`${historyLen}m`, "cyan"));

  const leftStr = leftParts.join(" ");
  const rightStr = rightParts.join(" ");
  const width = (process.stdout.columns ?? 80) - 4;
  const padLen = Math.max(1, width - leftStr.length - rightStr.length - 4);
  const line1 = `  ${leftStr}${" ".repeat(padLen)}${rightStr}`;

  const tags: string[] = [modeBadge(tuiMode)];
  if (planMode) tags.push(statusBadge("PLANNING", "magenta"));
  if (state.config.autoConfirm) tags.push(statusBadge("AUTO", "green"));
  const line2 = `  ${tags.join(" ")}`;

  const totalTokensLabel = ctxLen ? `${totalTokens.toLocaleString()} / ${ctxLen.toLocaleString()}` : totalTokens.toLocaleString();
  const hintParts: string[] = [
    C.dim(`tokens: ${totalTokensLabel}`),
    C.dim(`in: ${usage.input.toLocaleString()}`),
    C.dim(`out: ${usage.output.toLocaleString()}`),
  ];
  if (ctxLen && ctxLen > 0) {
    const pct = Math.min(100, Math.round((totalTokens / ctxLen) * 100));
    hintParts.push(C.dim(`ctx: ${pct}%`));
  }
  const line3 = `  ${hintParts.join(" " + pc.gray("\u2502") + " ")}`;

  if (!process.stdout.isTTY) {
    console.log(divider());
    console.log(line1);
    console.log(line2);
    console.log(line3);
    console.log(divider());
    return;
  }
  const height = process.stdout.rows ?? 24;
  setScrollRegion(1, height - statusBarHeight);
  for (let i = 0; i < statusBarHeight; i++) {
    moveTo(height - statusBarHeight + 1 + i, 1);
    process.stdout.write("\x1b[2K");
  }
  moveTo(height - statusBarHeight + 1, 1);
  process.stdout.write(`${divider()}\n`);
  process.stdout.write(`${line1}\n`);
  process.stdout.write(`${line2}\n`);
  process.stdout.write(`${line3}\n`);
  process.stdout.write(`${divider()}\n`);
  process.stdout.write("\x1b[1A");
  moveTo(height - statusBarHeight, 1);
}

function createConfirmFn(autoConfirm: boolean): ConfirmFn {
  if (autoConfirm) return async () => true;
  return async (message: string) => {
    const r = await p.confirm({ message: `${pc.yellow("⚠")}  ${pc.white(message)}`, initialValue: false });
    if (p.isCancel(r)) return false;
    return r as boolean;
  };
}

function createAskUserFn(): AskUserFn {
  return async (question: string, options?: string[]) => {
    if (options && options.length > 0) {
      const opts: Array<{ value: string; label: string }> = options.map(o => ({ value: o, label: o }));
      opts.push({ value: "__custom__", label: pc.italic("Type custom answer...") });
      const r = await p.select({
        message: pc.cyan("?") + "  " + pc.white(question),
        options: opts,
      });
      if (p.isCancel(r)) return "";
      if (r === "__custom__") {
        const custom = await p.text({
          message: pc.cyan("?") + "  " + pc.white(question),
          placeholder: "Type your answer...",
        });
        if (p.isCancel(custom)) return "";
        return (custom as string).trim();
      }
      return r as string;
    }
    const answer = await p.text({
      message: pc.cyan("?") + "  " + pc.white(question),
      placeholder: "Type your answer...",
    });
    if (p.isCancel(answer)) return "";
    return (answer as string).trim();
  };
}

function getApiKeyFromEnv(provider: Provider): string | null {
  for (const ev of PROVIDERS[provider].apiKeyEnv) {
    const v = process.env[ev];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

async function getApiKeyForProvider(provider: Provider, globalSettings?: GlobalSettings): Promise<string | null> {
  const envKey = getApiKeyFromEnv(provider);
  if (envKey) return envKey;
  if (globalSettings?.lastApiKey && globalSettings?.lastApiKeyProvider === provider) {
    return globalSettings.lastApiKey;
  }
  const envVar = PROVIDERS[provider].apiKeyEnv[0];
  console.log(`  ${pc.yellow("⚠")}  ${pc.gray(envVar)} ${pc.yellow("not found")}\n`);
  const input = await p.text({
    message: `Enter ${pBadge(provider)} API key`,
    placeholder: "...",
    validate: (v) => { if (!v?.trim()) return "Required"; return undefined; },
  });
  if (p.isCancel(input)) return null;
  return (input as string).trim();
}

async function selectProvider(): Promise<Provider | null> {
  const options = PROVIDER_LIST.map((prov) => ({
    value: prov,
    label: PROVIDERS[prov].color(PROVIDERS[prov].label),
    hint: PROVIDERS[prov].description,
  }));
  const r = await p.select({ message: "Select AI provider:", options });
  if (p.isCancel(r)) return null;
  return r as Provider;
}

async function selectReasoning(provider: Provider): Promise<ReasoningEffort | null> {
  if (!PROVIDERS[provider].supportsReasoning) return "off";
  const options: Array<{ value: ReasoningEffort; label: string; hint: string }> = [
    { value: "off", label: pc.gray("Off"), hint: "No reasoning — faster" },
    { value: "low", label: pc.green("Low"), hint: "Quick thinking" },
    { value: "medium", label: pc.yellow("Medium"), hint: "Balanced" },
    { value: "high", label: pc.magenta("High"), hint: "Deep reasoning" },
    { value: "max", label: pc.red("Max"), hint: "Maximum effort" },
  ];
  const r = await p.select({ message: "Reasoning effort:", options });
  if (p.isCancel(r)) return null;
  return r as ReasoningEffort;
}

function buildConfig(
  provider: Provider, apiKey: string, modelId: string,
  autoConfirm: boolean, workdir: string, reasoning: ReasoningEffort,
  contextLength: number | null, baseURLOverride?: string,
): AgentConfig {
  return {
    provider, providerType: PROVIDERS[provider].type, apiKey,
    baseURL: baseURLOverride ?? PROVIDERS[provider].baseURL,
    model: modelId,
    maxTokens: DEFAULT_CONFIG.maxTokens as number,
    maxSelfHealingAttempts: DEFAULT_CONFIG.maxSelfHealingAttempts as number,
    autoConfirm, workingDirectory: workdir, reasoningEffort: reasoning, contextLength,
  };
}

function isCustomProvider(provider: Provider): boolean {
  return provider === "openai-compatible" || provider === "anthropic-compatible";
}

interface ReplState {
  agent: Agent;
  modelInfo: ModelInfo;
  config: AgentConfig;
  confirmFn: ConfirmFn;
  askUserFn: AskUserFn;
}

async function handleProviderSwitch(state: ReplState, workdir: string): Promise<void> {
  autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);
  const newProvider = await selectProvider();
  if (!newProvider) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
  const apiKey = await getApiKeyForProvider(newProvider);
  if (!apiKey) { console.log(`\n  ${pc.red("✗")} ${pc.red("No API key")}\n`); return; }

  let modelInfo: ModelInfo | null;
  let customBaseURL: string | undefined;

  if (isCustomProvider(newProvider)) {
    const baseURLInput = await p.text({
      message: `${pBadge(newProvider)} Enter API base URL`,
      placeholder: "https://api.example.com/v1",
      validate: (v) => { if (!v?.trim()) return "Required"; if (!v?.startsWith("http")) return "Must start with http:// or https://"; return undefined; },
    });
    if (p.isCancel(baseURLInput)) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
    customBaseURL = (baseURLInput as string).trim().replace(/\/$/, "");
    const modelName = await p.text({
      message: `${pBadge(newProvider)} Enter model name`,
      placeholder: "gpt-4o",
      validate: (v) => { if (!v?.trim()) return "Required"; return undefined; },
    });
    if (p.isCancel(modelName)) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
    modelInfo = { id: (modelName as string).trim(), label: (modelName as string).trim(), description: `Custom model for ${PROVIDERS[newProvider].label}`, contextLength: null, supportsTools: true, supportsVision: false, supportsReasoning: PROVIDERS[newProvider].supportsReasoning, provider: newProvider };
  } else {
    modelInfo = await selectModelInteractive(newProvider, apiKey);
    if (!modelInfo) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
  }

  let reasoning: ReasoningEffort = "off";
  if (PROVIDERS[newProvider].supportsReasoning) {
    const r = await selectReasoning(newProvider);
    if (r) reasoning = r;
  }
  const prevHistory = state.agent.getConversation();
  const config = buildConfig(newProvider, apiKey, modelInfo.id, state.config.autoConfirm, workdir, reasoning, modelInfo.contextLength, customBaseURL);
  const newAgent = new Agent(config, state.confirmFn, state.askUserFn);
  newAgent.setConversation(prevHistory);
  state.agent = newAgent; state.modelInfo = modelInfo; state.config = config;
  clearScreen(); printBanner(); printSessionInfo(workdir, modelInfo, reasoning); printReplHeader();
}

async function handleModelSwitch(state: ReplState, workdir: string): Promise<void> {
  autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);

  let modelInfo: ModelInfo | null;

  if (isCustomProvider(state.config.provider)) {
    const modelName = await p.text({
      message: `${pBadge(state.config.provider)} Enter model name`,
      placeholder: "gpt-4o",
      validate: (v) => { if (!v?.trim()) return "Required"; return undefined; },
    });
    if (p.isCancel(modelName)) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
    modelInfo = { id: (modelName as string).trim(), label: (modelName as string).trim(), description: `Custom model for ${PROVIDERS[state.config.provider].label}`, contextLength: null, supportsTools: true, supportsVision: false, supportsReasoning: PROVIDERS[state.config.provider].supportsReasoning, provider: state.config.provider };
  } else {
    modelInfo = await selectModelInteractive(state.config.provider, state.config.apiKey);
    if (!modelInfo) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
  }

  const prevHistory = state.agent.getConversation();
  const config = buildConfig(state.config.provider, state.config.apiKey, modelInfo.id, state.config.autoConfirm, workdir, state.config.reasoningEffort, modelInfo.contextLength);
  const newAgent = new Agent(config, state.confirmFn, state.askUserFn);
  newAgent.setConversation(prevHistory);
  state.agent = newAgent; state.modelInfo = modelInfo; state.config = config;
  clearScreen(); printBanner(); printSessionInfo(workdir, modelInfo, state.config.reasoningEffort); printReplHeader();
}

async function handleReasoningSwitch(state: ReplState): Promise<void> {
  if (!PROVIDERS[state.config.provider].supportsReasoning) {
    console.log(`\n  ${pc.yellow("⚠")}  ${pc.gray(`${PROVIDERS[state.config.provider].label} doesn't support reasoning`)}\n`);
    return;
  }
  const effort = await selectReasoning(state.config.provider);
  if (!effort) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
  state.config.reasoningEffort = effort;
  const newAgent = new Agent(state.config, state.confirmFn, state.askUserFn);
  newAgent.setConversation(state.agent.getConversation());
  state.agent = newAgent;
  console.log(`\n  ${pc.green("✓")} ${pc.green("Reasoning")} ${reasonBadge(effort)}\n`);
}

function printModelInfo(state: ReplState): void {
  const model = state.modelInfo;
  const c = pColor(model.provider);
  const usage = state.agent.getTokenUsage();
  const ctxLen = state.config.contextLength;
  const t = createTable(["Property", "Value"], [16, 50]);
  t.push([C.bold("Property"), C.bold("Value")]);
  t.push(["Model", c(model.label)]);
  t.push(["ID", C.gray(model.id)]);
  if (ctxLen) t.push(["Context", fmtTokens(ctxLen) + " tokens"]);
  t.push(["Tools", model.supportsTools ? successLabel("yes") : errorLabel("no")]);
  t.push(["Vision", model.supportsVision ? successLabel("yes") : errorLabel("no")]);
  t.push(["Reasoning", model.supportsReasoning ? successLabel("yes") : errorLabel("no") + " (" + reasonBadge(state.config.reasoningEffort) + ")"]);
  if (usage.total > 0) t.push(["Tokens used", fmtTokens(usage.total)]);
  console.log();
  console.log(sectionInline("Model"));
  console.log(t.toString());
}

function printStatus(state: ReplState): void {
  const usage = state.agent.getTokenUsage();
  const cost = state.agent.getCost();
  const ctxFiles = getContextFiles();
  const modifiedFiles = state.agent.getModifiedFiles();
  const t = createTable(["Property", "Value"], [16, 60]);
  t.push([C.bold("Property"), C.bold("Value")]);
  t.push(["Model", pColor(state.modelInfo.provider)(state.modelInfo.label)]);
  t.push(["Provider", C.gray(PROVIDERS[state.config.provider].label)]);
  t.push(["Reasoning", reasonBadge(state.config.reasoningEffort)]);
  t.push(["History", String(state.agent.getHistoryLength()) + " messages"]);
  t.push(["Tokens", fmtTokens(usage.total)]);
  if (cost.total > 0) t.push(["Cost", fmtCost(cost.total)]);
  if (ctxFiles.length > 0) t.push(["Context files", ctxFiles.map(f => f.path).join(", ")]);
  if (modifiedFiles.length > 0) t.push(["Modified", String(modifiedFiles.length) + " files"]);
  t.push(["Directory", C.gray(process.cwd())]);
  console.log();
  console.log(sectionInline("Session"));
  console.log(t.toString());
}

const SPARK_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
function sparkline(values: number[], width = 10): string {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  if (max === 0) return SPARK_BLOCKS[0].repeat(width);
  const bucket: number[] = [];
  for (let i = 0; i < width; i++) {
    const idx = Math.floor((i / width) * values.length);
    bucket.push(values[Math.min(idx, values.length - 1)]);
  }
  return bucket.map(v => SPARK_BLOCKS[Math.min(7, Math.floor((v / max) * 7))]).join("");
}

function printCost(state: ReplState): void {
  const cost = state.agent.getCost();
  const usage = state.agent.getTokenUsage();
  const t = createTable(["Tokens", "Count"], [14, 16]);
  t.push([C.bold("Tokens"), C.bold("Count")]);
  t.push(["Input", fmtTokens(usage.input)]);
  t.push(["Output", fmtTokens(usage.output)]);
  t.push([C.bold("Total"), C.bold(fmtTokens(usage.total))]);
  if (cost.total > 0) {
    t.push([C.bold("Cost"), C.bold("")]);
    t.push(["Input $", fmtCost(cost.input)]);
    t.push(["Output $", fmtCost(cost.output)]);
    t.push([C.green("Total $"), C.green(fmtCost(cost.total))]);
  }
  console.log();
  console.log(sectionInline("Cost"));
  console.log(t.toString());
  const ratio = usage.total > 0 ? (cost.total / usage.total * 1_000_000) : 0;
  const spark = sparkline([usage.input, usage.output, Math.max(1, Math.floor(usage.total * 0.1))], 8);
  console.log(`  ${C.dim("in/out ratio:")} ${C.white(`1:${usage.output > 0 ? (usage.input / usage.output).toFixed(1) : "?"}`)}  ${C.dim("per 1M tok:")} ${C.white(`$${ratio.toFixed(2)}`)}  ${C.dim("trend:")} ${pc.cyan(spark)}`);
  const history = state.agent.getCostHistory?.() ?? [];
  if (history.length >= 2) {
    const sparkCost = sparkline(history.map(h => h.total), 16);
    console.log(`  ${C.dim("cost history:")} ${pc.green(sparkCost)}  ${C.dim("avg:")} ${C.white("$" + fmtCost(history.reduce((a, b) => a + b.total, 0) / history.length))}`);
  }
}

async function handleDiff(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const aiModified = state.agent.getModifiedFiles();

  if (aiModified.length > 0) {
    console.log();
    console.log(`  ${pc.gray("AI Changes")} ${pc.gray(`(${aiModified.length} files)`)}`);
    console.log();
    for (const f of aiModified) {
      const backup = state.agent.getBackupContent(f);
      const currentContent = existsSync(join(workdir, f)) ? readFileSync(join(workdir, f), "utf-8") : "";
      if (backup) {
        const { generateUnifiedDiff } = await import("./tools");
        const diff = generateUnifiedDiff(backup, currentContent, f);
        if (diff) {
          console.log(`  ${pc.gray("\u2503")} ${pc.white(f)}`);
          for (const line of diff.split("\n").slice(0, 30)) {
            if (line.startsWith("+")) console.log(`  ${pc.green(line)}`);
            else if (line.startsWith("-")) console.log(`  ${pc.red(line)}`);
            else console.log(`  ${pc.gray(line)}`);
          }
          if (diff.split("\n").length > 30) {
            console.log(`  ${pc.gray(`... ${diff.split("\n").length - 30} more`)}`);
          }
          console.log();
        }
      } else {
        console.log(`  ${pc.yellow("\u270E")} ${f}`);
      }
    }
  }

  const isRepo = await isGitRepo(workdir);
  if (isRepo) {
    const stat = await getGitDiffStat(workdir);
    const diff = await getGitDiff(workdir);
    console.log();
    console.log(`  ${pc.gray("Git Diff")}`);
    console.log();
    if (stat.trim() && stat !== "No uncommitted changes.") {
      console.log(`  ${pc.gray(stat.trim())}`);
      console.log();
      const diffLines = diff.split("\n").slice(0, 100);
      for (const line of diffLines) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          console.log(`  ${pc.green(line)}`);
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          console.log(`  ${pc.red(line)}`);
        } else if (line.startsWith("@@")) {
          console.log(`  ${pc.cyan(line)}`);
        } else {
          console.log(`  ${pc.gray(line)}`);
        }
      }
      if (diff.split("\n").length > 100) {
        console.log(`  ${pc.gray(`... ${diff.split("\n").length - 100} more`)}`);
      }
    } else if (aiModified.length === 0) {
      console.log(`  ${pc.gray("No changes.")}`);
    }
  } else if (aiModified.length === 0) {
    console.log(`\n  ${pc.gray("No changes.")}\n`);
  }
  console.log();
}

async function handleCommit(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const isRepo = await isGitRepo(workdir);
  if (!isRepo) {
    console.log(`\n  ${pc.red("\u2717")} ${pc.red("Not a git repo.")}\n`);
    return;
  }
  const changes = await gitChangesSummary(workdir);
  if (changes.total === 0) {
    console.log(`\n  ${pc.gray("Nothing to commit.")}\n`);
    return;
  }
  console.log();
  console.log(`  ${pc.gray("Changes:")} ${pc.gray(String(changes.total))} ${pc.gray(`(${changes.added}A ${changes.modified}M ${changes.deleted}D ${changes.untracked}?)`)}`);
  for (const f of changes.files.slice(0, 10)) {
    const color = f.status === "??" ? pc.yellow : f.status.includes("D") ? pc.red : f.status.includes("A") ? pc.green : pc.white;
    console.log(`  ${color(f.status.padEnd(2))} ${f.file}`);
  }
  if (changes.files.length > 10) {
    console.log(`  ${pc.gray(`... ${changes.files.length - 10} more`)}`);
  }
  console.log();

  const styleSel = await p.select({
    message: "Commit style:",
    options: [
      { value: "default", label: pc.gray("Default"), hint: "Plain message" },
      { value: "conventional", label: pc.cyan("Conventional"), hint: "feat: / fix: / docs: ..." },
      { value: "emoji", label: pc.magenta("Emoji"), hint: "\u2728 feat: / \uD83D\uDC1B fix: ..." },
    ],
  });
  if (p.isCancel(styleSel)) { console.log(`\n  ${pc.gray("cancelled")}\n`); return; }
  const style = styleSel as string;

  const msgInput = await p.text({
    message: "Commit message:",
    placeholder: "AI will generate if left empty...",
  });
  if (p.isCancel(msgInput)) { console.log(`\n  ${pc.gray("cancelled")}\n`); return; }

  let message = (msgInput as string).trim();
  if (!message) {
    console.log(`  ${pc.gray("Generating commit message...")}`);
    let prompt: string;
    if (style === "conventional") {
      prompt = `Generate a conventional commit message for these changes. Use format: type(scope): description. Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert. Reply with ONLY the commit message:\n\n${changes.files.map(f => `${f.status} ${f.file}`).join("\n")}`;
    } else if (style === "emoji") {
      prompt = `Generate an emoji conventional commit message. Use format: <emoji> type: description. Emojis: \u2728 feat, \uD83D\uDC1B fix, \uD83D\uDCDD docs, \u267B\uFE0F refactor, \u2705 test, \uD83D\uDD27 chore, \u26A1 perf. Reply with ONLY the commit message:\n\n${changes.files.map(f => `${f.status} ${f.file}`).join("\n")}`;
    } else {
      prompt = `Generate a concise commit message for these changes. Reply with ONLY the commit message:\n\n${changes.files.map(f => `${f.status} ${f.file}`).join("\n")}`;
    }
    await state.agent.run(prompt);
    const conv = state.agent.getConversation();
    const lastAssistant = [...conv].reverse().find(m => m.role === "assistant");
    if (lastAssistant) {
      if (typeof lastAssistant.content === "string") {
        message = lastAssistant.content.trim();
      } else {
        const tb = (lastAssistant.content as unknown as Array<Record<string, unknown>>).find(b => b.type === "text") as { text: string } | undefined;
        if (tb) message = tb.text.trim();
      }
    }
    if (!message) message = "Update files";
    console.log(`  ${pc.gray("AI:")} ${pc.white(message)}`);
  }

  const result = await gitCommit(message, workdir);
  if (result.success) {
    console.log(`\n  ${pc.green("\u2713")} ${pc.gray("committed:")} ${pc.white(message)}`);
    // auto-update MEMORY.md
    const memoryPath = join(workdir, "MEMORY.md");
    const now = new Date().toISOString().slice(0, 10);
    const entry = `\n## ${now} — ${message}\n\nFiles: ${changes.files.map(f => f.file).join(", ")}\n`;
    try {
      if (existsSync(memoryPath)) {
        const existing = readFileSync(memoryPath, "utf-8");
        writeFileSync(memoryPath, existing + entry, "utf-8");
      } else {
        writeFileSync(memoryPath, `# MEMORY\n\nAura-agent session memory.\n${entry}`, "utf-8");
      }
      console.log(`  ${pc.gray("MEMORY.md")} ${pc.green("updated")}`);
    } catch {
      console.log(`  ${pc.gray("MEMORY.md")} ${pc.yellow("failed")}`);
    }
    // auto-branch + auto-PR
    try {
      const branchInfo = await import("./git");
      const current = await branchInfo.gitCurrentBranch(workdir);
      const isMain = !current || ["main", "master", "develop"].includes(current);
      if (isMain && changes.files.length > 0) {
        const createBranch = await p.confirm({ message: "Create feature branch and push?" });
        if (!p.isCancel(createBranch) && createBranch) {
          const slug = message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
          const newBranch = `feat/${slug}`;
          const branchResult = await branchInfo.gitCreateBranch(newBranch, workdir);
          if (branchResult.success) {
            console.log(`  ${pc.green("✓")} ${pc.gray("branch:")} ${pc.white(newBranch)}`);
            const createPR = await p.confirm({ message: "Create pull request via gh?" });
            if (!p.isCancel(createPR) && createPR) {
              const body = await generatePrBody(workdir);
              const pr = await createPullRequest(workdir, message, body);
              if (pr.success) {
                console.log(`  ${pc.green("✓")} ${pc.gray("PR:")} ${pc.cyan(pr.url ?? "created")}`);
              } else {
                console.log(`  ${pc.yellow("⚠")} ${pc.gray("PR creation failed:")} ${pc.yellow(pr.message)}`);
              }
            }
          }
        }
      }
    } catch { /* PR flow is best-effort */ }
  } else {
    console.log(`\n  ${pc.red("\u2717")} ${pc.red(result.message)}`);
  }
  console.log();
}

async function handleUndo(state: ReplState, args: string): Promise<void> {
  const workdir = state.config.workingDirectory;
  const n = args ? parseInt(args, 10) : 1;
  if (!isNaN(n) && n > 1) {
    const result = state.agent.undoN(n);
    console.log(`\n  ${result.success ? pc.green("\u2713") : pc.red("\u2717")} ${result.success ? pc.gray(result.message) : pc.gray(result.message)}\n`);
    return;
  }
  const modified = state.agent.getModifiedFiles();
  if (modified.length > 0) {
    const result = state.agent.undoLastChange();
    console.log(`\n  ${result.success ? pc.green("\u2713") : pc.red("\u2717")} ${result.success ? pc.gray(result.message) : pc.red(result.message)}\n`);
    return;
  }
  const isRepo = await isGitRepo(workdir);
  if (isRepo) {
    const r = await gitUndo(workdir);
    console.log(`\n  ${r.success ? pc.green("\u2713") : pc.red("\u2717")} ${r.success ? pc.gray(r.message) : pc.red(r.message)}\n`);
  } else {
    console.log(`\n  ${pc.gray("Nothing to undo.")}\n`);
  }
}

async function handleLog(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const isRepo = await isGitRepo(workdir);
  if (!isRepo) { console.log(`\n  ${pc.gray("Not a git repo.")}\n`); return; }
  const log = await gitLog(workdir, 10);
  console.log();
    console.log(sectionInline("Recent Commits"));
  
  for (const line of log.split("\n")) {
    if (!line.trim()) continue;
    const hash = line.split(" ")[0];
    const rest = line.slice(hash.length + 1);
    console.log(`  ${pc.yellow(hash)} ${pc.white(rest)}`);
  }
  console.log();
}

async function handleBranch(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const isRepo = await isGitRepo(workdir);
  if (!isRepo) { console.log(`\n  ${pc.gray("Not a git repo.")}\n`); return; }
  const { current, branches } = await gitBranch(workdir);
  console.log();
  console.log(sectionInline("Branches"));
  
  for (const b of branches) {
    if (b === current) {
      console.log(`  ${pc.green("●")} ${pc.green(pc.bold(b))} ${pc.gray("(current)")}`);
    } else {
      console.log(`  ${pc.gray("○")} ${b}`);
    }
  }

  const action = await p.select({
    message: "Branch action:",
    options: [
      { value: "switch", label: pc.cyan("Switch existing branch"), hint: "Checkout" },
      { value: "create", label: pc.magenta("Create new branch"), hint: "Checkout -b" },
      { value: "cancel", label: pc.gray("Cancel"), hint: "" },
    ],
  });
  if (p.isCancel(action) || action === "cancel") { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }

  if (action === "switch") {
    const target = await p.select({
      message: "Switch to:",
      options: branches.filter(b => b !== current).map(b => ({ value: b, label: b, hint: "" })),
    });
    if (p.isCancel(target)) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
    const r = await gitCheckout(target as string, workdir);
    console.log(`\n  ${r.success ? pc.green("✓") : pc.red("✗")} ${r.message}\n`);
  } else if (action === "create") {
    const nameInput = await p.text({ message: "New branch name:", validate: (v) => { if (!v?.trim()) return "Required"; return undefined; } });
    if (p.isCancel(nameInput)) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
    const r = await gitCreateBranch((nameInput as string).trim(), workdir);
    console.log(`\n  ${r.success ? pc.green("✓") : pc.red("✗")} ${r.message}\n`);
  }
}

async function handleChanges(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const isRepo = await isGitRepo(workdir);
  const aiModified = state.agent.getModifiedFiles();
  console.log();
  console.log(sectionInline("Changes"));
  
  if (aiModified.length > 0) {
    console.log(`  ${pc.gray("AI modified this session:")}`);
    for (const f of aiModified) {
      console.log(`  ${pc.yellow("✎")} ${f}`);
    }
    console.log();
  }
  if (isRepo) {
    const summary = await gitChangesSummary(workdir);
    if (summary.total > 0) {
      console.log(`  ${pc.gray("Git status:")}`);
      for (const c of summary.files) {
        const color = c.status === "??" ? pc.yellow : c.status.includes("D") ? pc.red : c.status.includes("A") ? pc.green : pc.white;
        console.log(`  ${color(c.status.padEnd(2))} ${c.file}`);
      }
    } else {
      console.log(`  ${pc.gray("Git: clean")}`);
    }
  }
  console.log();
}

function handleAddContext(state: ReplState, args: string): void {
  if (!args) { console.log(`\n  ${pc.gray("Usage: /add <file>")}\n`); return; }
  const result = addContextFile(args, state.config.workingDirectory);
  console.log(`\n  ${result.success ? pc.green("✓") : pc.red("✗")} ${result.success ? pc.green(result.message) : pc.red(result.message)}\n`);
}

function handleDropContext(args: string): void {
  if (!args) { console.log(`\n  ${pc.gray("Usage: /drop <file>")}\n`); return; }
  const result = dropContextFile(args);
  console.log(`\n  ${result.success ? pc.green("✓") : pc.red("✗")} ${result.success ? pc.green(result.message) : pc.red(result.message)}\n`);
}

function handleContextList(): void {
  const files = getContextFiles();
  console.log();
  console.log(sectionInline("Context Files"));
  
  if (files.length === 0) {
    console.log(`  ${pc.gray("No files in context. Use /add <file>")}`);
  } else {
    for (const f of files) {
      console.log(`  ${pc.green("✓")} ${f.path} ${pc.gray(`(${f.content.length} chars)`)}`);
    }
  }
  console.log();
}

async function handleCompact(state: ReplState): Promise<void> {
  const history = state.agent.getConversation();
  if (history.length < 4) {
    console.log(`\n  ${pc.gray("Not enough history to compact.")}\n`);
    return;
  }
  console.log(`\n${infoBox("compact", "Compacting conversation... This may take a moment.", "yellow")}\n`);
  await state.agent.run("Summarize our conversation so far in 5-10 bullet points. Include key decisions, files changed, and remaining tasks. This is for context compaction — be extremely concise.");
  const conv = state.agent.getConversation();
  const lastAssistant = [...conv].reverse().find(m => m.role === "assistant");
  let summary = "";
  if (lastAssistant) {
    if (typeof lastAssistant.content === "string") {
      summary = lastAssistant.content;
    } else {
      const tb = (lastAssistant.content as unknown as Array<Record<string, unknown>>).find(b => b.type === "text") as { text: string } | undefined;
      if (tb) summary = tb.text;
    }
  }
  if (summary) {
    state.agent.reset();
    state.agent.setConversation([{ role: "user", content: `Previous conversation summary:\n${summary}` }]);
    console.log(`\n  ${pc.green("✓")} ${pc.green("Compacted")} ${pc.gray(`(${history.length} → 1 message)`)}\n`);
  } else {
    console.log(`\n  ${pc.red("✗")} ${pc.red("Failed to compact")}\n`);
  }
}

function handleInit(state: ReplState): void {
  const wd = state.config.workingDirectory;
  const auraResult = createInitFile(wd);
  console.log(`\n  ${auraResult.success ? pc.green("✓") : pc.yellow("⚠")}  ${auraResult.success ? pc.green(auraResult.message) : pc.yellow(auraResult.message)}`);
  if (auraResult.success) {
    console.log(`  ${pc.gray("Edit")} ${pc.white("AURA.md")} ${pc.gray("to add project context for the AI agent.")}`);
  }
  const aurarcPath = join(wd, ".aurarc");
  if (!existsSync(aurarcPath)) {
    const detected = detectProjectType(wd);
    const template = createAurarcTemplate(wd, detected);
    try {
      writeFileSync(aurarcPath, template, "utf-8");
      console.log(`  ${pc.green("✓")}  ${pc.white(".aurarc")} ${pc.gray("created")}`);
    } catch {
      console.log(`  ${pc.yellow("⚠")}  ${pc.gray("Failed to create .aurarc")}`);
    }
  }
  console.log();
}

async function handleSave(state: ReplState, args: string): Promise<void> {
  let name = args.trim();
  if (!name) {
    const input = await p.text({ message: "Session name:", validate: (v) => { if (!v?.trim()) return "Required"; return undefined; } });
    if (p.isCancel(input)) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
    name = (input as string).trim();
  }
  const data = {
    name,
    conversation: state.agent.getConversation() as unknown[],
    config: state.agent.getConfig(),
    modelInfo: state.modelInfo,
    timestamp: Date.now(),
    provider: state.config.provider,
    model: state.config.model,
    reasoningEffort: state.config.reasoningEffort,
  };
  const result = saveSession(name, data);
  if (result.success) {
    console.log(`\n  ${pc.green("✓")} ${pc.green("Saved:")} ${pc.white(name)} ${pc.gray(`(${getSessionDir()})`)}\n`);
  } else {
    console.log(`\n  ${pc.red("✗")} ${pc.red("Failed to save")}\n`);
  }
}

async function handleLoad(state: ReplState, args: string): Promise<void> {
  let name = args.trim();
  if (!name) {
    const sessions = listSessions();
    if (sessions.length === 0) { console.log(`\n  ${pc.gray("No saved sessions.")}\n`); return; }
    const selected = await p.select({
      message: "Load session:",
      options: sessions.map(s => ({ value: s.name, label: pc.white(s.name), hint: `${s.provider} · ${s.model} · ${fmtDate(s.timestamp)}` })),
    });
    if (p.isCancel(selected)) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
    name = selected as string;
  }
  const data = loadSession(name);
  if (!data) { console.log(`\n  ${pc.red("✗")} ${pc.red(`Session not found: ${name}`)}\n`); return; }
  state.agent.setConversation(data.conversation as typeof state.agent.getConversation extends () => infer R ? R : never);
  if (data.reasoningEffort) state.config.reasoningEffort = data.reasoningEffort;
  console.log(`\n  ${pc.green("✓")} ${pc.green("Loaded:")} ${pc.white(name)} ${pc.gray(`(${data.conversation.length} messages)`)}`);
  printPreviousConversation(data.conversation);
}

function handleSessionsList(): void {
  const sessions = listSessions();
  console.log();
  console.log(sectionInline("Saved Sessions"));

  if (sessions.length === 0) {
    console.log(`  ${pc.dim("No saved sessions. Use /save [name]")}`);
  } else {
    const t = new Table({
      style: { head: ["cyan"], border: ["gray"] },
      chars: { "top": "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐",
               "bottom": "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘",
               "left": "│", "left-mid": "├", "mid": "─", "mid-mid": "┼",
               "right": "│", "right-mid": "┤" },
      colWidths: [22, 14, 28, 20],
    });
    t.push([pc.bold("Name"), pc.bold("Provider"), pc.bold("Model"), pc.bold("Date")]);
    for (const s of sessions) {
      t.push([pc.white(s.name), pc.dim(PROVIDERS[s.provider as Provider]?.label ?? s.provider), pc.dim(s.model.slice(0, 26)), pc.dim(fmtDate(s.timestamp))]);
    }
    console.log(t.toString());
  }
  console.log();
  console.log();
}

function buildSessionOptions(sessions: SessionSummary[]): Array<{ value: string; label: string; hint: string }> {
  const named = sessions.filter(s => !s.name.startsWith("auto-"));
  const auto = sessions.filter(s => s.name.startsWith("auto-"));
  const opts: Array<{ value: string; label: string; hint: string }> = [];
  for (const s of named) {
    opts.push({ value: s.name, label: pc.white(s.name), hint: `${s.provider} · ${s.model} · ${s.messageCount} msgs · ${fmtDate(s.timestamp)}` });
  }
  if (named.length > 0 && auto.length > 0) {
    opts.push({ value: "\0separator", label: pc.gray("── auto-saved ──"), hint: "" });
  }
  for (const s of auto) {
    opts.push({ value: s.name, label: pc.gray(s.name), hint: `${s.provider} · ${s.model} · ${s.messageCount} msgs · ${fmtDate(s.timestamp)}` });
  }
  return opts;
}

async function handleResume(state: ReplState): Promise<void> {
  const sessions = listSessionsDetailed();
  if (sessions.length === 0) {
    console.log(`\n  ${pc.gray("No saved sessions.")}\n`);
    return;
  }
  const options = buildSessionOptions(sessions);
  const selected = await p.select({
    message: "Resume session:",
    options,
  });
  if (p.isCancel(selected) || selected === "\0separator") { console.log(`\n  ${pc.gray("Cancelled")}\n`); return; }
  const name = selected as string;
  const data = loadSession(name);
  if (!data) { console.log(`\n  ${pc.red("✗")} ${pc.red(`Session not found: ${name}`)}\n`); return; }
  state.agent.setConversation(data.conversation as typeof state.agent.getConversation extends () => infer R ? R : never);
  if (data.reasoningEffort) state.config.reasoningEffort = data.reasoningEffort;
  console.log(`\n  ${pc.green("✓")} ${pc.green("Resumed:")} ${pc.white(name)} ${pc.gray(`(${data.conversation.length} messages)`)}`);
  printPreviousConversation(data.conversation);
}

async function handleExport(state: ReplState): Promise<void> {
  const input = await p.text({ message: "Export filename:", defaultValue: "aura-export.md", validate: (v) => { if (!v?.trim()) return "Required"; return undefined; } });
  if (p.isCancel(input)) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
  const filename = (input as string).trim();
  const data = {
    name: filename,
    conversation: state.agent.getConversation() as unknown[],
    config: state.agent.getConfig(),
    modelInfo: state.modelInfo,
    timestamp: Date.now(),
    provider: state.config.provider,
    model: state.config.model,
    reasoningEffort: state.config.reasoningEffort,
  };
  const md = exportSessionMarkdown(data);
  const { writeFileSync } = await import("node:fs");
  const { join: joinPath } = await import("node:path");
  const outPath = joinPath(state.config.workingDirectory, filename);
  try {
    writeFileSync(outPath, md, "utf-8");
    console.log(`\n  ${pc.green("✓")} ${pc.green("Exported:")} ${pc.white(outPath)}\n`);
  } catch (e) {
    console.log(`\n  ${pc.red("✗")} ${pc.red(`Failed: ${e instanceof Error ? e.message : String(e)}`)}\n`);
  }
}

async function handleReview(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const isRepo = await isGitRepo(workdir);
  if (!isRepo) {
    console.log(`\n  ${pc.gray("Not a git repo. Use /diff for AI changes.")}\n`);
    return;
  }
  const diff = await getGitDiff(workdir);
  if (diff === "No uncommitted changes.") {
    console.log(`\n  ${pc.gray("No changes to review.")}\n`);
    return;
  }
  console.log(`\n${pendingAction("Reviewing changes...")}\n`);
  await state.agent.run(`Review the following code changes and provide feedback. Point out any bugs, style issues, or improvements:\n\n${diff.slice(0, 20000)}`);
  console.log();
}

async function handleTest(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const { existsSync: ex } = await import("node:fs");
  const { join: jp } = await import("node:path");
  let cmd = "";
  if (ex(jp(workdir, "bunfig.toml")) || ex(jp(workdir, "bun.lock"))) cmd = "bun test";
  else if (ex(jp(workdir, "package.json"))) {
    const pkg = JSON.parse(await Bun.file(jp(workdir, "package.json")).text());
    if (pkg.scripts?.test) cmd = "npm test";
    else if (pkg.scripts?.vitest) cmd = "npx vitest run";
    else cmd = "bun test";
  }
  else if (ex(jp(workdir, "pytest.ini")) || ex(jp(workdir, "pyproject.toml"))) cmd = "pytest";
  else if (ex(jp(workdir, "Cargo.toml"))) cmd = "cargo test";
  else if (ex(jp(workdir, "go.mod"))) cmd = "go test ./...";
  else cmd = "bun test";

  console.log(`\n${pendingAction("Running tests:", cmd)}\n`);
  await state.agent.run(`Run the test suite for this project. Use execute_shell to run: ${cmd}. If tests fail, analyze the errors and fix them.`);
  console.log();
}

async function handleLint(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const { existsSync: ex } = await import("node:fs");
  const { join: jp } = await import("node:path");
  let cmd = "";
  if (ex(jp(workdir, "biome.json"))) cmd = "npx biome lint .";
  else if (ex(jp(workdir, ".eslintrc")) || ex(jp(workdir, ".eslintrc.js")) || ex(jp(workdir, ".eslintrc.json"))) cmd = "npx eslint .";
  else if (ex(jp(workdir, "package.json"))) {
    const pkg = JSON.parse(await Bun.file(jp(workdir, "package.json")).text());
    if (pkg.scripts?.lint) cmd = "npm run lint";
    else cmd = "npx tsc --noEmit";
  }
  else cmd = "npx tsc --noEmit";

  console.log(`\n${pendingAction("Running linter:", cmd)}\n`);
  await state.agent.run(`Run the linter for this project. Use execute_shell to run: ${cmd}. If there are lint errors, fix them.`);
  console.log();
}

async function handleExplain(state: ReplState, args: string): Promise<void> {
  if (!args) { console.log(`\n  ${pc.gray("Usage: /explain <file>")}\n`); return; }
  const workdir = state.config.workingDirectory;
  const { existsSync: ex } = await import("node:fs");
  const { join: jp } = await import("node:path");
  if (!ex(jp(workdir, args))) { console.log(`\n  ${pc.red("✗")} ${pc.red(`File not found: ${args}`)}\n`); return; }
  console.log(`\n${pendingAction("Explaining:", args)}\n`);
  await state.agent.run(`Read the file ${args} and explain what it does, its architecture, key functions, and any potential issues. Be thorough but concise.`);
  console.log();
}

async function handleRefactor(state: ReplState): Promise<void> {
  console.log(`\n  ${pc.gray("Analyzing for refactoring opportunities...")}\n`);
  await state.agent.run(`Analyze the current project structure and code. Suggest specific refactoring improvements: naming, file organization, code duplication, complexity, etc. Use list_files and view_file to inspect the code. Don't make changes — just suggest.`);
  console.log();
}

async function handleWebSearchCmd(_state: ReplState, args: string): Promise<void> {
  if (!args) { console.log(`\n  ${pc.gray("Usage: /search <query>")}\n`); return; }
  console.log(`\n  ${pc.gray("Searching:")} ${pc.white(args)}\n`);
  const results = await webSearch(args, 5);
  console.log(results);
  console.log();
}

async function handlePr(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const ghOk = await isGhInstalled(workdir);
  if (!ghOk) { console.log(`\n  ${pc.red("gh CLI not installed. https://cli.github.com")}\n`); return; }

  console.log(`\n  ${pc.gray("Creating PR...")}\n`);

  const titleInput = await p.text({
    message: "PR title:",
    placeholder: "Leave empty for AI to generate...",
  });
  if (p.isCancel(titleInput)) { console.log(`\n  ${pc.gray("Cancelled")}\n`); return; }

  let title = (titleInput as string).trim();
  let body = "";

  if (!title) {
    console.log(`  ${pc.gray("Generating PR title and body...")}`);
    const bodyContent = await generatePrBody(workdir);
    await state.agent.run(`Generate a concise PR title for these changes. Reply with ONLY the title:\n\n${bodyContent}`);
    const conv = state.agent.getConversation();
    const lastAssistant = [...conv].reverse().find(m => m.role === "assistant");
    if (lastAssistant) {
      if (typeof lastAssistant.content === "string") {
        title = lastAssistant.content.trim();
      } else {
        const tb = (lastAssistant.content as unknown as Array<Record<string, unknown>>).find(b => b.type === "text") as { text: string } | undefined;
        if (tb) title = tb.text.trim();
      }
    }
    body = bodyContent;
    console.log(`  ${pc.gray("Title:")} ${pc.white(title)}`);
  }

  const result = await createPullRequest(workdir, title, body);
  if (result.success) {
    console.log(`\n  ${pc.green("\u2713")} ${pc.green("PR created")} ${result.url ? pc.gray(result.url) : ""}\n`);
  } else {
    console.log(`\n  ${pc.red("\u2717")} ${pc.red(result.message)}\n`);
  }
}

async function handleWatch(state: ReplState): Promise<void> {
  const workdir = state.config.workingDirectory;
  const projectInfo = detectProjectType(workdir);
  if (!projectInfo.testCmd) {
    console.log(`\n  ${pc.gray("No test command detected for this project.")}\n`);
    return;
  }

  console.log(`\n  ${pc.gray("Watching for file changes...")}`);
  console.log(`  ${pc.gray("Test command:")} ${pc.white(projectInfo.testCmd)}`);
  console.log(`  ${pc.gray("Press Ctrl+C to stop")}\n`);

  let running = false;
  const watcher = new FileWatcher(workdir, async (events: WatchEvent[]) => {
    if (running) return;
    running = true;
    const changedFiles = events.map(e => e.path).join(", ");
    console.log(`\n  ${pc.gray("Changed:")} ${changedFiles}`);
    console.log(`  ${pc.gray("Running tests...")}`);
    await state.agent.run(`Run the test suite using: ${projectInfo.testCmd}. If tests fail, analyze the errors and fix them.`);
    running = false;
  });

  watcher.start();

  const stopWatch = () => {
    watcher.stop();
    console.log(`\n  ${pc.gray("Watch stopped")}\n`);
  };

  process.on("SIGINT", () => {
    if (watcher.isRunning()) {
      stopWatch();
    }
  });
}

function handleProjectInfo(_state: ReplState): void {
  const workdir = process.cwd();
  const info = detectProjectType(workdir);
  console.log();
  console.log(`  ${pc.gray("\u2503")} ${pc.bold("Project")}`);
  console.log(`  ${pc.gray("\u2503")} ${formatProjectInfo(info)}`.replace(/\n/g, `\n  ${pc.gray("\u2503")} `));
  console.log();
}

async function handleConfig(_state: ReplState, workdir: string): Promise<void> {
  const aurarcPath = join(workdir, ".aurarc");
  if (!existsSync(aurarcPath)) {
    const detected = detectProjectType(workdir);
    const template = createAurarcTemplate(workdir, detected);
    try {
      writeFileSync(aurarcPath, template, "utf-8");
      console.log(`\n  ${pc.green("✓")}  ${pc.white(".aurarc")} ${pc.gray("created with template")}`);
    } catch {
      console.log(`\n  ${pc.red("✗")}  ${pc.gray("Failed to create .aurarc")}`);
    }
    console.log();
    return;
  }
  const cfg = loadConfig(workdir);
  const action = await p.select({
    message: ".aurarc config:",
    options: [
      { value: "edit", label: "Open in editor" },
      { value: "provider", label: `Set provider (${cfg?.provider ?? "not set"})` },
      { value: "model", label: `Set model (${cfg?.model ?? "not set"})` },
      { value: "reasoning", label: `Set reasoning effort (${cfg?.reasoningEffort ?? "off"})` },
      { value: "auto", label: `Toggle auto-confirm (${cfg?.autoConfirm ? "on" : "off"})` },
      { value: "instructions", label: "Edit instructions" },
      { value: "view", label: "View current config" },
    ],
  });
  if (p.isCancel(action) || !action) { console.log(`\n  ${pc.gray("cancelled")}\n`); return; }
  switch (action) {
    case "edit": {
      const content = await editorPrompt(readFileSync(aurarcPath, "utf-8"));
      if (content !== null) {
        writeFileSync(aurarcPath, content, "utf-8");
        console.log(`\n  ${pc.green("✓")} ${pc.gray("saved")}\n`);
      }
      break;
    }
    case "provider": {
      const pv = await p.select({ message: "Provider:", options: PROVIDER_LIST.map(p => ({ value: p, label: p })) });
      if (!p.isCancel(pv) && pv) {
        const content = readFileSync(aurarcPath, "utf-8");
        writeFileSync(aurarcPath, content.replace(/"provider":\s*[^,\n]+/, `"provider": "${pv}"`), "utf-8");
        console.log(`\n  ${pc.green("✓")} ${pc.gray("provider →")} ${pc.white(pv as string)}\n`);
      }
      break;
    }
    case "model": {
      const md = await p.text({ message: "Model name:", placeholder: cfg?.model ?? "claude-sonnet-4-20250514" });
      if (!p.isCancel(md) && (md as string).trim()) {
        const content = readFileSync(aurarcPath, "utf-8");
        writeFileSync(aurarcPath, content.replace(/"model":\s*[^,\n]+/, `"model": "${(md as string).trim()}"`), "utf-8");
        console.log(`\n  ${pc.green("✓")} ${pc.gray("model →")} ${pc.white((md as string).trim())}\n`);
      }
      break;
    }
    case "reasoning": {
      const re = await p.select({ message: "Reasoning effort:", options: Object.entries(REASONING_LABELS).map(([k, v]) => ({ value: k, label: v })) });
      if (!p.isCancel(re) && re) {
        const reasoningStr = re as string;
        const content = readFileSync(aurarcPath, "utf-8");
        writeFileSync(aurarcPath, content.replace(/"reasoningEffort":\s*"[^"]*"/, `"reasoningEffort": "${reasoningStr}"`), "utf-8");
        console.log(`\n  ${pc.green("✓")} ${pc.gray("reasoning →")} ${pc.white(reasoningStr)}\n`);
      }
      break;
    }
    case "auto": {
      const content = readFileSync(aurarcPath, "utf-8");
      const current = cfg?.autoConfirm ?? false;
      writeFileSync(aurarcPath, content.replace(/"autoConfirm":\s*(true|false)/, `"autoConfirm": ${!current}`), "utf-8");
      console.log(`\n  ${pc.green("✓")} ${pc.gray("auto-confirm →")} ${pc.white(String(!current))}\n`);
      break;
    }
    case "instructions": {
      const inst = await editorPrompt(cfg?.instructions ?? "# Custom instructions for the agent\n");
      if (inst !== null) {
        const content = readFileSync(aurarcPath, "utf-8");
        const escaped = JSON.stringify(inst);
        writeFileSync(aurarcPath, content.replace(/"instructions":\s*"[^"]*"/, `"instructions": ${escaped}`), "utf-8");
        console.log(`\n  ${pc.green("✓")} ${pc.gray("instructions updated")}\n`);
      }
      break;
    }
    case "view": {
      const content = readFileSync(aurarcPath, "utf-8");
      console.log(`\n  ${pc.gray(".aurarc")}`);
      for (const line of content.split("\n")) {
        console.log(`  ${pc.gray(line)}`);
      }
      console.log();
      break;
    }
  }
}

function handlePlanToggle(state: ReplState): void {
  const current = state.agent.isPlanMode();
  state.agent.setPlanMode(!current);
  console.log(`\n  ${pc.cyan("\u25C6")} ${pc.bold("PLAN MODE")} ${pc.gray(!current ? "enabled" : "disabled")}`);
  if (!current) {
    console.log(`  ${pc.gray("Mutating tools (write_file, patch_file, execute_shell) are BLOCKED.")}`);
    console.log(`  ${pc.gray("The agent will produce a structured plan instead. Review with /plan-show, approve with /plan-approve.")}`);
  }
  console.log();
}

function handlePlanShow(state: ReplState): void {
  const plan = state.agent.getCurrentPlan();
  if (!plan) {
    console.log(`\n  ${pc.yellow("\u26A0")}  ${pc.gray("No plan yet. Run a task with /plan enabled.")}\n`);
    return;
  }
  console.log();
  console.log(`  ${pc.cyan("\u25C6")} ${pc.bold(pc.white(plan.summary))}`);
  console.log(`  ${pc.gray("\u2500".repeat(60))}`);
  plan.steps.forEach((step, i) => {
    const icon = step.action === "create" ? pc.green("+") : step.action === "delete" ? pc.red("-") : pc.yellow("~");
    const file = step.file ? pc.white(step.file) : pc.gray("(no file)");
    console.log(`  ${icon} ${pc.cyan(`${i + 1}.`)} ${pc.bold(file)} ${pc.gray("\u2014")} ${pc.gray(step.description)}`);
  });
  console.log(`  ${pc.gray("\u2500".repeat(60))}`);
  console.log(`  ${pc.gray("Actions: /plan-approve (execute) | /plan-cancel (discard)")}`);
  console.log();
}

async function handlePlanApprove(state: ReplState): Promise<void> {
  const plan = state.agent.getCurrentPlan();
  if (!plan) {
    console.log(`\n  ${pc.yellow("\u26A0")}  ${pc.gray("No plan to approve. Run a task with /plan first.")}\n`);
    return;
  }
  state.agent.setPlanMode(false);
  state.agent.setCurrentPlan(null);
  const summary = `Approved plan: ${plan.summary}\n${plan.steps.map((s, i) => `${i + 1}. [${s.action}] ${s.file ?? ""} — ${s.description}`).join("\n")}\n\nNow execute this plan.`;
  console.log(`\n  ${pc.green("\u2713")} ${pc.gray("Plan approved. Executing...")}\n`);
  await state.agent.run(summary);
}

function handlePlanCancel(state: ReplState): void {
  state.agent.setPlanMode(false);
  state.agent.setCurrentPlan(null);
  console.log(`\n  ${pc.gray("\u25CB")} ${pc.gray("Plan discarded.")}\n`);
}

function handleModeSwitch(state: ReplState): void {
  const current = state.agent.getTuiMode();
  console.log(`\n  ${pc.cyan("\u25C6")} ${pc.bold("TUI Mode:")} ${pc.white(current)}`);
  console.log(`  ${pc.gray("Modes:")}`);
  console.log(`    ${pc.cyan("chat")} ${pc.gray("\u2014")} ${pc.gray("Normal conversational mode")}`);
  console.log(`    ${pc.cyan("plan")} ${pc.gray("\u2014")} ${pc.gray("Force plan-only output")}`);
  console.log(`    ${pc.cyan("exec")} ${pc.gray("\u2014")} ${pc.gray("Skip confirmation prompts")}`);
}

async function handleAgentSwitch(state: ReplState): Promise<void> {
  const { listAgents } = await import("./agents");
  const agents = listAgents();
  const current = state.agent.getActiveAgent();
  console.log(`\n  ${pc.cyan("\u25C6")} ${pc.bold("Current agent:")} ${pc.white(current)}\n`);
  const selected = await p.select({
    message: "Switch agent:",
    options: agents.map(a => ({
      value: a.name,
      label: `${a.icon}  ${pc.bold(a.label)}`,
      hint: a.description,
    })),
  });
  if (p.isCancel(selected) || !selected) { console.log(`\n  ${pc.gray("cancelled")}\n`); return; }
  state.agent.setActiveAgent(selected as string);
  const agent = agents.find(a => a.name === selected);
  console.log(`\n  ${agent?.icon ?? "\u2728"}  ${pc.bold(agent?.label ?? selected)} ${pc.gray(agent?.description ?? "")}\n`);
  if (agent && agent.blockedTools.length > 0) {
    console.log(`  ${pc.yellow("\u26A0")}  ${pc.gray("Blocked tools:")} ${pc.yellow(agent.blockedTools.join(", "))}`);
    console.log();
  }
}

function handleMCPStatus(): void {
  const servers = getMCPServers();
  if (servers.length === 0) {
    console.log(`\n  ${pc.gray("No MCP servers running.")}`);
    console.log(`  ${pc.gray("Add servers in .aurarc:")}`);
    console.log(`  ${pc.cyan('"mcpServers": { "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] } }')}`);
    console.log();
    return;
  }
  console.log(`\n  ${pc.cyan("\u25C6")} ${pc.bold("MCP Servers")} ${pc.gray(`(${servers.length})`)}`);
  for (const s of servers) {
    const tools = s.getTools();
    console.log(`  ${pc.green("\u25CF")} ${pc.bold(s.config.name)} ${pc.gray(`${tools.length} tools`)}`);
    for (const t of tools.slice(0, 5)) {
      console.log(`    ${pc.gray("\u2502")} ${pc.cyan(t.name)} ${pc.gray("\u2014")} ${pc.gray(t.description.slice(0, 60))}`);
    }
    if (tools.length > 5) {
      console.log(`    ${pc.gray(`... ${tools.length - 5} more`)}`);
    }
  }
  console.log();
}

function handleLSPStatus(): void {
  const lsp = getLSP();
  if (!lsp || !lsp.isActive()) {
    console.log(`\n  ${pc.gray("No LSP server running. Supported: typescript, python, go, rust (if installed)")}`);
    console.log();
    return;
  }
  console.log(`\n  ${pc.green("\u25CF")} ${pc.bold("LSP active")}`);
  console.log();
}

async function handleLocaleSwitch(): Promise<void> {
  const { setLocale, getLocale } = await import("./highlight");
  const loc = await p.select({
    message: "Language:",
    options: [
      { value: "en", label: "English" },
      { value: "ru", label: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439 (Russian)" },
    ],
  });
  if (p.isCancel(loc) || !loc) return;
  setLocale(loc as "en" | "ru");
  console.log(`\n  ${pc.cyan("\u25C6")} ${pc.gray("Language:")} ${pc.white(getLocale())}\n`);
}

async function handleTokenPlans(): Promise<void> {
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
    console.log(`  ${color("●")} ${pc.gray("API key:")} ${color(check.message)}`);
    console.log();
  }
}

function handleTodo(state: ReplState, args: string): void {
  const workdir = state.config.workingDirectory;
  if (!args || args === "list") {
    printTodos(workdir);
    return;
  }
  const parts = args.split(/\s+/);
  const sub = parts[0];
  const rest = parts.slice(1).join(" ");

  switch (sub) {
    case "add": {
      if (!rest) { console.log(`\n  ${pc.gray("Usage: /todo add <text>")}\n`); return; }
      const item = addTodo(workdir, rest);
      console.log(`\n  ${pc.green("\u2713")} ${pc.gray(`added #${item.id}:`)} ${rest}\n`);
      break;
    }
    case "done": {
      const id = parseInt(rest, 10);
      if (isNaN(id)) { console.log(`\n  ${pc.gray("Usage: /todo done <id>")}\n`); return; }
      const ok = updateTodoStatus(workdir, id, "done");
      console.log(`\n  ${ok ? pc.green("\u2713") : pc.red("\u2717")} ${ok ? pc.gray(`done #${id}`) : pc.red(`not found #${id}`)}\n`);
      break;
    }
    case "doing": {
      const id = parseInt(rest, 10);
      if (isNaN(id)) { console.log(`\n  ${pc.gray("Usage: /todo doing <id>")}\n`); return; }
      const ok = updateTodoStatus(workdir, id, "in_progress");
      console.log(`\n  ${ok ? pc.green("\u2713") : pc.red("\u2717")} ${ok ? pc.gray(`in progress #${id}`) : pc.red(`not found #${id}`)}\n`);
      break;
    }
    case "rm":
    case "remove": {
      const id = parseInt(rest, 10);
      if (isNaN(id)) { console.log(`\n  ${pc.gray("Usage: /todo rm <id>")}\n`); return; }
      const ok = removeTodo(workdir, id);
      console.log(`\n  ${ok ? pc.green("\u2713") : pc.red("\u2717")} ${ok ? pc.gray(`removed #${id}`) : pc.red(`not found #${id}`)}\n`);
      break;
    }
    case "clear": {
      clearTodos(workdir);
      console.log(`\n  ${pc.green("\u2713")} ${pc.gray("cleared all todos")}\n`);
      break;
    }
    default:
      console.log(`\n  ${pc.gray("Usage: /todo add <text> | done <id> | doing <id> | rm <id> | list | clear")}\n`);
  }
}

function handleMemory(state: ReplState, args: string): void {
  const workdir = state.config.workingDirectory;
  const memPath = join(workdir, "MEMORY.md");
  if (!args || args === "show") {
    if (!existsSync(memPath)) {
      console.log(`\n  ${pc.gray("No MEMORY.md. Use /memory init to create.")}\n`);
      return;
    }
    const content = readFileSync(memPath, "utf-8");
    console.log();
    console.log(`  ${pc.gray("\u2503")} ${pc.bold("MEMORY.md")}`);
    console.log();
    for (const line of content.split("\n")) {
      console.log(`  ${pc.gray("\u2503")} ${line}`);
    }
    console.log();
    return;
  }
  if (args === "init") {
    const template = `# MEMORY.md - Agent Memory

## Code Patterns
<!-- Patterns the agent should follow -->

## Architecture Decisions
<!-- Key decisions and their rationale -->

## Known Issues
<!-- Known bugs, tech debt, gotchas -->

## Preferences
<!-- User preferences for code style, naming, etc. -->
`;
    writeFileSync(memPath, template, "utf-8");
    console.log(`\n  ${pc.green("\u2713")} ${pc.gray("Created MEMORY.md")}\n`);
    return;
  }
  if (args === "clear") {
    writeFileSync(memPath, "# MEMORY.md - Agent Memory\n", "utf-8");
    console.log(`\n  ${pc.green("\u2713")} ${pc.gray("Cleared MEMORY.md")}\n`);
    return;
  }
  console.log(`\n  ${pc.gray("Usage: /memory show | init | clear")}\n`);
}

async function handleGenTest(state: ReplState, args: string): Promise<void> {
  if (!args) { console.log(`\n  ${pc.gray("Usage: /gen-test <file>")}\n`); return; }
  const workdir = state.config.workingDirectory;
  if (!existsSync(join(workdir, args))) { console.log(`\n  ${pc.red("\u2717")} ${pc.red(`File not found: ${args}`)}\n`); return; }
  console.log(`\n  ${pc.gray("Generating tests for:")} ${pc.white(args)}\n`);
  await state.agent.run(`Read the file ${args} and generate comprehensive tests for it. Analyze the functions, classes, and exports. Create a test file with good coverage. Write the test file, then run the tests to verify they pass.`);
  console.log();
}

async function handleDoc(state: ReplState, args: string): Promise<void> {
  if (!args) { console.log(`\n  ${pc.gray("Usage: /doc <file>")}\n`); return; }
  const workdir = state.config.workingDirectory;
  if (!existsSync(join(workdir, args))) { console.log(`\n  ${pc.red("\u2717")} ${pc.red(`File not found: ${args}`)}\n`); return; }
  console.log(`\n  ${pc.gray("Generating docs for:")} ${pc.white(args)}\n`);
  await state.agent.run(`Read the file ${args} and add comprehensive documentation. Add JSDoc/TSDoc comments to all functions, classes, and exports. Include parameter descriptions, return types, and usage examples. Use patch_file to add the documentation inline. Do not change any code logic.`);
  console.log();
}

async function runAtomic(agent: Agent, instruction: string, modelInfo: ModelInfo, effort: ReasoningEffort): Promise<void> {
  console.log();
  console.log(`  ${pColor(modelInfo.provider)(pc.bold(modelInfo.label))} ${pc.gray(modelInfo.id)}`);
  if (effort !== "off") console.log(`  ${pc.gray("reasoning")} ${reasonBadge(effort)}`);
  console.log(`  ${pc.gray(">")} ${pc.white(instruction)}`);
  console.log();

  const result = await agent.run(instruction);
  const usage = agent.getTokenUsage();
  const cost = agent.getCost();
  const ctxLen = modelInfo.contextLength;
  const pct = ctxLen && ctxLen > 0 ? Math.min(100, (usage.total / ctxLen) * 100) : 0;

  console.log();
  if (result.success) {
    console.log(`  ${pc.green("\u25A3")} ${pc.gray("complete")} ${pc.gray("\xB7")} ${pc.gray(result.iterations + " iters")} ${pc.gray("\xB7")} ${pc.gray(result.selfHealingUsed + " self-heal")}`);
  } else {
    console.log(`  ${pc.red("\u25A3")} ${pc.gray("incomplete")} ${pc.gray("\xB7")} ${pc.gray(result.iterations + " iters")} ${pc.gray("\xB7")} ${pc.gray(result.selfHealingUsed + " self-heal")}`);
  }
  console.log(`  ${pc.gray("tokens")}  ${pc.gray(fmtTokens(usage.total))}`);
  if (ctxLen && ctxLen > 0) console.log(`  ${pc.gray("context")} ${pc.gray(pct.toFixed(1) + "%")}`);
  if (cost.total > 0) console.log(`  ${pc.gray("cost")}    ${pc.gray(fmtCost(cost.total))}`);
  const modified = agent.getModifiedFiles();
  if (modified.length > 0) {
    console.log(`  ${pc.gray("files")}   ${pc.gray(modified.length + " modified")}`);
  }
  console.log();
}

function parseSlashCommand(input: string): { command: string; args: string } {
  const spaceIdx = input.indexOf(" ");
  if (spaceIdx === -1) return { command: input, args: "" };
  return { command: input.slice(0, spaceIdx), args: input.slice(spaceIdx + 1).trim() };
}

interface PickerOption {
  label: string;
  hint?: string;
  value: string;
}

const COMMAND_CATEGORIES: Array<{ label: string; options: PickerOption[] }> = [
  {
    label: "Git & PR",
    options: [
      { label: "/diff", hint: "Show uncommitted changes", value: "/diff" },
      { label: "/commit", hint: "AI commit message + commit", value: "/commit" },
      { label: "/undo", hint: "Revert last AI change(s)", value: "/undo" },
      { label: "/log", hint: "Recent commits", value: "/log" },
      { label: "/branch", hint: "Branch operations", value: "/branch" },
      { label: "/changes", hint: "Changed files summary", value: "/changes" },
      { label: "/pr", hint: "Create GitHub PR", value: "/pr" },
    ],
  },
  {
    label: "Code Quality",
    options: [
      { label: "/review", hint: "AI review of changes", value: "/review" },
      { label: "/test", hint: "Run tests", value: "/test" },
      { label: "/lint", hint: "Run linter", value: "/lint" },
      { label: "/explain", hint: "Explain code", value: "/explain" },
      { label: "/refactor", hint: "Refactoring suggestions", value: "/refactor" },
      { label: "/gen-test", hint: "Generate tests", value: "/gen-test" },
      { label: "/doc", hint: "Generate documentation", value: "/doc" },
      { label: "/watch", hint: "Watch & auto-test", value: "/watch" },
    ],
  },
  {
    label: "Context & Memory",
    options: [
      { label: "/add", hint: "Add file to context", value: "/add" },
      { label: "/drop", hint: "Remove file from context", value: "/drop" },
      { label: "/context", hint: "List context files", value: "/context" },
      { label: "/compact", hint: "Compact history", value: "/compact" },
      { label: "/init", hint: "Create project context", value: "/init" },
      { label: "/memory", hint: "Show/edit memory", value: "/memory" },
    ],
  },
  {
    label: "Sessions",
    options: [
      { label: "/save", hint: "Save session", value: "/save" },
      { label: "/load", hint: "Load session", value: "/load" },
      { label: "/resume", hint: "Pick saved session", value: "/resume" },
      { label: "/sessions", hint: "List sessions", value: "/sessions" },
      { label: "/export", hint: "Export to Markdown", value: "/export" },
    ],
  },
  {
    label: "Provider & Model",
    options: [
      { label: "/provider", hint: "Switch provider", value: "/provider" },
      { label: "/model", hint: "Change model", value: "/model" },
      { label: "/reasoning", hint: "Set reasoning effort", value: "/reasoning" },
      { label: "/cost", hint: "Show cost", value: "/cost" },
    ],
  },
  {
    label: "Todo",
    options: [
      { label: "/todo add", hint: "Add todo", value: "/todo add" },
      { label: "/todo done", hint: "Complete todo", value: "/todo done" },
      { label: "/todo rm", hint: "Remove todo", value: "/todo rm" },
      { label: "/todo list", hint: "List todos", value: "/todo list" },
      { label: "/todo clear", hint: "Clear todos", value: "/todo clear" },
    ],
  },
  {
    label: "Other",
    options: [
      { label: "/search", hint: "Web search", value: "/search" },
      { label: "/config", hint: "Edit .aurarc config", value: "/config" },
      { label: "/plan", hint: "Toggle plan mode", value: "/plan" },
      { label: "/plan-show", hint: "Show plan", value: "/plan-show" },
      { label: "/plan-approve", hint: "Approve plan", value: "/plan-approve" },
      { label: "/mode", hint: "Show TUI mode", value: "/mode" },
      { label: "/agent", hint: "Switch agent persona", value: "/agent" },
      { label: "/mcp", hint: "MCP servers status", value: "/mcp" },
      { label: "/lsp", hint: "LSP status", value: "/lsp" },
      { label: "/lang", hint: "Switch language", value: "/lang" },
      { label: "/project", hint: "Show project info", value: "/project" },
      { label: "/plans", hint: "Show Token Plans", value: "/plans" },
      { label: "/token-plans", hint: "Show Token Plans", value: "/token-plans" },
    ],
  },
];

async function showCommandPicker(): Promise<string | null> {
  const g = pc.gray, c = pc.cyan, w = pc.white;

  const topOption: PickerOption = { label: c("Type custom command\u2026"), value: "__custom__", hint: "Manually type a command" };

  let selected = await p.select({
    message: w("Pick a command"),
    options: [
      topOption,
      ...COMMAND_CATEGORIES.flatMap(cat => [
        { label: g(cat.label), value: `__header__`, hint: "" } as { label: string; value: string; hint: string },
        ...cat.options.map(o => ({ label: c(o.label), hint: g(o.hint!), value: o.value })),
      ]),
    ],
  });

  if (p.isCancel(selected)) return null;
  if (selected === "__custom__") return "/";

  const cmd = selected as string;

  const needsArg: Record<string, string> = {
    "/add": "Enter file path to add to context:",
    "/drop": "Enter file path to remove from context:",
    "/explain": "Enter file path to explain:",
    "/refactor": "Enter file path to refactor:",
    "/gen-test": "Enter file path to generate tests for:",
    "/doc": "Enter file path to document:",
    "/undo": "Enter number of changes to undo (default 1):",
    "/save": "Enter session name (optional):",
    "/load": "Enter session name:",
    "/search": "Enter search query:",
    "/todo add": "Enter todo text:",
    "/todo done": "Enter todo ID:",
    "/todo rm": "Enter todo ID:",
  };

  if (cmd in needsArg) {
    const arg = await p.text({ message: c(needsArg[cmd]), placeholder: g("optional, press Enter to skip") });
    if (p.isCancel(arg)) return null;
    return arg ? `${cmd} ${arg}` : cmd;
  }

  return cmd;
}

async function dispatchSlash(state: ReplState, command: string, args: string): Promise<boolean> {
  const workdir = state.config.workingDirectory;
  switch (command) {
    case "/provider": case "/p": await handleProviderSwitch(state, workdir); return true;
    case "/model": case "/m": await handleModelSwitch(state, workdir); return true;
    case "/reasoning": case "/r": handleReasoningSwitch(state); return true;
    case "/cost": printCost(state); return true;
    case "/diff": await handleDiff(state); return true;
    case "/commit": await handleCommit(state); return true;
    case "/undo": handleUndo(state, args); return true;
    case "/log": await handleLog(state); return true;
    case "/branch": await handleBranch(state); return true;
    case "/changes": await handleChanges(state); return true;
    case "/add": handleAddContext(state, args); return true;
    case "/drop": handleDropContext(args); return true;
    case "/context": handleContextList(); return true;
    case "/compact": await handleCompact(state); return true;
    case "/init": handleInit(state); return true;
    case "/save": await handleSave(state, args); return true;
    case "/load": await handleLoad(state, args); return true;
    case "/resume": await handleResume(state); return true;
    case "/sessions": handleSessionsList(); return true;
    case "/export": await handleExport(state); return true;
    case "/review": await handleReview(state); return true;
    case "/test": await handleTest(state); return true;
    case "/lint": await handleLint(state); return true;
    case "/explain": await handleExplain(state, args); return true;
    case "/refactor": await handleRefactor(state); return true;
    case "/search": handleWebSearchCmd(state, args); return true;
    case "/pr": await handlePr(state); return true;
    case "/watch": await handleWatch(state); return true;
    case "/config": await handleConfig(state, workdir); return true;
    case "/plan": handlePlanToggle(state); return true;
    case "/plan-show": case "/ps": handlePlanShow(state); return true;
    case "/plan-approve": case "/pa": await handlePlanApprove(state); return true;
    case "/plan-cancel": case "/pc": handlePlanCancel(state); return true;
    case "/mode": handleModeSwitch(state); return true;
    case "/agent": await handleAgentSwitch(state); return true;
    case "/mcp": handleMCPStatus(); return true;
    case "/lsp": handleLSPStatus(); return true;
    case "/lang": await handleLocaleSwitch(); return true;
    case "/project": handleProjectInfo(state); return true;
    case "/token-plans":
    case "/plans":
      handleTokenPlans();
      return true;
    case "/todo": handleTodo(state, args); return true;
    case "/memory": handleMemory(state, args); return true;
    case "/gen-test": await handleGenTest(state, args); return true;
    case "/doc": await handleDoc(state, args); return true;
    default:
      console.log(`\n  ${pc.red("\u2717")} ${pc.red(`Unknown: ${command}`)} ${pc.gray("type 'help'")}\n`);
      return true;
  }
}

async function runRepl(state: ReplState): Promise<void> {
  printReplHeader();
  printStatusBar(state);
  const workdir = process.cwd();

  process.on("exit", () => {
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b[r");
      process.stdout.write("\x1b[?25h");
    }
  });
  process.on("SIGWINCH", () => {
    printStatusBar(state);
  });

  let sigintHandler: (() => void) | null = null;
  const setupSigint = () => {
    sigintHandler = () => {
      autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);
      state.agent.interrupt();
    };
    process.on("SIGINT", sigintHandler);
  };
  setupSigint();

  const aurarcPath = join(workdir, ".aurarc");
  if (existsSync(aurarcPath)) {
    try {
      const watcher = watch(aurarcPath, { persistent: false }, () => {
        console.log(`\n  ${pc.cyan("\u27F3")} ${pc.gray(".aurarc changed \u2014 reloading config")}`);
        const newCfg = loadConfig(workdir);
        if (newCfg) {
          Object.assign(state.config, newCfg);
        }
      });
      process.on("exit", () => watcher.close());
    } catch { /* watch not supported on all FS */ }
  }

  const MODES: Array<"chat" | "plan" | "exec"> = ["chat", "plan", "exec"];

function modePrefix(mode: "chat" | "plan" | "exec", providerColor: (s: string) => string): string {
  const arrow = providerColor(pc.bold("\u276F"));
  if (mode === "plan") return `\x1b[48;2;157;124;216m\x1b[38;2;30;30;30m  PLAN  \x1b[39m\x1b[49m ${arrow} `;
  if (mode === "exec") return `\x1b[48;2;245;167;66m\x1b[38;2;30;30;30m  EXEC  \x1b[39m\x1b[49m ${arrow} `;
  return `  ${arrow} `;
}

function nextMode(current: "chat" | "plan" | "exec"): "chat" | "plan" | "exec" {
  const idx = MODES.indexOf(current);
  return MODES[(idx + 1) % MODES.length];
}

while (true) {
    const tuiMode = state.agent.getTuiMode();
    const prefix = modePrefix(tuiMode, pColor(state.modelInfo.provider));
    let raw: string;
    const input = await promptWithAutocomplete({
      prompt: prefix,
      placeholder: nextPlaceholder(),
      workdir: state.config.workingDirectory,
    });

    if (input === null) {
      autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);
      clearScreen(); printBanner();
      console.log(pc.gray("  goodbye"));
      console.log();
      process.exit(0);
    }

    raw = (input as string).trim();

    if (raw === "\\\\plan" || raw === "\\\\p") {
      state.agent.setPlanMode(!state.agent.isPlanMode());
      console.log(`\n  ${pc.cyan("\u25C6")} ${pc.bold("PLAN MODE")} ${pc.gray(state.agent.isPlanMode() ? "enabled" : "disabled")}\n`);
      continue;
    }
    if (raw === "\\\\mode" || raw === "\\\\m") {
      state.agent.setTuiMode(nextMode(tuiMode));
      console.log(`\n  ${pc.cyan("\u25C6")} ${pc.bold("MODE")} ${pc.gray(state.agent.getTuiMode())}\n`);
      continue;
    }

    if (raw.endsWith("\\") || raw.endsWith("/ml") || (raw.includes("{") && !raw.includes("}"))) {
      let multiLine = raw;
      const edit = await editorPrompt(multiLine);
      if (edit !== null) raw = edit.trim();
    }

    if (!raw) continue;
    if (!raw) continue;

    if (raw === "exit" || raw === "quit" || raw === ":q") {
      autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);
      clearScreen(); printBanner();
      console.log(pc.gray("  goodbye"));
      console.log();
      process.exit(0);
    }

    if (raw === "clear" || raw === ":clear") {
      state.agent.reset(); clearContextFiles();
      console.log(`\n  ${pc.green("\u2713")} ${pc.gray("cleared")}\n`);
      continue;
    }
    if (raw === "status" || raw === ":status") { printStatus(state); continue; }
    if (raw === "model" || raw === ":model") { printModelInfo(state); continue; }
    if (raw === "help" || raw === ":help") { printHelp(); continue; }

    if (raw.startsWith("!")) {
      const shellCmd = raw.slice(1).trim();
      if (!shellCmd) continue;
      const { toolExecuteShell } = await import("./tools");
      console.log(`\n  ${pc.gray("$")} ${pc.gray(shellCmd)}\n`);
      const result = await toolExecuteShell(shellCmd, workdir, 30_000);
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.log(pc.red(result.stderr));
      console.log(`\n  ${pc.gray("exit " + result.exitCode)}\n`);
      continue;
    }

    if (raw.startsWith("/")) {
      if (raw === "/") {
        const picked = await showCommandPicker();
        if (!picked) continue;
        if (picked === "/") {
          const manual = await p.text({ message: pColor(state.modelInfo.provider)(pc.bold(">")), initialValue: "/" });
          if (p.isCancel(manual) || !(manual as string).trim()) continue;
          const mr = (manual as string).trim();
          if (mr.startsWith("/")) {
            const { command: mc, args: ma } = parseSlashCommand(mr);
            const handled = await dispatchSlash(state, mc, ma);
            if (handled) continue;
            raw = mr;
          } else {
            raw = mr;
          }
        } else {
          const { command: pc2, args: pa } = parseSlashCommand(picked);
          const handled = await dispatchSlash(state, pc2, pa);
          if (handled) continue;
          continue;
        }
      } else {
        const { command, args } = parseSlashCommand(raw);
        const handled = await dispatchSlash(state, command, args);
        if (handled) continue;
      }
    }

    const { processedPrompt, addedFiles, errors } = parseFileReferences(raw, workdir);
    if (errors.length > 0) {
      for (const e of errors) console.log(`  ${pc.gray(e)}`);
    }
    if (addedFiles.length > 0) {
      const fileList = addedFiles.map((f) => pc.white(f)).join(", ");
      console.log(`  ${pc.gray("files:")} ` + fileList);
    }

    if (raw.includes("@general")) {
      const taskMatch = raw.match(/@general\s+(.+)/s);
      const task = taskMatch ? taskMatch[1].trim() : processedPrompt;
      const spinner = ora({ text: "Spawning subagent...", spinner: "dots" }).start();
      const result = await runSubagent(state.config, task, workdir);
      spinner.stop();
      console.log();
      console.log(`  ${pc.green("\u25A3")} ${pc.gray("subagent done")} ${pc.gray(`(${result.iterations} iters, ${result.tokensUsed} tokens)`)}`);
      console.log(`\n${result.output}\n`);
      continue;
    }

    const runTuiMode = state.agent.getTuiMode();
    const prevPlanMode = state.agent.isPlanMode();
    const prevAutoConfirm = state.config.autoConfirm;
    if (runTuiMode === "plan") state.agent.setPlanMode(true);
    if (runTuiMode === "exec") (state.config as { autoConfirm: boolean }).autoConfirm = true;

    const APPROVE_TRIGGERS = /^(do it|go|давай|выполняй|делай|approve|yes|yep|y|ок|окей|go ahead|proceed|execute|run it)\.?$/i;
    if (APPROVE_TRIGGERS.test(raw.trim()) && state.agent.getCurrentPlan()) {
      const plan = state.agent.getCurrentPlan();
      state.agent.setPlanMode(false);
      state.agent.setCurrentPlan(null);
      const summary = `Approved plan: ${plan?.summary ?? ""}\n${(plan?.steps ?? []).map((s, i) => `${i + 1}. [${s.action}] ${s.file ?? ""} \u2014 ${s.description}`).join("\n")}\n\nNow execute this plan.`;
      console.log(`\n  ${pc.green("\u2713")} ${pc.gray("Plan approved. Executing...")}\n`);
      await state.agent.run(summary);
      autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);
      console.log();
      continue;
    }

    try {
      await state.agent.run(processedPrompt);
    } finally {
      if (runTuiMode === "plan") state.agent.setPlanMode(prevPlanMode);
      if (runTuiMode === "exec") (state.config as { autoConfirm: boolean }).autoConfirm = prevAutoConfirm;
    }
    autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);
    printStatusBar(state);
  }
}

async function main(): Promise<void> {
  if (typeof Bun === "undefined") {
    console.error(pc.red("Requires Bun runtime. https://bun.sh"));
    process.exit(1);
  }

  const { setLocale, detectLocale } = await import("./highlight");
  setLocale(detectLocale());

  const parsed = parseArgs(process.argv);

  if (parsed.showVersion) { printBanner(); process.exit(0); }
  if (parsed.showHelp) { printBanner(); printHelp(); process.exit(0); }

  const workdir = process.cwd();
  printBanner();
  const firstRun = !loadGlobalSettings().lastProvider && !loadConfig(workdir)?.provider;
  if (firstRun && !parsed.provider) printWelcome();

  startMCPServers(workdir).then(servers => {
    if (servers.length > 0) console.log(`  ${pc.cyan("\u25C6")} ${pc.gray(`MCP: ${servers.length} server${servers.length > 1 ? "s" : ""} started`)}`);
  }).catch(() => {});
  startLSP(workdir).then(lsp => {
    if (lsp) console.log(`  ${pc.cyan("\u25C6")} ${pc.gray("LSP started")}`);
  }).catch(() => {});
  process.on("exit", () => { stopMCPServers(); stopLSP(); });

  const savedConfig = loadConfig(workdir);
  const globalSettings = loadGlobalSettings();

  let provider: Provider;
  if (parsed.provider) {
    provider = parsed.provider;
  } else if (savedConfig?.provider) {
    provider = savedConfig.provider;
    console.log(`  ${pc.gray("config:")} ${pc.gray(savedConfig.provider)}`);
  } else if (globalSettings.lastProvider && PROVIDER_LIST.includes(globalSettings.lastProvider as Provider)) {
    provider = globalSettings.lastProvider as Provider;
    console.log(`  ${pc.gray("restored:")} ${pBadge(provider)}`);
  } else {
    const detected = PROVIDER_LIST.find((pr) => getApiKeyFromEnv(pr));
    if (detected) {
      provider = detected;
      console.log(`  ${pc.gray("detected")} ${pBadge(provider)}`);
    } else {
      const sel = await selectProvider();
      if (!sel) { console.log(`\n  ${pc.red("\u2717")} ${pc.red("No provider")}\n`); process.exit(1); }
      provider = sel;
    }
  }

  const apiKey = await getApiKeyForProvider(provider, globalSettings);
  if (!apiKey) {
    console.log(`\n  ${pc.red("✗")} ${pc.red(`Set ${PROVIDERS[provider].apiKeyEnv[0]}`)}\n`);
    process.exit(1);
  }

  if (parsed.listModels) {
    const { getCuratedModels, fetchFireworksModels } = await import("./models");
    if (provider === "fireworks") {
      const spinner = ora({ text: "Fetching models from Fireworks API...", spinner: "dots" }).start();
      try {
        const live = await fetchFireworksModels(apiKey);
        spinner.stop();
        if (live.length === 0) {
          console.log(`  ${pc.yellow("\u26A0")}  ${pc.dim("No live models, using curated list")}`);
          console.log();
          printModelTable(getCuratedModels("fireworks"));
        } else {
          console.log(`  ${pc.green("\u2713")} ${pc.dim(live.length + " models loaded")}`);
          console.log();
          printModelTable(live);
        }
      } catch (e) {
        console.log(`  ${pc.yellow("⚠")}  ${pc.gray(e instanceof Error ? e.message : String(e))}`);
        console.log(`  ${pc.gray("Curated list:")}\n`);
        printModelTable(getCuratedModels("fireworks"));
      }
    } else {
      console.log(`\n  ${pColor(provider)("◆")} ${pc.gray(`${PROVIDERS[provider].label} models:`)}\n`);
      printModelTable(getCuratedModels(provider));
    }
    process.exit(0);
  }

  const modelFromSettings = globalSettings.lastModel && globalSettings.lastProvider === provider ? globalSettings.lastModel : null;

  let customBaseURL: string | undefined;
  let modelInfo: ModelInfo | null = null;

  if (parsed.model) {
    modelInfo = { id: parsed.model, label: parsed.model.split("/").pop() ?? parsed.model, description: "", contextLength: null, supportsTools: true, supportsVision: false, supportsReasoning: PROVIDERS[provider].supportsReasoning, provider };
  } else if (savedConfig?.model) {
    modelInfo = { id: savedConfig.model, label: savedConfig.model.split("/").pop() ?? savedConfig.model, description: "", contextLength: null, supportsTools: true, supportsVision: false, supportsReasoning: PROVIDERS[provider].supportsReasoning, provider };
  } else if (modelFromSettings) {
    modelInfo = { id: modelFromSettings, label: modelFromSettings.split("/").pop() ?? modelFromSettings, description: "", contextLength: null, supportsTools: true, supportsVision: false, supportsReasoning: PROVIDERS[provider].supportsReasoning, provider };
  } else if (isCustomProvider(provider)) {
    const baseURLInput = await p.text({
      message: `${pBadge(provider)} Enter API base URL`,
      placeholder: "https://api.example.com/v1",
      validate: (v) => { if (!v?.trim()) return "Required"; if (!v?.startsWith("http")) return "Must start with http:// or https://"; return undefined; },
    });
    if (p.isCancel(baseURLInput)) process.exit(1);
    customBaseURL = (baseURLInput as string).trim().replace(/\/$/, "");

    const modelName = await p.text({
      message: `${pBadge(provider)} Enter model name`,
      placeholder: "gpt-4o",
      validate: (v) => { if (!v?.trim()) return "Required"; return undefined; },
    });
    if (p.isCancel(modelName)) process.exit(1);
    modelInfo = { id: (modelName as string).trim(), label: (modelName as string).trim(), description: `Custom model for ${PROVIDERS[provider].label}`, contextLength: null, supportsTools: true, supportsVision: false, supportsReasoning: PROVIDERS[provider].supportsReasoning, provider };
  } else {
    modelInfo = await selectModelInteractive(provider, apiKey);
  }

  if (!modelInfo) { console.log(`\n  ${pc.red("\u2717")} ${pc.red("No model")}\n`); process.exit(1); }

  let reasoning: ReasoningEffort = parsed.reasoning ?? savedConfig?.reasoningEffort ?? (globalSettings.lastReasoning as ReasoningEffort | null) ?? "off";
  if (reasoning === "off" && PROVIDERS[provider].supportsReasoning && !parsed.model && !savedConfig?.reasoningEffort && !globalSettings.lastReasoning) {
    const r = await selectReasoning(provider);
    if (r) reasoning = r;
  }

  const autoConfirm = parsed.autoConfirm || savedConfig?.autoConfirm || false;

  if (savedConfig?.contextFiles) {
    for (const f of savedConfig.contextFiles) {
      addContextFile(f, workdir);
    }
  }

  clearScreen();
  printBanner();
  printSessionInfo(workdir, modelInfo, reasoning);

  const config = buildConfig(provider, apiKey, modelInfo.id, autoConfirm, workdir, reasoning, modelInfo.contextLength, customBaseURL);
  const confirmFn = createConfirmFn(config.autoConfirm);
  const askUserFn = createAskUserFn();
  const agent = new Agent(config, confirmFn, askUserFn);
  const projectInfo = detectProjectType(workdir);
  agent.setLintCmd(projectInfo.lintCmd);
  agent.setTestCmd(projectInfo.testCmd);

  const keyFromEnv = getApiKeyFromEnv(provider);
  saveGlobalSettings({
    lastProvider: provider,
    lastModel: modelInfo.id,
    lastReasoning: reasoning,
    lastApiKey: keyFromEnv ? null : apiKey,
    lastApiKeyProvider: keyFromEnv ? null : provider,
  });

  if (parsed.instruction) {
    const { processedPrompt } = parseFileReferences(parsed.instruction, workdir);
    await runAtomic(agent, processedPrompt, modelInfo, reasoning);
  } else {
    const sessions = listSessionsDetailed();
    if (sessions.length > 0) {
      const resume = await p.confirm({
        message: pc.white("Resume a previous session?"),
        initialValue: false,
      });
      if (!p.isCancel(resume) && resume) {
        const options = buildSessionOptions(sessions);
        const selected = await p.select({
          message: "Choose session:",
          options,
        });
        if (!p.isCancel(selected) && selected !== "\0separator") {
          const name = selected as string;
          const data = loadSession(name);
          if (data) {
            agent.setConversation(data.conversation as ReturnType<Agent["getConversation"]>);
            if (data.reasoningEffort) config.reasoningEffort = data.reasoningEffort;
            console.log(`\n  ${pc.green("✓")} ${pc.green(`Resumed: ${name}`)} ${pc.gray(`(${data.conversation.length} messages)`)}`);
            printPreviousConversation(data.conversation);
          }
        }
      }
    }
    await runRepl({ agent, modelInfo, config, confirmFn, askUserFn });
  }
}

function printModelTable(models: ModelInfo[]): void {
  const t = new Table({
    style: { head: ["cyan"], border: ["gray"] },
    chars: { "top": "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐",
             "bottom": "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘",
             "left": "│", "left-mid": "├", "mid": "─", "mid-mid": "┼",
             "right": "│", "right-mid": "┤" },
    colWidths: [48, 20, 6, 6, 6, 10],
  });
  t.push([pc.bold("ID"), pc.bold("Name"), pc.bold("T"), pc.bold("V"), pc.bold("R"), pc.bold("Context")]);
  for (const m of models) {
    const c = pColor(m.provider);
    const tIcon = m.supportsTools ? pc.green("\u2713") : pc.dim("\u00B7");
    const vIcon = m.supportsVision ? pc.green("\u2713") : pc.dim("\u00B7");
    const rIcon = m.supportsReasoning ? pc.green("\u2713") : pc.dim("\u00B7");
    const ctx = m.contextLength
      ? (m.contextLength >= 1_000_000
          ? (m.contextLength / 1_000_000).toFixed(0) + "M"
          : Math.round(m.contextLength / 1000) + "K")
      : pc.dim("\u2014");
    const idD = m.id.length > 46 ? m.id.slice(0, 44) + pc.dim("\u2026") : m.id;
    t.push([pc.dim(idD), c(m.label), tIcon, vIcon, rIcon, ctx]);
  }
  console.log();
  console.log(sectionInline("Available Models"));
  console.log(t.toString());
}

main().catch((e: unknown) => {
  console.error(`\n  ${pc.red("✗")} ${pc.red("Fatal:")} ${pc.red(e instanceof Error ? e.message : String(e))}\n`);
  process.exit(1);
});
