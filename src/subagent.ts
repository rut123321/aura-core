import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { TOOL_DEFINITIONS, toolListFiles, toolViewFile, toolSearchFiles, toolGlob } from "./tools";
import type { AgentConfig, MessageParam, RawMessage, ToolExecutionResult, ToolUseBlock, ToolResultBlockParam } from "./types";

const SUBAGENT_PROMPT = `You are a subagent of Aura-Core. Your role is to perform focused research and analysis tasks delegated by the main agent.

You have access to read-only tools: list_files, view_file, search_files, glob. You CANNOT write, patch, or execute shell commands.

Your job:
1. Analyze the codebase efficiently using search_files and glob to find relevant code.
2. Read files with view_file to understand them.
3. Return a detailed, structured summary of your findings.

Be thorough but concise. Focus on answering the specific question you were asked.`;

const SUBAGENT_MAX_ITERATIONS = 15;

export async function runSubagent(
  config: AgentConfig,
  task: string,
  workingDir: string,
): Promise<{ success: boolean; output: string; iterations: number; tokensUsed: number }> {
  const readOnlyTools = TOOL_DEFINITIONS.filter(t =>
    t.name === "list_files" || t.name === "view_file" || t.name === "search_files" || t.name === "glob"
  );

  let client: Anthropic | OpenAI;
  if (config.providerType === "anthropic") {
    const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey: config.apiKey };
    if (config.baseURL) opts.baseURL = config.baseURL;
    client = new Anthropic(opts);
  } else {
    const opts: ConstructorParameters<typeof OpenAI>[0] = { apiKey: config.apiKey, dangerouslyAllowBrowser: true };
    if (config.baseURL) opts.baseURL = config.baseURL;
    client = new OpenAI(opts);
  }

  const conversation: MessageParam[] = [
    { role: "user", content: task },
  ];

  let totalInput = 0;
  let totalOutput = 0;
  let iterations = 0;
  let lastText = "";

  for (let i = 0; i < SUBAGENT_MAX_ITERATIONS; i++) {
    iterations++;
    let response: RawMessage;

    if (config.providerType === "anthropic") {
      const ac = client as Anthropic;
      const params: Record<string, unknown> = {
        model: config.model,
        max_tokens: 4096,
        system: SUBAGENT_PROMPT,
        messages: conversation,
        tools: readOnlyTools,
      };
      const msg = await ac.messages.create(params as unknown as Parameters<Anthropic["messages"]["create"]>[0]);
      response = msg as unknown as RawMessage;
      const msgAny = msg as unknown as { usage?: { input_tokens?: number; output_tokens?: number } };
      if (msgAny.usage) {
        totalInput += msgAny.usage.input_tokens ?? 0;
        totalOutput += msgAny.usage.output_tokens ?? 0;
      }
    } else {
      const oc = client as OpenAI;
      const messages: Record<string, unknown>[] = [
        { role: "system", content: SUBAGENT_PROMPT },
      ];
      for (const m of conversation) {
        if (typeof m.content === "string") {
          messages.push({ role: m.role, content: m.content });
        }
      }
      const tools = readOnlyTools.map(t => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
      }));
      const msg = await oc.chat.completions.create({
        model: config.model,
        messages: messages as unknown as Parameters<OpenAI["chat"]["completions"]["create"]>[0]["messages"],
        tools: tools as unknown as Parameters<OpenAI["chat"]["completions"]["create"]>[0]["tools"],
        max_tokens: 4096,
      } as unknown as Parameters<OpenAI["chat"]["completions"]["create"]>[0]) as unknown as {
        id: string;
        choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = msg.choices[0];
      const text = choice.message.content ?? "";
      const toolCalls = choice.message.tool_calls ?? [];
      const content: Array<Record<string, unknown>> = [];
      if (text) { content.push({ type: "text", text }); lastText = text; }
      for (const tc of toolCalls) {
        let parsedInput: unknown = {};
        try { parsedInput = JSON.parse(tc.function.arguments || "{}"); } catch { parsedInput = { raw: tc.function.arguments }; }
        content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: parsedInput });
      }
      response = {
        id: msg.id,
        type: "message",
        role: "assistant",
        content: content as unknown as never,
        model: config.model,
        stop_reason: toolCalls.length > 0 ? "tool_use" : "end_turn",
        stop_sequence: null,
        usage: { input_tokens: msg.usage?.prompt_tokens ?? 0, output_tokens: msg.usage?.completion_tokens ?? 0 },
      } as unknown as RawMessage;
      totalInput += msg.usage?.prompt_tokens ?? 0;
      totalOutput += msg.usage?.completion_tokens ?? 0;
    }

    conversation.push({ role: "assistant", content: response.content as never });

    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(b => b.type === "text") as { text: string } | undefined;
      if (textBlock) lastText = textBlock.text;
      break;
    }

    const toolResults: ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeReadOnlyTool(block, workingDir);
      toolResults.push({
        type: "tool_result",
        tool_use_id: result.toolUseId,
        content: result.content,
        is_error: result.isError,
      });
    }
    conversation.push({ role: "user", content: toolResults });
  }

  return {
    success: true,
    output: lastText,
    iterations,
    tokensUsed: totalInput + totalOutput,
  };
}

async function executeReadOnlyTool(block: ToolUseBlock, workingDir: string): Promise<ToolExecutionResult> {
  const input = (block.input ?? {}) as Record<string, unknown>;
  try {
    switch (block.name) {
      case "list_files":
        return { toolUseId: block.id, content: await toolListFiles((input.dir as string) ?? ".", workingDir), isError: false, isShellFailure: false };
      case "view_file":
        return { toolUseId: block.id, content: await toolViewFile((input.path as string) ?? "", workingDir), isError: false, isShellFailure: false };
      case "search_files":
        return { toolUseId: block.id, content: await toolSearchFiles((input.pattern as string) ?? "", workingDir, (input.path as string) ?? ".", (input.include as string) ?? null), isError: false, isShellFailure: false };
      case "glob":
        return { toolUseId: block.id, content: await toolGlob((input.pattern as string) ?? "", workingDir, (input.path as string) ?? "."), isError: false, isShellFailure: false };
      default:
        return { toolUseId: block.id, content: `Unknown tool: ${block.name}`, isError: true, isShellFailure: false };
    }
  } catch (e) {
    return { toolUseId: block.id, content: `Error: ${e instanceof Error ? e.message : String(e)}`, isError: true, isShellFailure: false };
  }
}
