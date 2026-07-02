import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import pc from "picocolors";
import { PROVIDERS, REASONING_BUDGETS, PROVIDER_PRICING } from "./types";
import { buildFullSystemPrompt } from "./context";
import { webSearch, previewFileWrite, previewFilePatch, printDiffPreview } from "./diff";
import { detectProjectType } from "./config";
import {
  TOOL_DEFINITIONS,
  toolListFiles,
  toolViewFile,
  toolWriteFile,
  toolPatchFile,
  toolExecuteShell,
  toolSearchFiles,
  toolGlob,
  shouldConfirmCommand,
  getModifiedFiles,
  getBackup,
  restoreBackup,
  clearBackups,
  undoNChanges,
  getBackupCount as getBackupCountFn,
} from "./tools";
import type {
  AgentConfig,
  AgentRunResult,
  AskUserInput,
  AskUserFn,
  ConfirmFn,
  ContentBlockParam,
  ExecuteShellInput,
  ListFilesInput,
  MessageParam,
  PatchFileInput,
  RawMessage,
  ToolExecutionResult,
  ToolResultBlockParam,
  ToolUseBlock,
  ViewFileInput,
  WriteFileInput,
  SearchFilesInput,
  GlobInput,
  WebSearchInput,
} from "./types";

const SYSTEM_PROMPT = `You are Aura-Core, an elite autonomous AI coding agent operating in a terminal environment. You follow the ReAct (Reasoning -> Action -> Observation) methodology to solve software engineering tasks with maximum precision and speed.

## CORE PRINCIPLES
1. Analyze before acting: Always understand the codebase structure and relevant files before making changes. Use list_files to map the project, then view_file on relevant files.
2. Minimal, surgical changes: Prefer patch_file over write_file for existing files to preserve unchanged code and save tokens.
3. Always verify: After any code modification, run the project's test suite, build command, or linter to verify correctness.
4. Self-heal relentlessly: If a command fails, read the error output carefully, identify the root cause, fix the code, and re-run. Never give up after a single failure.
5. Be transparent: Communicate your plan and reasoning concisely before taking actions. Keep text output short.

## AVAILABLE TOOLS
- list_files(dir): Recursively lists files, respecting .gitignore. Use "." for root.
- view_file(path): Reads full file contents. ALWAYS read before modifying.
- write_file(path, content): Creates or overwrites a file. Use for new files or complete rewrites.
- patch_file(path, search, replace, replace_all?): Targeted string replacement. Preferred for existing files.
- execute_shell(command, timeout?): Runs shell command, returns stdout/stderr/exit code. Dangerous commands blocked, destructive ones need confirmation.
- search_files(pattern, path?, include?): Search for text pattern across files. Returns matches with line numbers. More efficient than reading every file.
- glob(pattern, path?): Find files by name pattern (e.g. '**/*.ts'). Returns matching paths without reading contents.
- web_search(query, maxResults?): Search the web for documentation, solutions, or up-to-date info. Use when you need external knowledge.
- ask_user(question, options?): Ask the user a question with optional predefined answer options. Use when you need clarification, input, or a decision to continue.

## WORKFLOW
1. ANALYZE: Call list_files to understand structure. Call view_file on relevant files.
2. PLAN: Briefly state what you will do and why (1-3 sentences).
3. EXECUTE: Use patch_file or write_file to make changes.
4. VERIFY: Call execute_shell to run tests, build, lint, or typecheck.
5. HEAL: If verification fails, read the error, fix the code, re-verify. Repeat up to 5 times.
6. REPORT: Summarize what was done and the final state concisely.

## RULES
- Never assume file contents — always verify with view_file first.
- When using patch_file, include enough surrounding context in the search parameter to uniquely identify the location.
- After making ALL changes, ALWAYS run a verification command (tests, build, lint, or typecheck).
- If you encounter an unfamiliar error, search for it in the codebase or run a diagnostic command.
- Keep your text responses concise. Do not repeat what the tools already show.
- When you are done, clearly state that the task is complete.
- Do not use markdown headers in your responses. Use plain text.`;

const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
const SPINNER_INTERVAL = 80;

function truncateCmd(cmd: string, max: number = 55): string {
  return cmd.length > max ? cmd.slice(0, max - 3) + "..." : cmd;
}

function providerColor(provider: string): (s: string) => string {
  return PROVIDERS[provider as keyof typeof PROVIDERS]?.color ?? pc.cyan;
}

const COL = {
  peach: (s: string) => `\x1b[38;2;250;178;131m${s}\x1b[39m`,
  blue: (s: string) => `\x1b[38;2;92;156;245m${s}\x1b[39m`,
  purple: (s: string) => `\x1b[38;2;157;124;216m${s}\x1b[39m`,
  red: (s: string) => `\x1b[38;2;224;108;117m${s}\x1b[39m`,
  orange: (s: string) => `\x1b[38;2;245;167;66m${s}\x1b[39m`,
  green: (s: string) => `\x1b[38;2;127;216;143m${s}\x1b[39m`,
  cyan: (s: string) => `\x1b[38;2;86;182;194m${s}\x1b[39m`,
};

