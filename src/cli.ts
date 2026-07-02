#!/usr/bin/env bun
import * as p from "@clack/prompts";
import pc from "picocolors";
import { Agent } from "./agent";
import { selectModelInteractive } from "./models";
import {
  DEFAULT_CONFIG,
  PROVIDER_LIST,
  PROVIDERS,
  REASONING_LABELS,
} from "./types";
import type { AgentConfig, ConfirmFn, ModelInfo, Provider, ReasoningEffort } from "./types";
import {
  isGitRepo, getGitDiff, getGitDiffStat, gitCommit, gitUndo,
  gitLog, gitBranch, gitCheckout, gitCreateBranch, gitChangesSummary,
} from "./git";
import {
  saveSession, loadSession, listSessions, listSessionsDetailed, exportSessionMarkdown, getSessionDir,
  loadGlobalSettings, saveGlobalSettings,
} from "./session";

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

const VERSION = "2.0.0";

const BANNER = [
  "",
  "          " + pc.gray("\u2588\u2580\u2588 ") + pc.bold("aura") + pc.gray("-") + pc.bold("core"),
  "          " + pc.gray("the autonomous ai coding agent"),
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
  console.log(BANNER.join("\n"));
  console.log("          " + pc.gray("v" + VERSION) + pc.gray("  \xB7  ") + pc.gray("github.com/aura-core"));
}

