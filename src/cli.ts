#!/usr/bin/env bun
import * as p from "@clack/prompts";
import pc from "picocolors";
import ora from "ora";
import boxen from "boxen";
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
import { loadConfig, detectProjectType, formatProjectInfo } from "./config";
import { runSubagent } from "./subagent";
import { createPullRequest, isGhInstalled, generatePrBody } from "./pr";
import { FileWatcher, type WatchEvent } from "./watcher";
import { webSearch } from "./diff";
import { addTodo, updateTodoStatus, removeTodo, clearTodos, printTodos } from "./todo";
import { printTokenPlans, checkSubscriptionKey, getSetupInstructions } from "./tokenplan";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = "2.1.0";

const BANNER_LINES = [
  "",
  `  ${pc.cyan("\u2588\u2580\u2588\u2580\u2580\u2580\u2580\u2557")}${pc.magenta("\u2588\u2588\u2557")}   ${pc.magenta("\u2588\u2588\u2557")}${pc.cyan("\u2588\u2588\u2588\u2588\u2588\u2588\u2557")}${pc.magenta("\u2588\u2588\u2588\u2588\u2588\u2588\u2557")} ${pc.cyan("\u2588\u2588\u2588\u2588\u2588\u2557")}  `,
  `  ${pc.cyan("\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D")}${pc.magenta("\u2588\u2588\u2551")}   ${pc.magenta("\u2588\u2588\u2551")}${pc.cyan("\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D")}${pc.magenta("\u2588\u2588\u2554\u2550\u2550\u2550\u255D")}${pc.cyan("\u2588\u2588\u2554\u2550\u2550\u2550\u255D")} `,
  `  ${pc.cyan("\u2588\u2588\u2588\u2588\u2588\u2588\u2557")}${pc.magenta("\u2588\u2588\u2551")}   ${pc.magenta("\u2588\u2588\u2551")}${pc.cyan("\u2588\u2588\u2588\u2588\u2588\u2588\u2557")}${pc.magenta("\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u2557")}${pc.cyan("\u2588\u2588\u2588\u2588\u2588\u2588\u2551")} `,
  `  ${pc.cyan("\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D")}${pc.magenta("\u2588\u2588\u2551")}   ${pc.magenta("\u2588\u2588\u2551")}${pc.cyan("\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D")}${pc.magenta("\u2588\u2588\u2554\u2550\u2550\u2550\u255D")}${pc.cyan("\u2588\u2588\u2554\u2550\u2550\u2550\u255D")} `,
  `  ${pc.cyan("\u2588\u2588\u2551")}  ${pc.cyan("\u2588\u2588\u2551")}${pc.magenta("\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u255D")}${pc.magenta("\u255A\u2588\u2588\u2588\u2588\u2588\u255D")}${pc.cyan("\u2588\u2588\u2551")}  ${pc.cyan("\u2588\u2588\u2551")}${pc.magenta("\u2588\u2588\u2551")}  ${pc.magenta("\u2588\u2588\u2551")} `,
  `  ${pc.cyan("\u255A\u2550\u255D")}  ${pc.cyan("\u255A\u2550\u255D")}${pc.magenta(" \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D")} ${pc.magenta("\u255A\u2550\u2550\u2550\u2550\u2550\u255D")}${pc.cyan("\u255A\u2550\u255D")}  ${pc.cyan("\u255A\u2550\u255D")}${pc.magenta("\u255A\u2550\u255D")}  ${pc.magenta("\u255A\u2550\u255D")} `,
  "",
  `  ${pc.dim(pc.white("autonomous ai coding agent"))}  ${pc.bold(pc.magenta("v" + VERSION))}`,
  `  ${pc.dim("github.com/rut123321/aura-core")}`,
  "",
];

function clearScreen(): void {
  process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
}

function pColor(provider: Provider): (s: string) => string {
  return PROVIDERS[provider].color;
}

function pBadge(provider: Provider): string {
  const c = PROVIDERS[provider].color;
  return c(PROVIDERS[provider].label);
}

function infoBox(title: string, text: string, color: string = "cyan"): string {
  return boxen(text, {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 0, bottom: 0, left: 2, right: 0 },
    borderColor: color as "cyan" | "green" | "yellow" | "red" | "magenta" | "blue" | "white",
    borderStyle: "round",
    title,
    titleAlignment: "left",
  });
}

