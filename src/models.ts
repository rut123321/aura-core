import * as p from "@clack/prompts";
import pc from "picocolors";
import { PROVIDERS } from "./types";
import type { FireworksListResponse, FireworksModelRaw, ModelInfo, Provider } from "./types";

const FIREWORKS_API_BASE = "https://api.fireworks.ai";
const FIREWORKS_LIST_MODELS_URL = `${FIREWORKS_API_BASE}/v1/accounts/fireworks/models`;
const FIREWORKS_PAGE_SIZE = 200;
const MAX_MODELS_TO_FETCH = 300;

const ALL_CURATED: Record<Provider, ModelInfo[]> = {
  fireworks: [
    m("accounts/fireworks/models/glm-5p2", "GLM 5.2", "Top-tier reasoning & coding, fast inference", 131072, true, false, true, "fireworks"),
    m("accounts/fireworks/models/kimi-k2p6", "Kimi K2.6", "Excellent agentic tool use, vision support", 131072, true, true, true, "fireworks"),
    m("accounts/fireworks/models/deepseek-v4-pro", "DeepSeek V4 Pro", "Complex reasoning & research agents", 131072, true, false, true, "fireworks"),
    m("accounts/fireworks/models/deepseek-v4-flash", "DeepSeek V4 Flash", "Fast extraction, classification", 131072, true, false, true, "fireworks"),
    m("accounts/fireworks/models/qwen3p6-plus", "Qwen3.6 Plus", "Long context, multimodal, strong planning", 131072, true, true, true, "fireworks"),
    m("accounts/fireworks/models/minimax-m2p7", "MiniMax M2.7", "Strong agentic & coding capabilities", 131072, true, false, true, "fireworks"),
    m("accounts/fireworks/models/gpt-oss-120b", "GPT-OSS 120B", "Open GPT model, medium size, good reasoning", 131072, true, false, true, "fireworks"),
    m("accounts/fireworks/models/gpt-oss-20b", "GPT-OSS 20B", "Small & fast, good for classification", 131072, true, false, true, "fireworks"),
    m("accounts/fireworks/models/kimi-k2p5", "Kimi K2.5", "Fast agentic, good tool use", 131072, true, false, true, "fireworks"),
    m("accounts/fireworks/models/step-3p7-flash-nvfp4", "Step 3.7 Flash", "Ultra fast, vision support", 131072, true, true, true, "fireworks"),
  ],
  anthropic: [
    m("claude-sonnet-4-20250514", "Claude Sonnet 4", "Latest gen, best speed/intelligence balance", 200000, true, true, true, "anthropic"),
    m("claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet", "Excellent coding, fast & capable", 200000, true, true, true, "anthropic"),
    m("claude-3-5-haiku-20241022", "Claude 3.5 Haiku", "Fastest, good for simple tasks", 200000, true, true, false, "anthropic"),
    m("claude-3-opus-20240229", "Claude 3 Opus", "Most powerful, slower & expensive", 200000, true, true, true, "anthropic"),
  ],
  openai: [
    m("gpt-4o", "GPT-4o", "Multimodal, fast, great for coding", 128000, true, true, false, "openai"),
    m("gpt-4o-mini", "GPT-4o mini", "Fast & affordable, good for most tasks", 128000, true, true, false, "openai"),
    m("o1", "o1", "Deep reasoning, best for complex problems", 200000, true, false, true, "openai"),
    m("o1-mini", "o1-mini", "Faster reasoning, cheaper", 128000, true, false, true, "openai"),
    m("o3-mini", "o3-mini", "Latest reasoning model, efficient", 200000, true, false, true, "openai"),
    m("gpt-4-turbo", "GPT-4 Turbo", "Previous gen, still strong", 128000, true, true, false, "openai"),
  ],
  groq: [
    m("llama-3.3-70b-versatile", "Llama 3.3 70B", "Most capable Llama on Groq, ultra fast", 128000, true, false, false, "groq"),
    m("llama-3.1-8b-instant", "Llama 3.1 8B", "Ultra low latency, simple tasks", 128000, true, false, false, "groq"),
    m("mixtral-8x7b-32768", "Mixtral 8x7B", "MoE model, 32K context", 32768, true, false, false, "groq"),
    m("llama-3.2-90b-vision-preview", "Llama 3.2 90B Vision", "Vision-capable Llama", 128000, true, true, false, "groq"),
  ],
  together: [
    m("meta-llama/Llama-3.3-70B-Instruct-Turbo", "Llama 3.3 70B Turbo", "Fast Llama inference", 128000, true, false, false, "together"),
    m("deepseek-ai/DeepSeek-V3", "DeepSeek V3", "Strong coding & reasoning", 64000, true, false, true, "together"),
    m("Qwen/Qwen2.5-72B-Instruct-Turbo", "Qwen 2.5 72B", "Excellent multilingual & coding", 128000, true, false, false, "together"),
    m("meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", "Llama 3.1 405B", "Largest open model", 128000, true, false, false, "together"),
  ],
  openrouter: [
    m("anthropic/claude-3.5-sonnet", "Claude 3.5 Sonnet", "Via OpenRouter", 200000, true, true, true, "openrouter"),
    m("openai/gpt-4o", "GPT-4o", "Via OpenRouter", 128000, true, true, false, "openrouter"),
    m("google/gemini-pro-1.5", "Gemini Pro 1.5", "Google's model via OpenRouter", 2000000, true, true, false, "openrouter"),
    m("meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B", "Via OpenRouter", 128000, true, false, false, "openrouter"),
    m("deepseek/deepseek-chat", "DeepSeek V3", "Via OpenRouter", 64000, true, false, true, "openrouter"),
  ],
  deepseek: [
    m("deepseek-chat", "DeepSeek V3", "Excellent coding, affordable", 64000, true, false, false, "deepseek"),
    m("deepseek-reasoner", "DeepSeek R1", "Reasoning model, shows thought process", 64000, true, false, true, "deepseek"),
  ],
  mistral: [
    m("mistral-large-latest", "Mistral Large", "Top-tier Mistral, great for coding", 128000, true, false, false, "mistral"),
    m("codestral-latest", "Codestral", "Specialized for code generation", 32000, true, false, false, "mistral"),
    m("mistral-small-latest", "Mistral Small", "Fast & affordable", 32000, true, false, false, "mistral"),
  ],
  cerebras: [
    m("llama3.1-70b", "Llama 3.1 70B", "Fastest 70B inference", 128000, true, false, false, "cerebras"),
    m("llama3.1-8b", "Llama 3.1 8B", "Ultra fast small model", 128000, true, false, false, "cerebras"),
    m("qwen-2.5-72b", "Qwen 2.5 72B", "Strong coding on Cerebras", 128000, true, false, false, "cerebras"),
  ],
  MiniMax: [
    m("MiniMax-M3", "MiniMax M3", "Frontier coding, 1M context, MSA sparse attention, multimodal", 1000000, true, true, true, "MiniMax"),
    m("MiniMax-M2.7", "MiniMax M2.7", "Strong coding & agentic, 512K context", 512000, true, true, true, "MiniMax"),
    m("MiniMax-M2.5", "MiniMax M2.5", "Fast & affordable, 256K context", 256000, true, false, false, "MiniMax"),
  ],
};