function clearLine(): void {
  process.stdout.write("\r\x1b[2K\r");
}

class BrailleSpinner {
  private frameIdx = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private text: string;
  private colorFn: (s: string) => string;

  constructor(text: string, colorFn: (s: string) => string) {
    this.text = text;
    this.colorFn = colorFn;
  }

  setText(text: string): void {
    this.text = text;
    if (this.timer) this.render();
  }

  start(): void {
    this.frameIdx = 0;
    this.render();
    this.timer = setInterval(() => {
      this.frameIdx = (this.frameIdx + 1) % SPINNER_FRAMES.length;
      this.render();
    }, SPINNER_INTERVAL);
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.frameIdx];
    process.stdout.write(`\r${this.colorFn(frame)} ${pc.gray(this.text)}`);
  }

  stop(finalText?: string): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    clearLine();
    if (finalText) process.stdout.write(finalText + "\n");
  }
}

function toolGlyph(name: string): string {
  const glyphs: Record<string, string> = {
    execute_shell: "$",
    view_file: "\u2192",
    write_file: "\u2190",
    patch_file: "\u2190",
    list_files: "\u2731",
    search_files: "\u2731",
    glob: "\u2731",
    ask_user: "?",
  };
  return glyphs[name] ?? "\u2699";
}

function toolColor(name: string): (s: string) => string {
  if (name === "execute_shell") return COL.peach;
  if (name === "view_file") return COL.blue;
  if (name === "write_file" || name === "patch_file") return COL.blue;
  if (name === "ask_user") return COL.purple;
  return COL.peach;
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "execute_shell": return truncateCmd((input.command as string) ?? "", 60);
    case "view_file": return `Read ${(input.path as string) ?? ""}`;
    case "write_file": return `Write ${(input.path as string) ?? ""}`;
    case "patch_file": return `Edit ${(input.path as string) ?? ""}${input.replace_all ? " (all)" : ""}`;
    case "list_files": return `List ${(input.dir as string) ?? "."}`;
    case "search_files": return `Grep "${(input.pattern as string) ?? ""}"`;
    case "glob": return `Glob "${(input.pattern as string) ?? ""}"`;
    case "ask_user": return `Ask "${((input.question as string) ?? "").slice(0, 50)}"`;
    case "web_search": return `Search "${((input.query as string) ?? "").slice(0, 50)}"`;
    default: return name;
  }
}

const TOOL_SPINNER_FRAMES = ["\u25D4", "\u25D0", "\u25D5", "\u25D1"];
let toolSpinnerTimer: ReturnType<typeof setInterval> | null = null;
let toolSpinnerFrame = 0;
let toolSpinnerLabel = "";
let toolSpinnerColor: (s: string) => string = pc.gray;

function clearToolSpinner(): void {
  if (toolSpinnerTimer) { clearInterval(toolSpinnerTimer); toolSpinnerTimer = null; }
}

function renderToolSpinner(): void {
  const frame = TOOL_SPINNER_FRAMES[toolSpinnerFrame];
  toolSpinnerFrame = (toolSpinnerFrame + 1) % TOOL_SPINNER_FRAMES.length;
  process.stdout.write(`\r   ${toolSpinnerColor(frame)} ${pc.gray(toolSpinnerLabel)}`);
}

function printToolPending(name: string, input: Record<string, unknown>): void {
  clearToolSpinner();
  const glyph = toolGlyph(name);
  const color = toolColor(name);
  const label = toolLabel(name, input);
  toolSpinnerLabel = `${color(glyph)} ${pc.dim(label)}`;
  toolSpinnerColor = color;
  toolSpinnerFrame = 0;
  renderToolSpinner();
  toolSpinnerTimer = setInterval(() => {
    toolSpinnerFrame = (toolSpinnerFrame + 1) % TOOL_SPINNER_FRAMES.length;
    const frame = TOOL_SPINNER_FRAMES[toolSpinnerFrame];
    process.stdout.write(`\r   ${toolSpinnerColor(frame)} ${toolSpinnerLabel}`);
  }, 120);
}

function printToolDone(name: string, input: Record<string, unknown>, success: boolean, detail?: string): void {
  clearToolSpinner();
  const color = success ? toolColor(name) : COL.red;
  const label = toolLabel(name, input);
  const detailStr = detail ? ` ${pc.gray(detail)}` : "";
  const icon = success ? color("\u2713") : COL.red("\u2717");
  const line = `   ${icon} ${success ? pc.gray(label) : COL.red(label)}${detailStr}`;
  process.stdout.write(`\r${" ".repeat(80)}\r`);
  console.log(line);
}

function printToolError(name: string, input: Record<string, unknown>, error: string): void {
  clearToolSpinner();
  const label = toolLabel(name, input);
  process.stdout.write(`\r${" ".repeat(80)}\r`);
  console.log(`   ${COL.red("\u2717")} ${COL.red(label)}`);
  console.log(`     ${COL.red(error.slice(0, 100))}`);
}

interface OpenAIToolCallAcc {
  id: string;
  name: string;
  arguments: string;
}

