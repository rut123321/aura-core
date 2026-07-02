import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { SessionData } from "./types";

const SESSION_DIR = join(process.env.HOME || process.env.USERPROFILE || ".", ".aura-core", "sessions");

function ensureSessionDir(): void {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, "_").slice(0, 80);
}

export function saveSession(name: string, data: SessionData): { success: boolean; path: string } {
  ensureSessionDir();
  const safeName = sanitizeName(name);
  const fileName = `${safeName}.json`;
  const filePath = join(SESSION_DIR, fileName);
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, path: filePath };
  }
}

export function loadSession(name: string): SessionData | null {
  const safeName = sanitizeName(name);
  const filePath = join(SESSION_DIR, `${safeName}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as SessionData;
  } catch {
    return null;
  }
}

export function listSessions(): Array<{ name: string; timestamp: number; provider: string; model: string }> {
  ensureSessionDir();
  const files = readdirSync(SESSION_DIR).filter((f) => f.endsWith(".json"));
  const sessions: Array<{ name: string; timestamp: number; provider: string; model: string }> = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(SESSION_DIR, file), "utf-8");
      const data = JSON.parse(content) as SessionData;
      sessions.push({
        name: file.replace(/\.json$/, ""),
        timestamp: data.timestamp,
        provider: data.provider,
        model: data.model,
      });
    } catch {
      continue;
    }
  }
  sessions.sort((a, b) => b.timestamp - a.timestamp);
  return sessions;
}

export function deleteSession(name: string): boolean {
  const safeName = sanitizeName(name);
  const filePath = join(SESSION_DIR, `${safeName}.json`);
  if (!existsSync(filePath)) return false;
  try {
    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function exportSessionMarkdown(data: SessionData): string {
  const lines: string[] = [];
  lines.push(`# Aura-Core Session: ${data.name}`);
  lines.push(``);
  lines.push(`- **Date:** ${new Date(data.timestamp).toISOString()}`);
  lines.push(`- **Provider:** ${data.provider}`);
  lines.push(`- **Model:** ${data.model}`);
  lines.push(`- **Reasoning:** ${data.reasoningEffort}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  const conv = data.conversation as Array<{ role: string; content: unknown }>;
  for (const msg of conv) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        lines.push(`## User`);
        lines.push(``);
        lines.push(msg.content);
        lines.push(``);
      } else if (Array.isArray(msg.content)) {
        const textParts = (msg.content as Array<Record<string, unknown>>)
          .filter((b) => b.type === "text")
          .map((b) => b.text as string);
        if (textParts.length > 0) {
          lines.push(`## User`);
          lines.push(``);
          lines.push(textParts.join("\n"));
          lines.push(``);
        }
      }
    } else if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        lines.push(`## Assistant`);
        lines.push(``);
        lines.push(msg.content);
        lines.push(``);
      } else if (Array.isArray(msg.content)) {
        const textParts = (msg.content as Array<Record<string, unknown>>)
          .filter((b) => b.type === "text")
          .map((b) => b.text as string);
        if (textParts.length > 0) {
          lines.push(`## Assistant`);
          lines.push(``);
          lines.push(textParts.join("\n"));
          lines.push(``);
        }
      }
    }
  }

  return lines.join("\n");
}

export function getSessionDir(): string {
  return SESSION_DIR;
}

const SETTINGS_PATH = join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".aura-core",
  "settings.json",
);

export interface GlobalSettings {
  lastProvider: string | null;
  lastModel: string | null;
  lastReasoning: string | null;
  lastApiKey: string | null;
  lastApiKeyProvider: string | null;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  lastProvider: null,
  lastModel: null,
  lastReasoning: null,
  lastApiKey: null,
  lastApiKeyProvider: null,
};

export function loadGlobalSettings(): GlobalSettings {
  try {
    if (!existsSync(SETTINGS_PATH)) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) } as GlobalSettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveGlobalSettings(settings: GlobalSettings): void {
  try {
    const dir = join(process.env.HOME || process.env.USERPROFILE || ".", ".aura-core");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  } catch {
    /* swallow */
  }
}

export function autoSaveSession(agent: { getConversation: () => unknown[]; getConfig: () => unknown }, modelInfo: { provider: string; label: string; id: string }, reasoningEffort: string): void {
  const ts = Date.now();
  const name = `auto-${new Date(ts).toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const conv = agent.getConversation();
  if (conv.length === 0) return;
  const data = {
    name,
    conversation: conv as unknown[],
    config: agent.getConfig() as Record<string, unknown>,
    modelInfo: modelInfo as Record<string, unknown>,
    timestamp: ts,
    provider: modelInfo.provider,
    model: modelInfo.id,
    reasoningEffort,
  };
  saveSession(name, data as SessionData);
  trimAutoSessions(10);
}

export function trimAutoSessions(maxCount: number): void {
  ensureSessionDir();
  const files = readdirSync(SESSION_DIR)
    .filter(f => f.startsWith("auto-") && f.endsWith(".json"))
    .sort();
  while (files.length > maxCount) {
    const oldest = files.shift()!;
    try { unlinkSync(join(SESSION_DIR, oldest)); } catch { /* */ }
  }
}

export interface SessionSummary {
  name: string;
  timestamp: number;
  provider: string;
  model: string;
  reasoningEffort: string;
  messageCount: number;
}

export function listSessionsDetailed(): SessionSummary[] {
  ensureSessionDir();
  const files = readdirSync(SESSION_DIR).filter((f) => f.endsWith(".json"));
  const sessions: SessionSummary[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(SESSION_DIR, file), "utf-8");
      const data = JSON.parse(content) as SessionData;
      const conv = data.conversation as Array<unknown> | undefined;
      sessions.push({
        name: file.replace(/\.json$/, ""),
        timestamp: data.timestamp,
        provider: data.provider,
        model: data.model,
        reasoningEffort: data.reasoningEffort,
        messageCount: conv?.length ?? 0,
      });
    } catch {
      continue;
    }
  }
  sessions.sort((a, b) => b.timestamp - a.timestamp);
  return sessions;
}
