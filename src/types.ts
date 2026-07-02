import type Anthropic from "@anthropic-ai/sdk";
import pc from "picocolors";

export type Provider =
  | "anthropic"
  | "fireworks"
  | "openai"
  | "groq"
  | "together"
  | "openrouter"
  | "deepseek"
  | "mistral"
  | "cerebras"
  | "MiniMax"
  | "openai-compatible"
  | "anthropic-compatible";

export type ProviderType = "anthropic" | "openai";

export type ReasoningEffort = "off" | "low" | "medium" | "high" | "max";

export interface ProviderConfig {
  type: ProviderType;
  label: string;
  baseURL: string | undefined;
  apiKeyEnv: string[];
  defaultModel: string;
  supportsReasoning: boolean;
  color: (s: string) => string;
  description: string;
}

export const PROVIDERS: Record<Provider, ProviderConfig> = {
  fireworks: {
    type: "anthropic",
    label: "Fireworks AI",
    baseURL: "https://api.fireworks.ai/inference",
    apiKeyEnv: ["FIREWORKS_API_KEY"],
    defaultModel: "accounts/fireworks/models/glm-5p2",
    supportsReasoning: true,
    color: pc.magenta,
    description: "Kimi K2 · DeepSeek · GLM · Qwen · GPT-OSS",
  },
  anthropic: {
    type: "anthropic",
    label: "Anthropic",
    baseURL: undefined,
    apiKeyEnv: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    defaultModel: "claude-3-5-sonnet-20241022",
    supportsReasoning: true,
    color: pc.cyan,
    description: "Claude Sonnet 4 · Opus · Haiku",
  },
  openai: {
    type: "openai",
    label: "OpenAI",
    baseURL: undefined,
    apiKeyEnv: ["OPENAI_API_KEY"],
    defaultModel: "gpt-4o",
    supportsReasoning: true,
    color: pc.green,
    description: "GPT-4o · o1 · o3-mini",
  },
  groq: {
    type: "openai",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKeyEnv: ["GROQ_API_KEY"],
    defaultModel: "llama-3.3-70b-versatile",
    supportsReasoning: false,
    color: pc.yellow,
    description: "Llama 3.3 70B · Mixtral — ultra fast",
  },
  together: {
    type: "openai",
    label: "Together AI",
    baseURL: "https://api.together.xyz/v1",
    apiKeyEnv: ["TOGETHER_API_KEY"],
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    supportsReasoning: false,
    color: pc.blue,
    description: "Llama · DeepSeek · Qwen — open models",
  },
  openrouter: {
    type: "openai",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: ["OPENROUTER_API_KEY"],
    defaultModel: "anthropic/claude-3.5-sonnet",
    supportsReasoning: false,
    color: pc.red,
    description: "300+ models via single API",
  },
  deepseek: {
    type: "openai",
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    apiKeyEnv: ["DEEPSEEK_API_KEY"],
    defaultModel: "deepseek-chat",
    supportsReasoning: true,
    color: pc.blue,
    description: "DeepSeek V3 · R1 (reasoning)",
  },
  mistral: {
    type: "openai",
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    apiKeyEnv: ["MISTRAL_API_KEY"],
    defaultModel: "mistral-large-latest",
    supportsReasoning: false,
    color: pc.magenta,
    description: "Mistral Large · Codestral",
  },
  cerebras: {
    type: "openai",
    label: "Cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    apiKeyEnv: ["CEREBRAS_API_KEY"],
    defaultModel: "llama3.1-70b",
    supportsReasoning: false,
    color: pc.yellow,
    description: "Llama 3.1 — fastest inference",
  },
  MiniMax: {
    type: "anthropic",
    label: "MiniMax",
    baseURL: "https://api.MiniMax.io/anthropic",
    apiKeyEnv: ["MiniMax_API_KEY"],
    defaultModel: "MiniMax-M3",
    supportsReasoning: true,
    color: pc.red,
    description: "MiniMax M3 · M2.7 · M2.5 — 1M context, frontier coding",
  },
  "openai-compatible": {
    type: "openai",
    label: "OpenAI Compatible",
    baseURL: undefined,
    apiKeyEnv: ["OPENAI_COMPATIBLE_API_KEY"],
    defaultModel: "gpt-4o",
    supportsReasoning: false,
    color: pc.cyan,
    description: "Any OpenAI-compatible API (vLLM, Ollama, etc.)",
  },
  "anthropic-compatible": {
    type: "anthropic",
    label: "Anthropic Compatible",
    baseURL: undefined,
    apiKeyEnv: ["ANTHROPIC_COMPATIBLE_API_KEY"],
    defaultModel: "claude-3-5-sonnet-20241022",
    supportsReasoning: true,
    color: pc.magenta,
    description: "Any Anthropic-compatible API (AWS Bedrock, GCP, etc.)",
  },
};

export const PROVIDER_LIST: Provider[] = [
  "MiniMax",
  "fireworks",
  "anthropic",
  "openai",
  "groq",
  "deepseek",
  "together",
  "openrouter",
  "mistral",
  "cerebras",
  "openai-compatible",
  "anthropic-compatible",
];

export const REASONING_BUDGETS: Record<Exclude<ReasoningEffort, "off">, number> = {
  low: 2048,
  medium: 8192,
  high: 16384,
  max: 32768,
};

export const REASONING_LABELS: Record<ReasoningEffort, string> = {
  off: "Off — no reasoning",
  low: "Low — quick thinking",
  medium: "Medium — balanced",
  high: "High — deep reasoning",
  max: "Max — maximum effort",
};