function m(
  id: string,
  label: string,
  description: string,
  contextLength: number,
  supportsTools: boolean,
  supportsVision: boolean,
  supportsReasoning: boolean,
  provider: Provider = "fireworks",
): ModelInfo {
  return {
    id,
    label,
    description,
    contextLength,
    supportsTools,
    supportsVision,
    supportsReasoning,
    provider,
  };
}

function extractShortName(fullName: string): string {
  const parts = fullName.split("/");
  return parts[parts.length - 1] ?? fullName;
}

function buildModelInfo(raw: FireworksModelRaw): ModelInfo {
  const shortName = extractShortName(raw.name);
  return {
    id: raw.name,
    label: raw.displayName ?? shortName,
    description: raw.description ?? "",
    contextLength: raw.contextLength ?? null,
    supportsTools: raw.supportsTools ?? false,
    supportsVision: raw.supportsImageInput ?? false,
    supportsReasoning: true,
    provider: "fireworks",
  };
}

export async function fetchFireworksModels(apiKey: string): Promise<ModelInfo[]> {
  const allModels: ModelInfo[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < 5; page++) {
    const url = new URL(FIREWORKS_LIST_MODELS_URL);
    url.searchParams.set("pageSize", String(FIREWORKS_PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let resp: Response;
    try {
      resp = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      });
    } catch {
      throw new Error("Failed to connect to Fireworks API");
    }

    if (!resp.ok) {
      if (resp.status === 401) throw new Error("Invalid Fireworks API key");
      if (resp.status === 429) throw new Error("Fireworks API rate limited");
      const body = await resp.text().catch(() => "");
      throw new Error(`Fireworks API error (${resp.status}): ${body.slice(0, 200)}`);
    }

    const data = (await resp.json()) as FireworksListResponse;
    for (const raw of data.models ?? []) {
      if (!(raw.supportsServerless ?? false)) continue;
      if (!(raw.supportsTools ?? false)) continue;
      if (raw.state !== "READY" && raw.state !== null) continue;
      allModels.push(buildModelInfo(raw));
    }

    pageToken = data.nextPageToken ?? null;
    if (!pageToken || allModels.length >= MAX_MODELS_TO_FETCH) break;
  }

  allModels.sort((a, b) => a.label.localeCompare(b.label));
  return allModels;
}