function convertMessagesToOpenAI(
  conversation: MessageParam[],
  systemPrompt: string,
): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of conversation) {
    if (typeof msg.content === "string") {
      messages.push({ role: msg.role, content: msg.content });
      continue;
    }

    let text = "";
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];

    for (const block of msg.content as unknown as Array<Record<string, unknown>>) {
      const blockType = block.type as string;
      if (blockType === "text") {
        text += (block.text as string) ?? "";
      } else if (blockType === "tool_use") {
        toolCalls.push({
          id: (block.id as string) ?? "",
          type: "function",
          function: {
            name: (block.name as string) ?? "",
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
      } else if (blockType === "tool_result") {
        const tc = block.content;
        const content = typeof tc === "string" ? tc : JSON.stringify(tc ?? "");
        messages.push({
          role: "tool",
          tool_call_id: (block.tool_use_id as string) ?? "",
          content,
        });
      }
    }

    if (msg.role === "assistant") {
      messages.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    } else if (msg.role === "user" && text) {
      messages.push({ role: "user", content: text });
    }
  }

  return messages;
}

function convertToolsToOpenAI(): Array<{ type: "function"; function: Record<string, unknown> }> {
  return TOOL_DEFINITIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

function buildRawMessage(
  model: string,
  textContent: string,
  toolCalls: OpenAIToolCallAcc[],
  finishReason: string | null,
): RawMessage {
  const content: Array<Record<string, unknown>> = [];
  if (textContent) {
    content.push({ type: "text", text: textContent });
  }
  for (const tc of toolCalls) {
    let parsedInput: unknown = {};
    try {
      parsedInput = JSON.parse(tc.arguments || "{}");
    } catch {
      parsedInput = { raw: tc.arguments };
    }
    content.push({ type: "tool_use", id: tc.id, name: tc.name, input: parsedInput });
  }

  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: "message",
    role: "assistant",
    content: content as unknown as never,
    model,
    stop_reason: toolCalls.length > 0 ? "tool_use" : (finishReason === "stop" ? "end_turn" : (finishReason ?? "end_turn")),
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as RawMessage;
}

function printFooter(agentColor: (s: string) => string, model: string, durationMs: number): void {
  const sec = (durationMs / 1000).toFixed(1);
  const shortModel = model.split("/").pop() ?? model;
  console.log();
  console.log(`   ${agentColor("\u25A3")} ${pc.gray("Build")} ${pc.gray("\xB7")} ${pc.gray(shortModel)} ${pc.gray("\xB7")} ${pc.gray(sec + "s")}`);
}

export class Agent {
  private anthropicClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;
  private config: AgentConfig;
  private confirmFn: ConfirmFn;
  private askUserFn: AskUserFn;
  private conversation: MessageParam[] = [];
  private selfHealingAttempts = 0;
  private forceStop = false;
  private iterations = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private interrupted = false;

  constructor(config: AgentConfig, confirmFn: ConfirmFn, askUserFn: AskUserFn) {
    this.config = config;
    this.confirmFn = confirmFn;
    this.askUserFn = askUserFn;

    if (config.providerType === "anthropic") {
      const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey: config.apiKey };
      if (config.baseURL) opts.baseURL = config.baseURL;
      this.anthropicClient = new Anthropic(opts);
    } else {
      const opts: ConstructorParameters<typeof OpenAI>[0] = { apiKey: config.apiKey, dangerouslyAllowBrowser: true };
      if (config.baseURL) opts.baseURL = config.baseURL;
      this.openaiClient = new OpenAI(opts);
    }
  }

  reset(): void {
    this.conversation = [];
    this.selfHealingAttempts = 0;
    this.forceStop = false;
    this.iterations = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.interrupted = false;
    clearBackups();
  }

  getHistoryLength(): number { return this.conversation.length; }
  getConversation(): MessageParam[] { return [...this.conversation]; }
  setConversation(messages: MessageParam[]): void { this.conversation = [...messages]; }
  getConfig(): AgentConfig { return { ...this.config }; }
  getTokenUsage(): { input: number; output: number; total: number } {
    return { input: this.totalInputTokens, output: this.totalOutputTokens, total: this.totalInputTokens + this.totalOutputTokens };
  }

  getCost(): { input: number; output: number; total: number } {
    const providerPricing = PROVIDER_PRICING[this.config.provider];
    const modelPricing = providerPricing?.[this.config.model];
    if (!modelPricing) return { input: 0, output: 0, total: 0 };
    const inputCost = (this.totalInputTokens / 1_000_000) * modelPricing.inputPerMillion;
    const outputCost = (this.totalOutputTokens / 1_000_000) * modelPricing.outputPerMillion;
    return { input: inputCost, output: outputCost, total: inputCost + outputCost };
  }

  getModifiedFiles(): string[] { return getModifiedFiles(); }

  getBackupContent(relPath: string): string | null {
    const backup = getBackup(relPath);
    return backup ? backup.originalContent : null;
  }

  undoLastChange(): { success: boolean; message: string } {
    const files = getModifiedFiles();
    if (files.length === 0) return { success: false, message: "No changes to undo." };
    const lastFile = files[files.length - 1];
    const restored = restoreBackup(lastFile, this.config.workingDirectory);
    if (restored) return { success: true, message: `Reverted: ${lastFile}` };
    return { success: false, message: `Failed to revert: ${lastFile}` };
  }

  undoN(n: number): { success: boolean; count: number; files: string[]; message: string } {
    const result = undoNChanges(n, this.config.workingDirectory);
    if (result.count === 0) {
      return { success: false, count: 0, files: [], message: "No changes to undo." };
    }
    return {
      success: true,
      count: result.count,
      files: result.files,
      message: `Reverted ${result.count} change${result.count > 1 ? "s" : ""}: ${result.files.join(", ")}`,
    };
  }

  getBackupCount(): number {
    return getBackupCountFn();
  }

  interrupt(): void { this.interrupted = true; }
  isInterrupted(): boolean { return this.interrupted; }

  private shouldAutoCompact(): boolean {
    const ctxLen = this.config.contextLength;
    if (!ctxLen || ctxLen <= 0) return false;
    const usage = this.getTokenUsage();
    const pct = (usage.total / ctxLen) * 100;
    return pct > 75 && this.conversation.length > 8;
  }

  private async autoCompact(): Promise<void> {
    console.log(`\n   ${pc.gray("\u25B3")} ${pc.gray("Auto-compacting context...")}`);
    const summaryPrompt = "Summarize our conversation so far in 5-10 bullet points. Include key decisions, files changed, and remaining tasks. Be extremely concise.";
    this.conversation.push({ role: "user", content: summaryPrompt });
    const prevHistory = this.conversation;
    try {
      await this.reactLoop();
    } catch {
      this.conversation = prevHistory;
      return;
    }
    const lastAssistant = [...this.conversation].reverse().find(m => m.role === "assistant");
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
      this.conversation = [{ role: "user", content: `Previous conversation summary:\n${summary}` }];
      console.log(`   ${pc.gray("\u2713")} ${pc.gray("Compacted")} ${pc.gray(`(${prevHistory.length} messages -> 1)`)}`);
    }
  }

  async run(userPrompt: string): Promise<AgentRunResult> {
    this.conversation.push({ role: "user", content: userPrompt });
    this.interrupted = false;
    const startIterations = this.iterations;
    const startSelfHealing = this.selfHealingAttempts;
    const startTime = Date.now();

    if (this.shouldAutoCompact()) {
      await this.autoCompact();
    }

    try {
      await this.reactLoop();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n   ${COL.red("\u25A3")} ${COL.red("Error:")} ${COL.red(msg)}`);
      return {
        success: false,
        iterations: this.iterations - startIterations,
        selfHealingUsed: this.selfHealingAttempts - startSelfHealing,
        finalMessage: msg,
      };
    }

    const duration = Date.now() - startTime;
    const c = providerColor(this.config.provider);
    printFooter(c, this.config.model, duration);

    const lastAssistant = [...this.conversation].reverse().find((m) => m.role === "assistant");
    let finalText = "";
    if (lastAssistant && typeof lastAssistant.content !== "string") {
      const textBlock = lastAssistant.content.find(
        (b): b is { type: "text"; text: string } => b.type === "text",
      );
      if (textBlock) finalText = textBlock.text;
    } else if (lastAssistant && typeof lastAssistant.content === "string") {
      finalText = lastAssistant.content;
    }

    return {
      success: !this.forceStop,
      iterations: this.iterations - startIterations,
      selfHealingUsed: this.selfHealingAttempts - startSelfHealing,
      finalMessage: finalText,
    };
  }

  private async reactLoop(): Promise<void> {
    const MAX_ITERATIONS = 50;

    while (this.iterations < MAX_ITERATIONS) {
      this.iterations++;
      if (this.forceStop) break;
      if (this.interrupted) {
        console.log(`\n   ${COL.orange("\u25CB")} ${pc.gray("Interrupted")}`);
        this.conversation.push({
          role: "user",
          content: "The user interrupted the previous task. Please acknowledge and stop.",
        });
        break;
      }

      if (this.selfHealingAttempts >= this.config.maxSelfHealingAttempts) {
        console.log(`\n   ${COL.orange("\u25B3")} ${COL.orange("Self-healing limit")} ${pc.gray(`(${this.config.maxSelfHealingAttempts} attempts)`)}`);
        this.conversation.push({
          role: "user",
          content: `SELF-HEALING LIMIT REACHED (${this.config.maxSelfHealingAttempts} failed attempts). Stop trying to fix the issue. Provide a clear summary of what went wrong and what the user should do manually to resolve it.`,
        });
        this.forceStop = true;
      }

      const response = await this.streamResponse();

      this.conversation.push({
        role: "assistant",
        content: response.content as ContentBlockParam[],
      });

      if (response.stop_reason === "max_tokens") {
        this.conversation.push({
          role: "user",
          content: "Your response was truncated. Please continue from where you left off.",
        });
        continue;
      }

      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) break;

      const toolResults: ToolResultBlockParam[] = [];
      let shellFailedInThisBatch = false;
      let shellSucceededInThisBatch = false;

      for (const block of toolUseBlocks) {
        const result = await this.executeTool(block);
        toolResults.push({
          type: "tool_result",
          tool_use_id: result.toolUseId,
          content: result.content,
          is_error: result.isError,
        });
        if (result.isShellFailure) shellFailedInThisBatch = true;
        if (block.name === "execute_shell" && !result.isShellFailure) shellSucceededInThisBatch = true;
      }

      if (shellSucceededInThisBatch) {
        this.selfHealingAttempts = 0;
      } else if (shellFailedInThisBatch) {
        this.selfHealingAttempts++;
      }

      this.conversation.push({ role: "user", content: toolResults });
    }

    if (this.iterations >= MAX_ITERATIONS) {
      console.log(`\n   ${COL.orange("\u25B3")} ${COL.orange("Max iterations")} ${pc.gray(`(${MAX_ITERATIONS})`)}`);
    }
    clearToolSpinner();
  }

  private async streamResponse(): Promise<RawMessage> {
    clearToolSpinner();
    if (this.config.providerType === "anthropic") {
      return await this.streamAnthropic();
    }
    return await this.streamOpenAI();
  }

  private getSystemPrompt(): string {
    let prompt = buildFullSystemPrompt(SYSTEM_PROMPT, this.config.workingDirectory);
    const projectInfo = detectProjectType(this.config.workingDirectory);
    if (projectInfo.type !== "unknown") {
      prompt += `\n\n## PROJECT INFO\nType: ${projectInfo.type}\nLanguage: ${projectInfo.language}\nPackage Manager: ${projectInfo.packageManager}`;
      if (projectInfo.buildCmd) prompt += `\nBuild: \`${projectInfo.buildCmd}\``;
      if (projectInfo.testCmd) prompt += `\nTest: \`${projectInfo.testCmd}\``;
      if (projectInfo.lintCmd) prompt += `\nLint: \`${projectInfo.lintCmd}\``;
      if (projectInfo.runCmd) prompt += `\nRun: \`${projectInfo.runCmd}\``;
    }
    return prompt;
  }

  private async streamAnthropic(): Promise<RawMessage> {
    const c = providerColor(this.config.provider);
    const spinner = new BrailleSpinner("Thinking...", c);
    spinner.start();
    let firstText = true;
    let firstThinking = true;
    const thinkingStart = Date.now();
    let thinkingTitle = "";

    const effort = this.config.reasoningEffort;
    const maxTokens = effort !== "off"
      ? Math.max(this.config.maxTokens, REASONING_BUDGETS[effort] + 4096)
      : this.config.maxTokens;

    const params: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: maxTokens,
      system: this.getSystemPrompt(),
      messages: this.conversation,
      tools: TOOL_DEFINITIONS,
    };

    if (effort !== "off") {
      params.thinking = { type: "enabled", budget_tokens: REASONING_BUDGETS[effort] };
    }

    let stream: ReturnType<NonNullable<typeof this.anthropicClient>["messages"]["stream"]>;
    try {
      stream = this.anthropicClient!.messages.stream(params as Parameters<Anthropic["messages"]["stream"]>[0]);
    } catch (error) {
      spinner.stop();
      throw new Error(`Failed to start stream: ${error instanceof Error ? error.message : String(error)}`);
    }

    const effortLabels: Record<string, string> = { low: "Quick", medium: "Balanced", high: "Deep", max: "Maximum" };

    stream.on("thinking", (thinking: string) => {
      if (firstThinking) {
        firstThinking = false;
        thinkingTitle = thinking.slice(0, 80).replace(/\n/g, " ");
        if (firstText) {
          spinner.setText(`${effortLabels[effort] ?? "Deep"} reasoning...`);
          firstText = false;
        } else {
          clearLine();
          console.log(`   ${COL.orange("\u2823")} ${COL.orange("Reasoning:")} ${pc.gray(thinkingTitle)}`);
        }
      }
      spinner.setText(`Reasoning...`);
      if (thinking.length > 20) {
        const preview = thinking.slice(0, 60).replace(/\n/g, " ");
        spinner.setText(`Reasoning: ${preview}...`);
      }
    });

    stream.on("text", (text: string) => {
      if (firstText) {
        spinner.stop();
        firstText = false;
        if (!firstThinking) {
          const dur = ((Date.now() - thinkingStart) / 1000).toFixed(1);
          clearLine();
          console.log(`   ${COL.orange("-")} ${COL.orange("Thought:")} ${pc.gray(thinkingTitle)} ${pc.gray("\xB7")} ${pc.gray(dur + "s")}`);
        }
        process.stdout.write(`   ${c(text)}`);
      } else {
        process.stdout.write(text);
      }
    });

    let finalMessage: RawMessage;
    try {
      finalMessage = await stream.finalMessage();
    } catch (error) {
      if (firstText) spinner.stop();
      if (error instanceof Anthropic.APIError) {
        const pn = PROVIDERS[this.config.provider].label;
        const ke = PROVIDERS[this.config.provider].apiKeyEnv[0];
        if (error.status === 401) throw new Error(`Auth failed for ${pn}. Set ${ke}.`);
        if (error.status === 429) throw new Error(`Rate limited by ${pn}. Try again.`);
        if (error.status === 400) throw new Error(`Bad request to ${pn}: ${error.message}`);
        if (error.status === 500 || error.status === 529) throw new Error(`${pn} server error.`);
        throw new Error(`${pn} API error (${error.status}): ${error.message}`);
      }
      throw new Error(`Stream failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (finalMessage.usage) {
      this.totalInputTokens += finalMessage.usage.input_tokens ?? 0;
      this.totalOutputTokens += finalMessage.usage.output_tokens ?? 0;
    }

    if (firstText) {
      spinner.stop();
    } else {
      process.stdout.write("\n");
    }

    return finalMessage;
  }

  private async streamOpenAI(): Promise<RawMessage> {
    const c = providerColor(this.config.provider);
    const spinner = new BrailleSpinner("Thinking...", c);
    spinner.start();
    let firstText = true;

    const messages = convertMessagesToOpenAI(this.conversation, this.getSystemPrompt());
    const tools = convertToolsToOpenAI();

    const effort = this.config.reasoningEffort;
    const maxTokens = effort !== "off"
      ? Math.max(this.config.maxTokens, REASONING_BUDGETS[effort] + 4096)
      : this.config.maxTokens;

    const reqParams: Record<string, unknown> = {
      model: this.config.model,
      messages,
      tools,
      max_tokens: maxTokens,
      stream: true,
    };

    if (effort !== "off") {
      reqParams.reasoning_effort = effort === "max" ? "high" : effort;
      spinner.setText("Reasoning...");
    }

    let textContent = "";
    let reasoningContent = "";
    let firstReasoning = true;
    const toolCallMap = new Map<number, OpenAIToolCallAcc>();
    let finishReason: string | null = null;
    let oaiInputTokens = 0;
    let oaiOutputTokens = 0;

    try {
      const stream = await this.openaiClient!.chat.completions.create(
        reqParams as unknown as Parameters<OpenAI["chat"]["completions"]["create"]>[0],
      );

      for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
        const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
        if (!choices || choices.length === 0) {
          const usage = chunk.usage as Record<string, number> | undefined;
          if (usage) {
            oaiInputTokens = usage.prompt_tokens ?? 0;
            oaiOutputTokens = usage.completion_tokens ?? 0;
          }
          continue;
        }
        const choice = choices[0];
        const delta = choice.delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        const reasoningDelta = delta.reasoning_content as string | undefined;
        if (reasoningDelta) {
          reasoningContent += reasoningDelta;
          const clean = reasoningDelta.replace(/\n/g, " ");
          if (firstReasoning) {
            firstReasoning = false;
            spinner.stop();
            if (firstText) firstText = false;
            clearLine();
            spinner.setText(`Reasoning: ${clean.slice(0, 80)}`);
          } else {
            spinner.setText(`Reasoning: ${clean.slice(0, 80)}`);
          }
        }

        if (delta.content) {
          const text = delta.content as string;
          textContent += text;
          if (firstReasoning && firstText) {
            spinner.stop();
            firstText = false;
          }
          if (firstText) {
            spinner.stop();
            firstText = false;
            process.stdout.write(`   ${c(text)}`);
          } else {
            process.stdout.write(text);
          }
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
            const idx = (tc.index as number) ?? 0;
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, { id: "", name: "", arguments: "" });
            }
            const acc = toolCallMap.get(idx)!;
            if (tc.id) acc.id = tc.id as string;
            const fn = tc.function as Record<string, unknown> | undefined;
            if (fn?.name) acc.name = fn.name as string;
            if (fn?.arguments) acc.arguments += fn.arguments as string;
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason as string;
        }

        const chunkUsage = chunk.usage as Record<string, number> | undefined;
        if (chunkUsage) {
          oaiInputTokens = chunkUsage.prompt_tokens ?? 0;
          oaiOutputTokens = chunkUsage.completion_tokens ?? 0;
        }
      }
    } catch (error) {
      if (firstText) spinner.stop();
      if (error instanceof OpenAI.APIError) {
        const pn = PROVIDERS[this.config.provider].label;
        const ke = PROVIDERS[this.config.provider].apiKeyEnv[0];
        if (error.status === 401) throw new Error(`Auth failed for ${pn}. Set ${ke}.`);
        if (error.status === 429) throw new Error(`Rate limited by ${pn}. Try again.`);
        if (error.status === 400) throw new Error(`Bad request to ${pn}: ${error.message}`);
        if (error.status >= 500) throw new Error(`${pn} server error.`);
        throw new Error(`${pn} API error (${error.status}): ${error.message}`);
      }
      throw new Error(`Stream failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (firstText) {
      spinner.stop();
    } else {
      process.stdout.write("\n");
    }

    this.totalInputTokens += oaiInputTokens;
    this.totalOutputTokens += oaiOutputTokens;

    const toolCalls = Array.from(toolCallMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);

    return buildRawMessage(this.config.model, textContent, toolCalls, finishReason);
  }

  private async executeTool(block: ToolUseBlock): Promise<ToolExecutionResult> {
    const input = (block.input ?? {}) as Record<string, unknown>;
    try {
      switch (block.name) {
        case "list_files":
          return await this.handleListFiles(block, input as unknown as ListFilesInput);
        case "view_file":
          return await this.handleViewFile(block, input as unknown as ViewFileInput);
        case "write_file":
          return await this.handleWriteFile(block, input as unknown as WriteFileInput);
        case "patch_file":
          return await this.handlePatchFile(block, input as unknown as PatchFileInput);
        case "execute_shell":
          return await this.handleExecuteShell(block, input as unknown as ExecuteShellInput);
        case "search_files":
          return await this.handleSearchFiles(block, input as unknown as SearchFilesInput);
        case "glob":
          return await this.handleGlob(block, input as unknown as GlobInput);
        case "web_search":
          return await this.handleWebSearch(block, input as unknown as WebSearchInput);
        case "ask_user":
          return await this.handleAskUser(block, input as unknown as AskUserInput);
        default:
          return {
            toolUseId: block.id,
            content: `Unknown tool: "${block.name}". Available: list_files, view_file, write_file, patch_file, execute_shell, search_files, glob, web_search, ask_user.`,
            isError: true, isShellFailure: false,
          };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { toolUseId: block.id, content: `Tool error: ${msg}`, isError: true, isShellFailure: false };
    }
  }

  private async handleListFiles(block: ToolUseBlock, input: ListFilesInput): Promise<ToolExecutionResult> {
    printToolPending("list_files", { dir: input.dir });
    try {
      const content = await toolListFiles(input.dir, this.config.workingDirectory);
      printToolDone("list_files", { dir: input.dir }, true, `${content.split("\n").length} lines`);
      return { toolUseId: block.id, content, isError: false, isShellFailure: false };
    } catch (error) {
      printToolError("list_files", { dir: input.dir }, error instanceof Error ? error.message : String(error));
      return { toolUseId: block.id, content: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true, isShellFailure: false };
    }
  }

  private async handleViewFile(block: ToolUseBlock, input: ViewFileInput): Promise<ToolExecutionResult> {
    printToolPending("view_file", { path: input.path });
    try {
      const content = await toolViewFile(input.path, this.config.workingDirectory);
      const lines = content.split("\n").length;
      printToolDone("view_file", { path: input.path }, true, `${lines} lines`);
      return { toolUseId: block.id, content, isError: false, isShellFailure: false };
    } catch (error) {
      printToolError("view_file", { path: input.path }, error instanceof Error ? error.message : String(error));
      return { toolUseId: block.id, content: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true, isShellFailure: false };
    }
  }

  private async handleWriteFile(block: ToolUseBlock, input: WriteFileInput): Promise<ToolExecutionResult> {
    printToolPending("write_file", { path: input.path });
    try {
      if (!this.config.autoConfirm) {
        const preview = previewFileWrite(input.path, input.content, this.config.workingDirectory);
        if (preview.diff) {
          printDiffPreview(input.path, preview.diff, preview.isWrite);
          const confirmed = await this.confirmFn(`Write ${input.path}`);
          if (!confirmed) {
            console.log(`     ${COL.red("\u2190")} ${COL.red("Declined")}`);
            return { toolUseId: block.id, content: `User declined to write: ${input.path}`, isError: true, isShellFailure: false };
          }
        }
      }
      const content = await toolWriteFile(input.path, input.content, this.config.workingDirectory);
      const bytes = new TextEncoder().encode(input.content).length;
      const sizeStr = bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`;
      printToolDone("write_file", { path: input.path }, true, sizeStr);
      return { toolUseId: block.id, content, isError: false, isShellFailure: false };
    } catch (error) {
      printToolError("write_file", { path: input.path }, error instanceof Error ? error.message : String(error));
      return { toolUseId: block.id, content: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true, isShellFailure: false };
    }
  }

  private async handlePatchFile(block: ToolUseBlock, input: PatchFileInput): Promise<ToolExecutionResult> {
    printToolPending("patch_file", { path: input.path, replace_all: input.replace_all });
    try {
      if (!this.config.autoConfirm) {
        const preview = previewFilePatch(input.path, input.search, input.replace, input.replace_all ?? false, this.config.workingDirectory);
        if (preview.diff) {
          printDiffPreview(input.path, preview.diff, false);
          const confirmed = await this.confirmFn(`Edit ${input.path}`);
          if (!confirmed) {
            console.log(`     ${COL.red("\u2190")} ${COL.red("Declined")}`);
            return { toolUseId: block.id, content: `User declined to edit: ${input.path}`, isError: true, isShellFailure: false };
          }
        }
      }
      const content = await toolPatchFile(input.path, input.search, input.replace, input.replace_all ?? false, this.config.workingDirectory);
      printToolDone("patch_file", { path: input.path, replace_all: input.replace_all }, true, content.split(":")[1]?.trim() ?? "");
      return { toolUseId: block.id, content, isError: false, isShellFailure: false };
    } catch (error) {
      printToolError("patch_file", { path: input.path }, error instanceof Error ? error.message : String(error));
      return { toolUseId: block.id, content: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true, isShellFailure: false };
    }
  }

  private async handleExecuteShell(block: ToolUseBlock, input: ExecuteShellInput): Promise<ToolExecutionResult> {
    const check = shouldConfirmCommand(input.command);

    if (check.blocked) {
      console.log(`     ${COL.red("$")} ${COL.red("Blocked:")} ${COL.red(check.reason)}`);
      return { toolUseId: block.id, content: `Command blocked: ${check.reason}. Choose a safer alternative.`, isError: true, isShellFailure: false };
    }

    if (check.confirm && !this.config.autoConfirm) {
      const confirmed = await this.confirmFn(`Execute (${check.reason}): ${truncateCmd(input.command, 100)}`);
      if (!confirmed) {
        const cmdStr = truncateCmd(input.command, 50);
        console.log(`     ${COL.red("$")} ${COL.red(cmdStr)}`);
        return { toolUseId: block.id, content: `User declined: ${input.command}`, isError: true, isShellFailure: false };
      }
    }

    const spinner = new BrailleSpinner(`$ ${truncateCmd(input.command, 45)}`, COL.peach);
    spinner.start();
    try {
      const result = await toolExecuteShell(input.command, this.config.workingDirectory, input.timeout ?? 60_000);
      spinner.stop();
      if (result.success) {
        console.log(`     ${COL.peach("$")} ${pc.gray(truncateCmd(input.command, 50))} ${COL.green("exit 0")}`);
      } else {
        console.log(`     ${COL.red("$")} ${COL.red(truncateCmd(input.command, 50))} ${COL.red("exit " + result.exitCode)}`);
      }
      const output = `Exit code: ${result.exitCode}\n--- stdout ---\n${result.stdout || "(empty)"}\n--- stderr ---\n${result.stderr || "(empty)"}`;
      return { toolUseId: block.id, content: output, isError: !result.success, isShellFailure: !result.success };
    } catch (error) {
      spinner.stop();
      console.log(`     ${COL.red("$")} ${COL.red("Failed:")} ${COL.red(truncateCmd(input.command, 50))}`);
      return { toolUseId: block.id, content: `Shell error: ${error instanceof Error ? error.message : String(error)}`, isError: true, isShellFailure: false };
    }
  }

  private async handleSearchFiles(block: ToolUseBlock, input: SearchFilesInput): Promise<ToolExecutionResult> {
    printToolPending("search_files", { pattern: input.pattern, path: input.path, include: input.include });
    try {
      const content = await toolSearchFiles(input.pattern, this.config.workingDirectory, input.path ?? ".", input.include ?? null);
      const matchCount = content.split("\n").filter(l => l.includes(":")).length - 1;
      printToolDone("search_files", { pattern: input.pattern, path: input.path, include: input.include }, true, `${matchCount} matches`);
      return { toolUseId: block.id, content, isError: false, isShellFailure: false };
    } catch (error) {
      printToolError("search_files", { pattern: input.pattern }, error instanceof Error ? error.message : String(error));
      return { toolUseId: block.id, content: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true, isShellFailure: false };
    }
  }

  private async handleGlob(block: ToolUseBlock, input: GlobInput): Promise<ToolExecutionResult> {
    printToolPending("glob", { pattern: input.pattern, path: input.path });
    try {
      const content = await toolGlob(input.pattern, this.config.workingDirectory, input.path ?? ".");
      const fileCount = content.split("\n").filter(l => l.trim() && !l.includes("Found")).length;
      printToolDone("glob", { pattern: input.pattern, path: input.path }, true, `${fileCount} files`);
      return { toolUseId: block.id, content, isError: false, isShellFailure: false };
    } catch (error) {
      printToolError("glob", { pattern: input.pattern }, error instanceof Error ? error.message : String(error));
      return { toolUseId: block.id, content: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true, isShellFailure: false };
    }
  }

  private async handleWebSearch(block: ToolUseBlock, input: WebSearchInput): Promise<ToolExecutionResult> {
    printToolPending("web_search", { query: input.query });
    try {
      const content = await webSearch(input.query, input.maxResults ?? 5);
      const resultCount = content.split("\n").filter(l => l.match(/^\d+\./)).length;
      printToolDone("web_search", { query: input.query }, true, `${resultCount} results`);
      return { toolUseId: block.id, content, isError: false, isShellFailure: false };
    } catch (error) {
      printToolError("web_search", { query: input.query }, error instanceof Error ? error.message : String(error));
      return { toolUseId: block.id, content: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true, isShellFailure: false };
    }
  }

  private async handleAskUser(block: ToolUseBlock, input: AskUserInput): Promise<ToolExecutionResult> {
    printToolPending("ask_user", { question: input.question });
    try {
      const answer = await this.askUserFn(input.question, input.options);
      printToolDone("ask_user", { question: input.question }, true, answer.slice(0, 80));
      return { toolUseId: block.id, content: answer, isError: false, isShellFailure: false };
    } catch (error) {
      printToolError("ask_user", { question: input.question }, error instanceof Error ? error.message : String(error));
      return { toolUseId: block.id, content: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true, isShellFailure: false };
    }
  }
}