export type AgentState =
  | "idle"
  | "parsing"
  | "planning"
  | "executing"
  | "self_healing"
  | "complete"
  | "error";

export interface AgentConfig {
  provider: Provider;
  providerType: ProviderType;
  apiKey: string;
  baseURL: string | undefined;
  model: string;
  maxTokens: number;
  maxSelfHealingAttempts: number;
  autoConfirm: boolean;
  workingDirectory: string;
  reasoningEffort: ReasoningEffort;
  contextLength: number | null;
}

export const DEFAULT_CONFIG: Partial<AgentConfig> = {
  maxTokens: 8192,
  maxSelfHealingAttempts: 5,
  autoConfirm: false,
  reasoningEffort: "off",
};

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
  contextLength: number | null;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  provider: Provider;
}

export type ConfirmFn = (message: string) => Promise<boolean>;
export type AskUserFn = (question: string, options?: string[]) => Promise<string>;

export type ToolName =
  | "list_files"
  | "view_file"
  | "write_file"
  | "patch_file"
  | "execute_shell"
  | "search_files"
  | "glob"
  | "web_search"
  | "ask_user";

export interface ListFilesInput { dir: string; }
export interface ViewFileInput { path: string; }
export interface WriteFileInput { path: string; content: string; }
export interface PatchFileInput { path: string; search: string; replace: string; replace_all?: boolean; }
export interface ExecuteShellInput { command: string; timeout?: number; }
export interface SearchFilesInput { pattern: string; path?: string; include?: string; }
export interface GlobInput { pattern: string; path?: string; }
export interface WebSearchInput { query: string; maxResults?: number; }
export interface AskUserInput { question: string; options?: string[]; }

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export interface ProjectFile {
  path: string;
  type: "file" | "directory";
  size: number;
}

export interface ProjectMap {
  root: string;
  files: ProjectFile[];
  totalFiles: number;
  totalDirs: number;
}

export interface ToolExecutionResult {
  toolUseId: string;
  content: string;
  isError: boolean;
  isShellFailure: boolean;
}

export type MessageParam = Anthropic.MessageParam;
export type RawMessage = Anthropic.Message;
export type Tool = Anthropic.Tool;
export type ToolUseBlock = Anthropic.ToolUseBlock;
export type ContentBlock = Anthropic.ContentBlock;
export type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
export type ContentBlockParam = Anthropic.ContentBlockParam;

export interface AgentRunResult {
  success: boolean;
  iterations: number;
  selfHealingUsed: number;
  finalMessage: string;
}

export interface PricingInfo {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const PROVIDER_PRICING: Partial<Record<Provider, Record<string, PricingInfo>>> = {
  anthropic: {
    "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
    "claude-3-5-sonnet-20241022": { inputPerMillion: 3, outputPerMillion: 15 },
    "claude-3-5-haiku-20241022": { inputPerMillion: 0.8, outputPerMillion: 4 },
    "claude-3-opus-20240229": { inputPerMillion: 15, outputPerMillion: 75 },
  },
  openai: {
    "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
    "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    "o1": { inputPerMillion: 15, outputPerMillion: 60 },
    "o3-mini": { inputPerMillion: 3, outputPerMillion: 12 },
  },
  deepseek: {
    "deepseek-chat": { inputPerMillion: 0.27, outputPerMillion: 1.1 },
    "deepseek-reasoner": { inputPerMillion: 0.55, outputPerMillion: 2.19 },
  },
  MiniMax: {
    "MiniMax-M3": { inputPerMillion: 0.2, outputPerMillion: 0.8 },
    "MiniMax-M2.7": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    "MiniMax-M2.5": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  },
};

export interface FileBackup {
  path: string;
  originalContent: string;
  timestamp: number;
}

export interface ContextFile {
  path: string;
  content: string;
  addedAt: number;
}

export interface SessionData {
  name: string;
  conversation: unknown[];
  config: Partial<AgentConfig>;
  modelInfo: Partial<ModelInfo>;
  timestamp: number;
  provider: Provider;
  model: string;
  reasoningEffort: ReasoningEffort;
}

export interface GitChange {
  status: string;
  file: string;
}

export interface AuraConfig {
  provider: Provider | null;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  autoConfirm: boolean;
  contextFiles: string[];
}

export interface ProjectTypeInfo {
  type: string;
  language: string;
  buildCmd: string | null;
  testCmd: string | null;
  lintCmd: string | null;
  runCmd: string | null;
  packageManager: string;
}

export interface SubagentResult {
  success: boolean;
  output: string;
  iterations: number;
  tokensUsed: number;
}

interface FireworksModelRaw {
  name: string;
  displayName: string | null;
  description: string | null;
  contextLength: number | null;
  supportsTools: boolean | null;
  supportsImageInput: boolean | null;
  supportsServerless: boolean | null;
  state: string | null;
}

interface FireworksListResponse {
  models: FireworksModelRaw[];
  nextPageToken: string | null;
  totalSize: number | null;
}

export type { FireworksModelRaw, FireworksListResponse };

export interface CommitStyle {
  type: "default" | "conventional" | "emoji";
}

export const COMMIT_EMOJIS: Record<string, string> = {
  feat: "\u2728",
  fix: "\uD83D\uDC1B",
  docs: "\uD83D\uDCDD",
  style: "\uD83D\uDCD6",
  refactor: "\u267B\uFE0F",
  test: "\u2705",
  chore: "\uD83D\uDD27",
  perf: "\u26A1",
  ci: "\uD83D\uDE9C",
  build: "\uD83D\uDD28",
  revert: "\u21A9\uFE0F",
};