function reasonBadge(effort: ReasoningEffort): string {
  if (effort === "off") return pc.gray("off");
  const colors: Record<string, (s: string) => string> = {
    low: pc.green, medium: pc.yellow, high: pc.magenta, max: pc.red,
  };
  return (colors[effort] ?? pc.gray)(effort);
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
  for (const line of BANNER_LINES) {
    console.log(line);
  }
}

function printHelp(): void {
  const g = pc.gray, c = pc.cyan, b = pc.bold;
  const lines = [
    "",
    b(g("  ═══════════════════════════════════════════════")),
    b(g("   USAGE")),
    g("    aura") + g(" [options]") + g(" [instruction]"),
    "",
    b(g("  ═══════════════════════════════════════════════")),
    b(g("   OPTIONS")),
    g("    -p, --provider") + c("    AI provider") + g("  (") + g(PROVIDER_LIST.map(p => PROVIDERS[p].label).join(" · ")) + g(")"),
    g("    -m, --model") + c("       Model ID"),
    g("    -r, --reasoning") + c("   Reasoning:") + g(" off · low · medium · high · max"),
    g("    -y, --yes") + c("         Auto-confirm all actions"),
    g("    -l, --list-models") + c("  List available models"),
    g("    -h, --help") + c("        Show this help"),
    g("    -v, --version") + c("     Show version"),
    "",
    b(g("  ═══════════════════════════════════════════════")),
    b(g("   / COMMANDS")),
    "",
    b(c("   Git & PR")),
    g("    /diff       ") + g("Show uncommitted changes"),
    g("    /commit     ") + g("AI commit message + commit"),
    g("    /undo [n]   ") + g("Revert last AI change(s)"),
    g("    /log        ") + g("Recent commits"),
    g("    /branch     ") + g("List/switch/create branches"),
    g("    /changes    ") + g("Changed files summary"),
    g("    /pr         ") + g("Create GitHub Pull Request"),
    "",
    b(c("   Code Quality")),
    g("    /review     ") + g("AI review of changes"),
    g("    /test       ") + g("Run tests (auto-detected)"),
    g("    /lint       ") + g("Run linter (auto-detected)"),
    g("    /explain    ") + g("Explain code in a file"),
    g("    /refactor   ") + g("AI refactoring suggestions"),
    g("    /gen-test   ") + g("Generate tests for a file"),
    g("    /doc        ") + g("Generate documentation"),
    g("    /watch      ") + g("Auto-run tests on file changes"),
    "",
    b(c("   Context & Memory")),
    g("    /add  <f>   ") + g("Add file to persistent context"),
    g("    /drop <f>   ") + g("Remove file from context"),
    g("    /context    ") + g("List context files"),
    g("    /compact    ") + g("Compact conversation history"),
    g("    /init       ") + g("Create AURA.md project context"),
    g("    /memory     ") + g("Show/edit agent memory"),
    "",
    b(c("   Sessions")),
    g("    /save  [n]  ") + g("Save session"),
    g("    /load  [n]  ") + g("Load session"),
    g("    /resume     ") + g("Pick a saved session"),
    g("    /sessions   ") + g("List saved sessions"),
    g("    /export     ") + g("Export to Markdown"),
    "",
    b(c("   Provider & Model")),
    g("    /provider   ") + g("Switch AI provider"),
    g("    /model      ") + g("Change model"),
    g("    /reasoning  ") + g("Set reasoning effort"),
    g("    /cost       ") + g("Show session cost"),
    "",
    b(c("   Todo")),
    g("    /todo add  ") + g("<text>  Add todo item"),
    g("    /todo done ") + g("<id>    Mark complete"),
    g("    /todo rm   ") + g("<id>    Remove todo"),
    g("    /todo list ") + g("List todos"),
    g("    /todo clear") + g("Clear all todos"),
    "",
    b(c("   Other")),
    g("    /search    ") + g("Web search"),
    g("    /project   ") + g("Show detected project info"),
    g("    /plans     ") + g("Show Token Plans"),
    g("    /token-plans") + g("Show Token Plans"),
    "",
    b(g("  ═══════════════════════════════════════════════")),
    b(c("   BUILT-IN SHORTCUTS")),
    g("    @filename   ") + g("Inline file reference"),
    g("    @general    ") + g("Spawn subagent for task"),
    g("    !<command>  ") + g("Run shell command directly"),
    g("    model       ") + g("Show model info"),
    g("    status      ") + g("Show session status"),
    g("    clear       ") + g("Clear conversation"),
    g("    help        ") + g("Show this help"),
    g("    exit        ") + g("Exit session"),
    "",
    g("  ") + g("Type") + c(" /") + g(" at the prompt to open the command picker."),
    "",

  ];
  console.log(lines.join("\n"));
}

