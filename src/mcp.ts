import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class MCPClient {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = "";
  private tools: MCPTool[] = [];
  public readonly config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...this.config.env };
      this.proc = spawn(this.config.command, this.config.args, { env, stdio: ["pipe", "pipe", "pipe"] });
      this.proc.stdout?.on("data", (data: Buffer) => this.onData(data));
      this.proc.stderr?.on("data", () => { /* ignore stderr */ });
      this.proc.on("error", reject);
      this.proc.on("exit", () => this.cleanup());
      this.initialize().then(resolve, reject);
    });
  }

  private onData(data: Buffer): void {
    this.buffer += data.toString();
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        const pending = this.pending.get(msg.id);
        if (pending) {
          this.pending.delete(msg.id);
          if (msg.error) pending.reject(new Error(msg.error.message));
          else pending.resolve(msg.result);
        }
      } catch { /* ignore parse errors */ }
    }
  }

  private send(req: JsonRpcRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) return reject(new Error("not started"));
      this.pending.set(req.id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  private async initialize(): Promise<void> {
    await this.send({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "aura-core", version: "2.2.0" },
      },
    });
    this.send({ jsonrpc: "2.0", id: this.nextId++, method: "notifications/initialized" }).catch(() => {});
    const toolsResult = await this.send({ jsonrpc: "2.0", id: this.nextId++, method: "tools/list", params: {} }) as { tools: MCPTool[] };
    this.tools = toolsResult.tools ?? [];
  }

  getTools(): MCPTool[] { return this.tools; }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.send({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    }) as { content: Array<{ type: string; text?: string }> };
    return (result.content ?? []).map(c => c.text ?? "").join("\n");
  }

  stop(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.proc?.kill();
    this.proc = null;
    for (const p of this.pending.values()) p.reject(new Error("MCP server stopped"));
    this.pending.clear();
  }
}

let clients: MCPClient[] = [];

export function loadMCPConfig(workdir: string): MCPServerConfig[] {
  const configPath = join(workdir, ".aurarc");
  if (!existsSync(configPath)) return [];
  try {
    const content = readFileSync(configPath, "utf-8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const cfg = JSON.parse(content) as { mcpServers?: Record<string, Omit<MCPServerConfig, "name">> };
    if (!cfg.mcpServers) return [];
    return Object.entries(cfg.mcpServers).map(([name, s]) => ({ name, ...s }));
  } catch {
    return [];
  }
}

export async function startMCPServers(workdir: string): Promise<MCPClient[]> {
  const configs = loadMCPConfig(workdir);
  const started: MCPClient[] = [];
  for (const cfg of configs) {
    const client = new MCPClient(cfg);
    try {
      await client.start();
      clients.push(client);
      started.push(client);
    } catch { /* server failed to start */ }
  }
  return started;
}

export function stopMCPServers(): void {
  for (const c of clients) c.stop();
  clients = [];
}

export function getMCPServers(): MCPClient[] { return clients; }
