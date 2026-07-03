import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface LSPPosition { line: number; character: number; }
interface LSPRange { start: LSPPosition; end: LSPPosition; }
interface LSPLocation { uri: string; range: LSPRange; }
interface LSPDiagnostic {
  range: LSPRange;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
}
interface LSPHover {
  contents: { language: string; value: string } | string;
  range?: LSPRange;
}
interface LSPCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface LSPConfig {
  command: string;
  args: string[];
  languageId: string;
  rootPatterns: string[];
}

const KNOWN_SERVERS: Record<string, LSPConfig> = {
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    languageId: "typescript",
    rootPatterns: ["tsconfig.json", "package.json"],
  },
  python: {
    command: "pyright-langserver",
    args: ["--stdio"],
    languageId: "python",
    rootPatterns: ["pyproject.toml", "setup.py", "requirements.txt"],
  },
  go: {
    command: "gopls",
    args: [],
    languageId: "go",
    rootPatterns: ["go.mod"],
  },
  rust: {
    command: "rust-analyzer",
    args: [],
    languageId: "rust",
    rootPatterns: ["Cargo.toml"],
  },
};

export function detectLSP(workdir: string): LSPConfig | null {
  for (const cfg of Object.values(KNOWN_SERVERS)) {
    for (const pattern of cfg.rootPatterns) {
      if (existsSync(join(workdir, pattern))) {
        return cfg;
      }
    }
  }
  return null;
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export class LSPClient {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = "";
  private diagnostics = new Map<string, LSPDiagnostic[]>();
  private config: LSPConfig;
  private rootUri: string;
  private isReady = false;

  constructor(config: LSPConfig, workdir: string) {
    this.config = config;
    this.rootUri = `file://${workdir.replace(/\\/g, "/")}`;
  }

  async start(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.proc = spawn(this.config.command, this.config.args, { stdio: ["pipe", "pipe", "pipe"] });
      } catch { resolve(false); return; }
      this.proc.stdout?.on("data", (d: Buffer) => this.onData(d));
      this.proc.stderr?.on("data", () => {});
      this.proc.on("error", () => resolve(false));
      this.proc.on("exit", () => this.cleanup());
      this.initialize().then(() => { this.isReady = true; resolve(true); }, () => resolve(false));
    });
  }

  private onData(data: Buffer): void {
    this.buffer += data.toString();
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd);
      const m = header.match(/Content-Length: (\d+)/);
      if (!m) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const len = parseInt(m[1], 10);
      const start = headerEnd + 4;
      if (this.buffer.length < start + len) return;
      const body = this.buffer.slice(start, start + len);
      this.buffer = this.buffer.slice(start + len);
      try {
        const msg = JSON.parse(body) as JsonRpcMessage;
        if (msg.id !== undefined) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            this.pending.delete(msg.id);
            if (msg.error) pending.reject(new Error(msg.error.message));
            else pending.resolve(msg.result);
          }
        } else if (msg.method === "textDocument/publishDiagnostics") {
          const params = msg.params as { uri: string; diagnostics: LSPDiagnostic[] };
          this.diagnostics.set(params.uri, params.diagnostics);
        }
      } catch { /* */ }
    }
  }

  private send(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) return reject(new Error("not started"));
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
      this.proc.stdin.write(header + body);
    });
  }

  private async initialize(): Promise<void> {
    await this.send("initialize", {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          synchronization: { didOpen: true, didChange: true },
          hover: { contentFormat: ["plaintext", "markdown"] },
          completion: { completionItem: { snippetSupport: false } },
          definition: { linkSupport: true },
          references: {},
          publishDiagnostics: { relatedInformation: true },
        },
      },
    });
    this.send("initialized", {}).catch(() => {});
  }

  async didOpen(uri: string, text: string): Promise<void> {
    if (!this.isReady) return;
    const ext = uri.split(".").pop() ?? "";
    const langId = this.config.languageId === "typescript" && ext === "tsx" ? "typescriptreact" : this.config.languageId;
    await this.send("textDocument/didOpen", {
      textDocument: { uri, languageId: langId, version: 1, text },
    });
  }

  async getHover(uri: string, line: number, char: number): Promise<string | null> {
    if (!this.isReady) return null;
    try {
      const result = await this.send("textDocument/hover", {
        textDocument: { uri },
        position: { line, character: char },
      }) as LSPHover | null;
      if (!result?.contents) return null;
      const c = result.contents;
      if (typeof c === "string") return c;
      return c.value;
    } catch { return null; }
  }

  async getDefinition(uri: string, line: number, char: number): Promise<LSPLocation[]> {
    if (!this.isReady) return [];
    try {
      const result = await this.send("textDocument/definition", {
        textDocument: { uri },
        position: { line, character: char },
      }) as LSPLocation[] | LSPLocation | null;
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    } catch { return []; }
  }

  async getCompletions(uri: string, line: number, char: number): Promise<LSPCompletionItem[]> {
    if (!this.isReady) return [];
    try {
      const result = await this.send("textDocument/completion", {
        textDocument: { uri },
        position: { line, character: char },
      }) as LSPCompletionItem[] | null;
      return result ?? [];
    } catch { return []; }
  }

  getDiagnostics(uri: string): LSPDiagnostic[] {
    return this.diagnostics.get(uri) ?? [];
  }

  stop(): void { this.cleanup(); }
  isActive(): boolean { return this.isReady; }

  private cleanup(): void {
    this.proc?.kill();
    this.proc = null;
    this.isReady = false;
    for (const p of this.pending.values()) p.reject(new Error("LSP stopped"));
    this.pending.clear();
  }
}

let lspClient: LSPClient | null = null;

export async function startLSP(workdir: string): Promise<LSPClient | null> {
  const cfg = detectLSP(workdir);
  if (!cfg) return null;
  const client = new LSPClient(cfg, workdir);
  const ok = await client.start();
  if (ok) {
    lspClient = client;
    return client;
  }
  return null;
}

export function getLSP(): LSPClient | null { return lspClient; }
export function stopLSP(): void { lspClient?.stop(); lspClient = null; }