function printSessionInfo(workdir: string, model: ModelInfo, effort: ReasoningEffort): void {
  const c = pColor(model.provider);
  console.log();
  console.log(`  ${pc.gray("\u2503")} ${pc.bold(c(model.label))} ${pc.gray(model.id)}`);
  if (model.contextLength) {
    console.log(`  ${pc.gray("\u2503")} ${pc.gray("context")} ${pc.white(model.contextLength.toLocaleString())} ${pc.gray("tokens")}`);
  }
  if (effort !== "off") {
    console.log(`  ${pc.gray("\u2503")} ${pc.gray("reasoning")} ${reasonBadge(effort)}`);
  }
  console.log(`  ${pc.gray("\u2503")} ${pc.gray(workdir)}`);
  const initFile = loadInitFile(workdir);
  if (initFile) {
    console.log(`  ${pc.gray("\u2503")} ${pc.gray("AURA.md loaded")}`);
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
  const g = pc.gray, c = pc.cyan;
  console.log(g("  ") + c("\u25C9 ") + g("ready") + g(" \u00B7 ") + g("type your task or") + c(" /") + g(" for commands"));
  console.log();
}

function printStatusBar(state: ReplState): void {
  const usage = state.agent.getTokenUsage();
  const ctxLen = state.config.contextLength;
  const totalTokens = usage.total;
  const pct = ctxLen && ctxLen > 0 ? Math.min(100, (totalTokens / ctxLen) * 100) : 0;
  const cost = state.agent.getCost();
  const shortModel = state.modelInfo.label;
  const c = pColor(state.modelInfo.provider);

  const modelTag = c(pc.bold(shortModel));
  const providerTag = pc.gray(PROVIDERS[state.config.provider].label);

  const parts: string[] = [modelTag, providerTag];

  if (state.config.reasoningEffort !== "off") {
    parts.push(reasonBadge(state.config.reasoningEffort));
  }

  if (ctxLen && ctxLen > 0 && totalTokens > 0) {
    const barLen = 10;
    const filled = Math.round((pct / 100) * barLen);
    const bar = pc.green("\u2588".repeat(filled)) + pc.gray("\u2588".repeat(barLen - filled));
    parts.push(pc.gray(`ctx ${bar} ${pct.toFixed(0)}%`));
  }

  if (cost.total > 0) {
    parts.push(pc.gray(fmtCost(cost.total)));
  }

  const historyLen = state.agent.getHistoryLength();
  if (historyLen > 0) {
    parts.push(pc.gray(`${historyLen} msgs`));
  }

  console.log(pc.gray("  \u2500") + " " + parts.join(pc.gray(" \u00B7 ")));
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
    validate: (v) => { if (!v.trim()) return "Required"; return undefined; },
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
      validate: (v) => { if (!v.trim()) return "Required"; if (!v.trim().startsWith("http")) return "Must start with http:// or https://"; return undefined; },
    });
    if (p.isCancel(baseURLInput)) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
    customBaseURL = (baseURLInput as string).trim().replace(/\/$/, "");
    const modelName = await p.text({
      message: `${pBadge(newProvider)} Enter model name`,
      placeholder: "gpt-4o",
      validate: (v) => { if (!v.trim()) return "Required"; return undefined; },
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
      validate: (v) => { if (!v.trim()) return "Required"; return undefined; },
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
  const t = new Table({
    style: { head: ["cyan"], border: ["gray"] },
    chars: { "top": "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐",
             "bottom": "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘",
             "left": "│", "left-mid": "├", "mid": "─", "mid-mid": "┼",
             "right": "│", "right-mid": "┤" },
    colWidths: [16, 50],
  });
  t.push([pc.bold("Property"), pc.bold("Value")]);
  t.push(["Model", c(model.label)]);
  t.push(["ID", pc.dim(model.id)]);
  if (ctxLen) t.push(["Context", fmtTokens(ctxLen) + " tokens"]);
  t.push(["Tools", model.supportsTools ? pc.green("✓") : pc.red("✗")]);
  t.push(["Vision", model.supportsVision ? pc.green("✓") : pc.red("✗")]);
  t.push(["Reasoning", model.supportsReasoning ? pc.green("✓") : pc.red("✗") + " (" + reasonBadge(state.config.reasoningEffort) + ")"]);
  if (usage.total > 0) t.push(["Tokens used", fmtTokens(usage.total)]);
  console.log();
  console.log(`  ${pc.bold("Model Info")}`);
  console.log(t.toString());
}

function printStatus(state: ReplState): void {
  const usage = state.agent.getTokenUsage();
  const cost = state.agent.getCost();
  const ctxFiles = getContextFiles();
  const modifiedFiles = state.agent.getModifiedFiles();
  const t = new Table({
    style: { head: ["cyan"], border: ["gray"] },
    chars: { "top": "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐",
             "bottom": "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘",
             "left": "│", "left-mid": "├", "mid": "─", "mid-mid": "┼",
             "right": "│", "right-mid": "┤" },
    colWidths: [16, 60],
  });
  t.push([pc.bold("Property"), pc.bold("Value")]);
  t.push(["Model", pColor(state.modelInfo.provider)(state.modelInfo.label)]);
  t.push(["Provider", pc.dim(PROVIDERS[state.config.provider].label)]);
  t.push(["Reasoning", reasonBadge(state.config.reasoningEffort)]);
  t.push(["History", String(state.agent.getHistoryLength()) + " messages"]);
  t.push(["Tokens", fmtTokens(usage.total)]);
  if (cost.total > 0) t.push(["Cost", fmtCost(cost.total)]);
  if (ctxFiles.length > 0) t.push(["Context files", ctxFiles.map(f => f.path).join(", ")]);
  if (modifiedFiles.length > 0) t.push(["Modified", String(modifiedFiles.length) + " files"]);
  t.push(["Directory", pc.dim(process.cwd())]);
  console.log();
  console.log(`  ${pc.bold("Session Status")}`);
  console.log(t.toString());
}

function printCost(state: ReplState): void {
  const cost = state.agent.getCost();
  const usage = state.agent.getTokenUsage();
  const t = new Table({
    style: { head: ["cyan"], border: ["gray"] },
    chars: { "top": "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐",
             "bottom": "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘",
             "left": "│", "left-mid": "├", "mid": "─", "mid-mid": "┼",
             "right": "│", "right-mid": "┤" },
    colWidths: [14, 16],
  });
  t.push([pc.bold("Tokens"), pc.bold("Count")]);
  t.push(["Input", fmtTokens(usage.input)]);
  t.push(["Output", fmtTokens(usage.output)]);
  t.push([pc.bold("Total"), pc.bold(fmtTokens(usage.total))]);
  if (cost.total > 0) {
    t.push([pc.bold("Cost"), pc.bold("")]);
    t.push(["Input $", fmtCost(cost.input)]);
    t.push(["Output $", fmtCost(cost.output)]);
    t.push([pc.green("Total $"), pc.green(fmtCost(cost.total))]);
  }
  console.log();
  console.log(`  ${pc.bold("Cost Breakdown")}`);
  console.log(t.toString());
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
  console.log(`  ${pc.gray("◆")} ${pc.bold("Recent Commits")}`);
  
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
  console.log(`  ${pc.gray("◆")} ${pc.bold("Branches")}`);
  
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
    const nameInput = await p.text({ message: "New branch name:", validate: (v) => { if (!v.trim()) return "Required"; return undefined; } });
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
  console.log(`  ${pc.gray("◆")} ${pc.bold("Changes")}`);
  
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
  console.log(`  ${pc.gray("◆")} ${pc.bold("Context Files")}`);
  
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
  const result = createInitFile(state.config.workingDirectory);
  console.log(`\n  ${result.success ? pc.green("✓") : pc.yellow("⚠")}  ${result.success ? pc.green(result.message) : pc.yellow(result.message)}`);
  if (result.success) {
    console.log(`  ${pc.gray("Edit")} ${pc.white("AURA.md")} ${pc.gray("to add project context for the AI agent.")}`);
  }
  console.log();
}

async function handleSave(state: ReplState, args: string): Promise<void> {
  let name = args.trim();
  if (!name) {
    const input = await p.text({ message: "Session name:", validate: (v) => { if (!v.trim()) return "Required"; return undefined; } });
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
  console.log(`  ${pc.bold("Saved Sessions")}`);

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
  const input = await p.text({ message: "Export filename:", defaultValue: "aura-export.md", validate: (v) => { if (!v.trim()) return "Required"; return undefined; } });
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
  console.log(`\n  ${pc.gray("◆")} ${pc.gray("Reviewing changes...")}\n`);
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

  console.log(`\n  ${pc.gray("◆")} ${pc.gray("Running tests:")} ${pc.white(cmd)}\n`);
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

  console.log(`\n  ${pc.gray("◆")} ${pc.gray("Running linter:")} ${pc.white(cmd)}\n`);
  await state.agent.run(`Run the linter for this project. Use execute_shell to run: ${cmd}. If there are lint errors, fix them.`);
  console.log();
}

async function handleExplain(state: ReplState, args: string): Promise<void> {
  if (!args) { console.log(`\n  ${pc.gray("Usage: /explain <file>")}\n`); return; }
  const workdir = state.config.workingDirectory;
  const { existsSync: ex } = await import("node:fs");
  const { join: jp } = await import("node:path");
  if (!ex(jp(workdir, args))) { console.log(`\n  ${pc.red("✗")} ${pc.red(`File not found: ${args}`)}\n`); return; }
  console.log(`\n  ${pc.gray("◆")} ${pc.gray("Explaining:")} ${pc.white(args)}\n`);
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
  const workdir = process.cwd();

  let sigintHandler: (() => void) | null = null;
  const setupSigint = () => {
    sigintHandler = () => {
      autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);
      state.agent.interrupt();
    };
    process.on("SIGINT", sigintHandler);
  };
  setupSigint();

  while (true) {
    printStatusBar(state);
    const prefix = pColor(state.modelInfo.provider)(pc.bold(">"));
    const input = await p.text({
      message: prefix,
      placeholder: nextPlaceholder(),
    });

    if (p.isCancel(input)) {
      autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);
      clearScreen(); printBanner();
      console.log(pc.gray("  goodbye"));
      console.log();
      process.exit(0);
    }

    let raw = (input as string).trim();
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

    await state.agent.run(processedPrompt);
    console.log();
    autoSaveSession(state.agent, state.modelInfo, state.config.reasoningEffort);
    
    console.log();
  }
}

async function main(): Promise<void> {
  if (typeof Bun === "undefined") {
    console.error(pc.red("Requires Bun runtime. https://bun.sh"));
    process.exit(1);
  }

  const parsed = parseArgs(process.argv);

  if (parsed.showVersion) { printBanner(); process.exit(0); }
  if (parsed.showHelp) { printBanner(); printHelp(); process.exit(0); }

  const workdir = process.cwd();
  printBanner();

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
      validate: (v) => { if (!v.trim()) return "Required"; if (!v.trim().startsWith("http")) return "Must start with http:// or https://"; return undefined; },
    });
    if (p.isCancel(baseURLInput)) process.exit(1);
    customBaseURL = (baseURLInput as string).trim().replace(/\/$/, "");

    const modelName = await p.text({
      message: `${pBadge(provider)} Enter model name`,
      placeholder: "gpt-4o",
      validate: (v) => { if (!v.trim()) return "Required"; return undefined; },
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
  console.log(`  ${pc.bold("Available Models")}`);
  console.log(t.toString());
}

main().catch((e: unknown) => {
  console.error(`\n  ${pc.red("✗")} ${pc.red("Fatal:")} ${pc.red(e instanceof Error ? e.message : String(e))}\n`);
  process.exit(1);
});