function printHelp(): void {
  const lines = [
    "",
    pc.bold("  Usage"),
    `    ${pc.white("aura")} ${pc.gray("[options]")} ${pc.gray("[instruction]")}`,
    "",
    pc.bold("  Options"),
    `    ${pc.gray("-p, --provider")}     ${pc.gray("MiniMax | fireworks | anthropic | openai | groq | deepseek | together | openrouter | mistral | cerebras")}`,
    `    ${pc.gray("-m, --model")}        ${pc.gray("Specify model ID")}`,
    `    ${pc.gray("-r, --reasoning")}    ${pc.gray("off | low | medium | high | max")}`,
    `    ${pc.gray("-y, --yes")}          ${pc.gray("Auto-confirm all actions")}`,
    `    ${pc.gray("-l, --list-models")}  ${pc.gray("List available models and exit")}`,
    `    ${pc.gray("-h, --help")}         ${pc.gray("Show this help")}`,
    `    ${pc.gray("-v, --version")}      ${pc.gray("Show version")}`,
    "",
    pc.bold("  Git"),
    `    ${pc.magenta("/diff")}     ${pc.gray("Show uncommitted changes")}`,
    `    ${pc.magenta("/commit")}   ${pc.gray("AI commit message + commit")}`,
    `    ${pc.magenta("/undo")}     ${pc.gray("Revert last AI change")}`,
    `    ${pc.magenta("/log")}      ${pc.gray("Recent commits")}`,
    `    ${pc.magenta("/branch")}   ${pc.gray("List/switch/create branches")}`,
    `    ${pc.magenta("/changes")}  ${pc.gray("Changed files summary")}`,
    "",
    pc.bold("  Context"),
    `    ${pc.magenta("/add")}      ${pc.gray("<file>  Add to persistent context")}`,
    `    ${pc.magenta("/drop")}     ${pc.gray("<file>  Remove from context")}`,
    `    ${pc.magenta("/context")}  ${pc.gray("List context files")}`,
    `    ${pc.magenta("/compact")}  ${pc.gray("Compact conversation history")}`,
    `    ${pc.magenta("/init")}     ${pc.gray("Create AURA.md project context")}`,
    `    ${pc.gray("@filename")}    ${pc.gray("Inline file reference in prompt")}`,
    "",
    pc.bold("  Sessions"),
    `    ${pc.magenta("/save")}     ${pc.gray("[name]  Save session")}`,
    `    ${pc.magenta("/load")}     ${pc.gray("[name]  Load session")}`,
    `    ${pc.magenta("/resume")}   ${pc.gray("Pick a saved session to resume")}`,
    `    ${pc.magenta("/sessions")} ${pc.gray("List saved sessions")}`,
    `    ${pc.magenta("/export")}   ${pc.gray("Export to Markdown")}`,
    "",
    pc.bold("  Quality"),
    `    ${pc.magenta("/review")}   ${pc.gray("AI review of recent changes")}`,
    `    ${pc.magenta("/test")}     ${pc.gray("Run tests (auto-detected)")}`,
    `    ${pc.magenta("/lint")}     ${pc.gray("Run linter (auto-detected)")}`,
    `    ${pc.magenta("/explain")}  ${pc.gray("<file>  Explain code in file")}`,
    `    ${pc.magenta("/refactor")} ${pc.gray("AI refactoring suggestions")}`,
    `    ${pc.magenta("/gen-test")} ${pc.gray("<file>  Generate tests for file")}`,
    `    ${pc.magenta("/doc")}      ${pc.gray("<file>  Generate documentation")}`,
    `    ${pc.magenta("/search")}   ${pc.gray("<query>  Web search")}`,
    `    ${pc.magenta("/pr")}       ${pc.gray("Create GitHub PR")}`,
    `    ${pc.magenta("/watch")}    ${pc.gray("Auto-run tests on file changes")}`,
    `    ${pc.magenta("/project")}  ${pc.gray("Show detected project info")}`,
    "",
    pc.bold("  Todo & Memory"),
    `    ${pc.magenta("/todo")}     ${pc.gray("add <text> | done <id> | rm <id> | list | clear")}`,
    `    ${pc.magenta("/memory")}   ${pc.gray("Show/edit agent memory (MEMORY.md)")}`,
    "",
    pc.bold("  Config"),
    `    ${pc.magenta("/provider")}  ${pc.gray("Switch provider + model")}`,
    `    ${pc.magenta("/model")}     ${pc.gray("Change model")}`,
    `    ${pc.magenta("/reasoning")} ${pc.gray("Set reasoning effort")}`,
    `    ${pc.magenta("/plans")}     ${pc.gray("Show MiniMax Token Plans")}`,
    `    ${pc.magenta("/cost")}      ${pc.gray("Show session cost")}`,
    `    ${pc.gray("model")}     ${pc.gray("Show current model info")}`,
    `    ${pc.gray("status")}    ${pc.gray("Show session status")}`,
    `    ${pc.gray("clear")}     ${pc.gray("Clear conversation")}`,
    `    ${pc.gray("help")}      ${pc.gray("Show this help")}`,
    `    ${pc.gray("exit")}      ${pc.gray("Exit")}`,
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
  "Ask anything... \"Fix a TODO in the codebase\"",
  "Ask anything... \"What is the tech stack of this project?\"",
  "Ask anything... \"Fix broken tests\"",
  "Ask anything... \"Add input validation to auth.ts\"",
  "Ask anything... \"Explain the architecture\"",
  "Ask anything... \"Refactor utils for readability\"",
];

let placeholderIdx = Math.floor(Math.random() * PLACEHOLDERS.length);

function nextPlaceholder(): string {
  const p = PLACEHOLDERS[placeholderIdx];
  placeholderIdx = (placeholderIdx + 1) % PLACEHOLDERS.length;
  return p;
}

function printReplHeader(): void {
  console.log(pc.gray("  type your task, or use /diff /commit /add /save /review /test /cost /help /exit"));
  console.log();
}

function printStatusBar(state: ReplState): void {
  const usage = state.agent.getTokenUsage();
  const ctxLen = state.config.contextLength;
  const totalTokens = usage.total;
  const pct = ctxLen && ctxLen > 0 ? Math.min(100, (totalTokens / ctxLen) * 100) : 0;
  const cost = state.agent.getCost();
  const shortModel = state.modelInfo.label;

  const parts: string[] = [
    pc.gray(shortModel),
    pc.gray(PROVIDERS[state.config.provider].label),
  ];

  if (state.config.reasoningEffort !== "off") {
    parts.push(pc.gray("reasoning:") + reasonBadge(state.config.reasoningEffort));
  }

  if (ctxLen && ctxLen > 0 && totalTokens > 0) {
    parts.push(pc.gray(`ctx ${fmtTokens(totalTokens)} (${pct.toFixed(1)}%)`));
  }

  if (cost.total > 0) {
    parts.push(pc.gray(fmtCost(cost.total)));
  }

  console.log(pc.gray("  " + parts.join(" \xB7 ")));
}

function createConfirmFn(autoConfirm: boolean): ConfirmFn {
  if (autoConfirm) return async () => true;
  return async (message: string) => {
    const r = await p.confirm({ message: `${pc.yellow("⚠")}  ${pc.white(message)}`, initialValue: false });
    if (p.isCancel(r)) return false;
    return r as boolean;
  };
}

function getApiKeyFromEnv(provider: Provider): string | null {
  for (const ev of PROVIDERS[provider].apiKeyEnv) {
    const v = process.env[ev];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

async function getApiKeyForProvider(provider: Provider): Promise<string | null> {
  const envKey = getApiKeyFromEnv(provider);
  if (envKey) return envKey;
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
  contextLength: number | null,
): AgentConfig {
  return {
    provider, providerType: PROVIDERS[provider].type, apiKey,
    baseURL: PROVIDERS[provider].baseURL, model: modelId,
    maxTokens: DEFAULT_CONFIG.maxTokens as number,
    maxSelfHealingAttempts: DEFAULT_CONFIG.maxSelfHealingAttempts as number,
    autoConfirm, workingDirectory: workdir, reasoningEffort: reasoning, contextLength,
  };
}

interface ReplState {
  agent: Agent;
  modelInfo: ModelInfo;
  config: AgentConfig;
  confirmFn: ConfirmFn;
}

async function handleProviderSwitch(state: ReplState, workdir: string): Promise<void> {
  const newProvider = await selectProvider();
  if (!newProvider) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
  const apiKey = await getApiKeyForProvider(newProvider);
  if (!apiKey) { console.log(`\n  ${pc.red("✗")} ${pc.red("No API key")}\n`); return; }
  const modelInfo = await selectModelInteractive(newProvider, apiKey);
  if (!modelInfo) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
  let reasoning: ReasoningEffort = "off";
  if (PROVIDERS[newProvider].supportsReasoning) {
    const r = await selectReasoning(newProvider);
    if (r) reasoning = r;
  }
  const prevHistory = state.agent.getConversation();
  const config = buildConfig(newProvider, apiKey, modelInfo.id, state.config.autoConfirm, workdir, reasoning, modelInfo.contextLength);
  const newAgent = new Agent(config, state.confirmFn);
  newAgent.setConversation(prevHistory);
  state.agent = newAgent; state.modelInfo = modelInfo; state.config = config;
  clearScreen(); printBanner(); printSessionInfo(workdir, modelInfo, reasoning); printReplHeader();
}

async function handleModelSwitch(state: ReplState, workdir: string): Promise<void> {
  const modelInfo = await selectModelInteractive(state.config.provider, state.config.apiKey);
  if (!modelInfo) { console.log(`\n  ${pc.gray("⊘ Cancelled")}\n`); return; }
  const prevHistory = state.agent.getConversation();
  const config = buildConfig(state.config.provider, state.config.apiKey, modelInfo.id, state.config.autoConfirm, workdir, state.config.reasoningEffort, modelInfo.contextLength);
  const newAgent = new Agent(config, state.confirmFn);
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
  const newAgent = new Agent(state.config, state.confirmFn);
  newAgent.setConversation(state.agent.getConversation());
  state.agent = newAgent;
  console.log(`\n  ${pc.green("✓")} ${pc.green("Reasoning")} ${reasonBadge(effort)}\n`);
}

function printModelInfo(state: ReplState): void {
  const model = state.modelInfo;
  const c = pColor(model.provider);
  const usage = state.agent.getTokenUsage();
  const ctxLen = state.config.contextLength;
  console.log();
  console.log(`  ${pc.gray("\u2503")} ${pc.bold(c(model.label))}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("id")}        ${pc.gray(model.id)}`);
  if (ctxLen) console.log(`  ${pc.gray("\u2503")} ${pc.gray("context")}   ${pc.gray(fmtTokens(ctxLen) + " tokens")}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("tools")}     ${model.supportsTools ? pc.green("\u2022") : pc.red("\u2022")}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("vision")}    ${model.supportsVision ? pc.green("\u2022") : pc.red("\u2022")}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("reasoning")} ${model.supportsReasoning ? pc.green("\u2022") : pc.red("\u2022")} ${pc.gray("current:")} ${reasonBadge(state.config.reasoningEffort)}`);
  if (usage.total > 0) console.log(`  ${pc.gray("\u2503")} ${pc.gray("tokens")}    ${pc.gray(fmtTokens(usage.total))}`);
  console.log();
}

function printStatus(state: ReplState): void {
  const usage = state.agent.getTokenUsage();
  const cost = state.agent.getCost();
  const ctxFiles = getContextFiles();
  const modifiedFiles = state.agent.getModifiedFiles();
  console.log();
  console.log(`  ${pc.gray("\u2503")} ${pc.bold("Session")}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("model")}     ${pColor(state.modelInfo.provider)(state.modelInfo.label)}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("provider")}  ${pc.gray(PROVIDERS[state.config.provider].label)}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("reasoning")} ${reasonBadge(state.config.reasoningEffort)}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("history")}   ${pc.gray(String(state.agent.getHistoryLength()) + " messages")}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("tokens")}    ${pc.gray(fmtTokens(usage.total))}`);
  if (cost.total > 0) console.log(`  ${pc.gray("\u2503")} ${pc.gray("cost")}      ${pc.gray(fmtCost(cost.total))}`);
  if (ctxFiles.length > 0) console.log(`  ${pc.gray("\u2503")} ${pc.gray("ctx files")} ${pc.gray(ctxFiles.map(f => f.path).join(", "))}`);
  if (modifiedFiles.length > 0) console.log(`  ${pc.gray("\u2503")} ${pc.gray("modified")}  ${pc.gray(String(modifiedFiles.length) + " files")}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray(process.cwd())}`);
  console.log();
}

function printCost(state: ReplState): void {
  const cost = state.agent.getCost();
  const usage = state.agent.getTokenUsage();
  console.log();
  console.log(`  ${pc.gray("\u2503")} ${pc.bold("Cost")}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("input")}    ${pc.gray(fmtTokens(usage.input) + " tokens")}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("output")}   ${pc.gray(fmtTokens(usage.output) + " tokens")}`);
  console.log(`  ${pc.gray("\u2503")} ${pc.gray("total")}    ${pc.gray(fmtTokens(usage.total) + " tokens")}`);
  if (cost.total > 0) {
    console.log(`  ${pc.gray("\u2503")} ${pc.gray("input $")}   ${pc.gray(fmtCost(cost.input))}`);
    console.log(`  ${pc.gray("\u2503")} ${pc.gray("output $")}  ${pc.gray(fmtCost(cost.output))}`);
    console.log(`  ${pc.gray("\u2503")} ${pc.gray("total $")}   ${pc.green(fmtCost(cost.total))}`);
  } else {
    console.log(`  ${pc.gray("\u2503")} ${pc.gray("no pricing data for this model")}`);
  }
  console.log();
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
  console.log(`\n  ${pc.gray("◆")} ${pc.gray("Compacting conversation...")}`);
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
  console.log();
}

function handleSessionsList(): void {
  const sessions = listSessions();
  console.log();
  console.log(`  ${pc.gray("◆")} ${pc.bold("Sessions")}`);
  
  if (sessions.length === 0) {
    console.log(`  ${pc.gray("No saved sessions. Use /save [name]")}`);
  } else {
    for (const s of sessions) {
      console.log(`  ${pc.white(s.name.padEnd(20))} ${pc.gray(s.provider.padEnd(12))} ${pc.gray(s.model.slice(0, 25).padEnd(25))} ${pc.gray(fmtDate(s.timestamp))}`);
    }
  }
  console.log();
}

async function handleResume(state: ReplState): Promise<void> {
  const sessions = listSessionsDetailed();
  if (sessions.length === 0) {
    console.log(`\n  ${pc.gray("No saved sessions.")}\n`);
    return;
  }
  const selected = await p.select({
    message: "Resume session:",
    options: sessions.map(s => ({
      value: s.name,
      label: pc.white(s.name),
      hint: `${s.provider} · ${s.model} · ${s.messageCount} msgs · ${fmtDate(s.timestamp)}`,
    })),
  });
  if (p.isCancel(selected)) { console.log(`\n  ${pc.gray("Cancelled")}\n`); return; }
  const name = selected as string;
  const data = loadSession(name);
  if (!data) { console.log(`\n  ${pc.red("✗")} ${pc.red(`Session not found: ${name}`)}\n`); return; }
  state.agent.setConversation(data.conversation as typeof state.agent.getConversation extends () => infer R ? R : never);
  if (data.reasoningEffort) state.config.reasoningEffort = data.reasoningEffort;
  console.log(`\n  ${pc.green("✓")} ${pc.green("Resumed:")} ${pc.white(name)} ${pc.gray(`(${data.conversation.length} messages)`)}`);
  console.log();
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

async function runRepl(state: ReplState): Promise<void> {
  printReplHeader();
  const workdir = process.cwd();

  let sigintHandler: (() => void) | null = null;
  const setupSigint = () => {
    sigintHandler = () => {
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
      clearScreen(); printBanner();
      console.log(pc.gray("  goodbye"));
      console.log();
      process.exit(0);
    }

    const raw = (input as string).trim();
    if (!raw) continue;

    if (raw === "exit" || raw === "quit" || raw === ":q") {
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
      const { command, args } = parseSlashCommand(raw);

      switch (command) {
        case "/provider": case "/p": await handleProviderSwitch(state, workdir); continue;
        case "/model": case "/m": await handleModelSwitch(state, workdir); continue;
        case "/reasoning": case "/r": await handleReasoningSwitch(state); continue;
        case "/cost": printCost(state); continue;
        case "/diff": await handleDiff(state); continue;
        case "/commit": await handleCommit(state); continue;
        case "/undo": await handleUndo(state, args); continue;
        case "/log": await handleLog(state); continue;
        case "/branch": await handleBranch(state); continue;
        case "/changes": await handleChanges(state); continue;
        case "/add": handleAddContext(state, args); continue;
        case "/drop": handleDropContext(args); continue;
        case "/context": handleContextList(); continue;
        case "/compact": await handleCompact(state); continue;
        case "/init": handleInit(state); continue;
        case "/save": await handleSave(state, args); continue;
        case "/load": await handleLoad(state, args); continue;
        case "/resume": await handleResume(state); continue;
        case "/sessions": handleSessionsList(); continue;
        case "/export": await handleExport(state); continue;
        case "/review": await handleReview(state); continue;
        case "/test": await handleTest(state); continue;
        case "/lint": await handleLint(state); continue;
        case "/explain": await handleExplain(state, args); continue;
        case "/refactor": await handleRefactor(state); continue;
        case "/search": await handleWebSearchCmd(state, args); continue;
        case "/pr": await handlePr(state); continue;
        case "/watch": await handleWatch(state); continue;
        case "/project": handleProjectInfo(state); continue;
        case "/token-plans":
        case "/plans":
          handleTokenPlans();
          continue;
        case "/todo": handleTodo(state, args); continue;
        case "/memory": handleMemory(state, args); continue;
        case "/gen-test": await handleGenTest(state, args); continue;
        case "/doc": await handleDoc(state, args); continue;
        default:
          console.log(`\n  ${pc.red("\u2717")} ${pc.red(`Unknown: ${command}`)} ${pc.gray("type 'help'")}\n`);
          continue;
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
      console.log(`\n  ${pc.gray("Spawning subagent...")}\n`);
      const result = await runSubagent(state.config, task, workdir);
      console.log(`  ${pc.gray("subagent done")} ${pc.gray(`(${result.iterations} iters, ${result.tokensUsed} tokens)`)}`);
      console.log(`\n${result.output}\n`);
      continue;
    }

    await state.agent.run(processedPrompt);
    console.log();
    
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

  const apiKey = await getApiKeyForProvider(provider);
  if (!apiKey) {
    console.log(`\n  ${pc.red("✗")} ${pc.red(`Set ${PROVIDERS[provider].apiKeyEnv[0]}`)}\n`);
    process.exit(1);
  }

  if (parsed.listModels) {
    const { getCuratedModels, fetchFireworksModels } = await import("./models");
    if (provider === "fireworks") {
      console.log(`\n  ${pc.cyan("◆")} ${pc.gray("Fetching from Fireworks API...")}\n`);
      try {
        const live = await fetchFireworksModels(apiKey);
        if (live.length === 0) {
          console.log(`  ${pc.yellow("⚠")}  ${pc.gray("Using curated list")}\n`);
          printModelTable(getCuratedModels("fireworks"));
        } else {
          console.log(`  ${pc.green("✓")} ${pc.gray(`${live.length} models`)}\n`);
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
  const modelInfo = parsed.model
    ? { id: parsed.model, label: parsed.model.split("/").pop() ?? parsed.model, description: "", contextLength: null, supportsTools: true, supportsVision: false, supportsReasoning: PROVIDERS[provider].supportsReasoning, provider }
    : savedConfig?.model
      ? { id: savedConfig.model, label: savedConfig.model.split("/").pop() ?? savedConfig.model, description: "", contextLength: null, supportsTools: true, supportsVision: false, supportsReasoning: PROVIDERS[provider].supportsReasoning, provider }
      : modelFromSettings
        ? { id: modelFromSettings, label: modelFromSettings.split("/").pop() ?? modelFromSettings, description: "", contextLength: null, supportsTools: true, supportsVision: false, supportsReasoning: PROVIDERS[provider].supportsReasoning, provider }
        : await selectModelInteractive(provider, apiKey);

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

  const config = buildConfig(provider, apiKey, modelInfo.id, autoConfirm, workdir, reasoning, modelInfo.contextLength);
  const confirmFn = createConfirmFn(config.autoConfirm);
  const agent = new Agent(config, confirmFn);

  saveGlobalSettings({
    lastProvider: provider,
    lastModel: modelInfo.id,
    lastReasoning: reasoning,
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
        const selected = await p.select({
          message: "Choose session:",
          options: sessions.map(s => ({
            value: s.name,
            label: pc.white(s.name),
            hint: `${s.provider} · ${s.model} · ${s.messageCount} msgs · ${fmtDate(s.timestamp)}`,
          })),
        });
        if (!p.isCancel(selected)) {
          const name = selected as string;
          const data = loadSession(name);
          if (data) {
            agent.setConversation(data.conversation as ReturnType<Agent["getConversation"]>);
            if (data.reasoningEffort) config.reasoningEffort = data.reasoningEffort;
            console.log(`\n  ${pc.green("✓")} ${pc.green(`Resumed: ${name}`)} ${pc.gray(`(${data.conversation.length} messages)`)}`);
          }
        }
      }
    }
    await runRepl({ agent, modelInfo, config, confirmFn });
  }
}

function printModelTable(models: ModelInfo[]): void {
  const idW = 46, labelW = 18;
  console.log(`  ${pc.gray("ID".padEnd(idW))} ${pc.gray("Name".padEnd(labelW))} ${pc.gray("T")} ${pc.gray("V")} ${pc.gray("R")}  ${pc.gray("Context")}`);
  console.log(`  ${pc.gray("─".repeat(idW))} ${pc.gray("─".repeat(labelW))} ${pc.gray("─")} ${pc.gray("─")} ${pc.gray("─")}  ${pc.gray("───────")}`);
  for (const m of models) {
    const c = pColor(m.provider);
    const t = m.supportsTools ? pc.green("✓") : pc.gray("·");
    const v = m.supportsVision ? pc.green("✓") : pc.gray("·");
    const r = m.supportsReasoning ? pc.green("✓") : pc.gray("·");
    const ctx = m.contextLength ? (m.contextLength >= 1_000_000 ? `${pc.white((m.contextLength / 1_000_000).toFixed(0))}${pc.gray("M")}` : `${pc.white(Math.round(m.contextLength / 1000))}${pc.gray("K")}`) : pc.gray("—");
    const idD = m.id.length > idW - 1 ? m.id.slice(0, idW - 3) + pc.gray("…") : m.id;
    console.log(`  ${pc.gray(idD.padEnd(idW))} ${c(m.label.padEnd(labelW))} ${t} ${v} ${r}  ${ctx}`);
  }
  console.log();
}

main().catch((e: unknown) => {
  console.error(`\n  ${pc.red("✗")} ${pc.red("Fatal:")} ${pc.red(e instanceof Error ? e.message : String(e))}\n`);
  process.exit(1);
});