export function getCuratedModels(provider: Provider): ModelInfo[] {
  const models = ALL_CURATED[provider] ?? [];
  return models.map((model) => ({ ...model, provider }));
}

export function findModelById(models: ModelInfo[], id: string): ModelInfo | null {
  return models.find((m) => m.id === id) ?? null;
}

interface SelectOption {
  value: string;
  label: string;
  hint: string;
}

function fmtCtx(ctx: number | null): string {
  if (!ctx) return "";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}K`;
  return `${ctx}`;
}

function buildSelectOptions(models: ModelInfo[]): SelectOption[] {
  return models.map((m) => {
    const c = PROVIDERS[m.provider].color;
    const tags: string[] = [];
    if (m.supportsTools) tags.push("tools");
    if (m.supportsVision) tags.push("vision");
    if (m.supportsReasoning) tags.push("reasoning");
    const tagStr = tags.length > 0 ? ` ${pc.gray(`[${tags.join(",")}]`)}` : "";
    const ctxStr = fmtCtx(m.contextLength);
    const hintParts = [ctxStr && `${pc.gray(ctxStr + " ctx")}`, m.description].filter(Boolean);
    return {
      value: m.id,
      label: `${c(m.label)}${tagStr}`,
      hint: hintParts.join(" — "),
    };
  });
}

export async function selectModelInteractive(
  provider: Provider,
  apiKey: string | null,
): Promise<ModelInfo | null> {
  const c = PROVIDERS[provider].color;
  const curated = getCuratedModels(provider);
  let liveModels: ModelInfo[] = [];
  let usedFallback = false;

  if (provider === "fireworks" && apiKey) {
    process.stdout.write(`  ${pc.cyan("◇")} ${pc.gray("Fetching models from Fireworks API...")}\n`);
    try {
      liveModels = await fetchFireworksModels(apiKey);
      process.stdout.write(`\r${" ".repeat(60)}\r`);
      if (liveModels.length === 0) {
        console.log(`  ${pc.yellow("⚠")}  ${pc.gray("No live models. Using curated list.")}\n`);
        usedFallback = true;
        liveModels = curated;
      } else {
        console.log(`  ${pc.green("✓")} ${pc.gray(`Found ${liveModels.length} models with tool support`)}\n`);
      }
    } catch (error) {
      process.stdout.write(`\r${" ".repeat(60)}\r`);
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ${pc.yellow("⚠")}  ${pc.gray(msg)}`);
      console.log(`  ${pc.gray("Using curated list instead.")}\n`);
      usedFallback = true;
      liveModels = curated;
    }
  } else {
    liveModels = curated;
  }

  if (usedFallback || provider !== "fireworks") {
    const options = buildSelectOptions(liveModels);
    const selected = await p.select({
      message: `Select a ${c(PROVIDERS[provider].label)} model:`,
      options,
    });
    if (p.isCancel(selected)) return null;
    return findModelById(liveModels, selected as string);
  }

  const allOptions: SelectOption[] = [
    {
      value: "__curated__",
      label: pc.cyan("★ Recommended models"),
      hint: "Curated list of best models for coding",
    },
    ...buildSelectOptions(liveModels),
  ];

  const selected = await p.select({
    message: `Select a ${c(PROVIDERS[provider].label)} model:`,
    options: allOptions,
  });

  if (p.isCancel(selected)) return null;
  const choice = selected as string;

  if (choice === "__curated__") {
    const curatedOptions = buildSelectOptions(curated);
    const curatedSelected = await p.select({
      message: "Recommended models:",
      options: curatedOptions,
    });
    if (p.isCancel(curatedSelected)) return null;
    return findModelById(curated, curatedSelected as string);
  }

  return findModelById(liveModels, choice);
}
