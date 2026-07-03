import pc from "picocolors";

// ── True color helpers ─────────────────────────────────────────────────
function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bg(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

const RESET = "\x1b[0m";

// ── Color palettes ─────────────────────────────────────────────────────
const PALETTES = {
  rainbow: [
    [255, 80, 80], [255, 165, 0], [255, 255, 0], [80, 255, 80],
    [80, 165, 255], [147, 112, 219], [255, 105, 180],
  ],
  sunset: [
    [255, 94, 77], [255, 159, 64], [255, 206, 38], [255, 245, 156],
  ],
  ocean: [
    [20, 30, 48], [36, 59, 85], [67, 105, 144], [128, 168, 209],
  ],
  cyber: [
    [255, 0, 255], [0, 255, 255], [255, 255, 0], [255, 0, 128],
  ],
  aura: [
    [250, 178, 131], [224, 159, 191], [180, 144, 217], [120, 178, 232],
  ],
};

// ── Gradient text with palette ─────────────────────────────────────────
export function gradText(text: string, palette: keyof typeof PALETTES = "aura"): string {
  const colors = PALETTES[palette];
  const chars = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const t = chars.length === 1 ? 0 : i / (chars.length - 1);
    const idx = t * (colors.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(colors.length - 1, lo + 1);
    const f = idx - lo;
    const a = colors[lo];
    const b = colors[hi];
    const r = Math.round(a[0] + (b[0] - a[0]) * f);
    const g = Math.round(a[1] + (b[1] - a[1]) * f);
    const bl = Math.round(a[2] + (b[2] - a[2]) * f);
    out.push(rgb(r, g, bl) + chars[i] + RESET);
  }
  return out.join("");
}

// ── Vertical gradient (per line) ──────────────────────────────────────
export function gradLines(lines: string[], fromHex: string, toHex: string): string {
  const a = [parseInt(fromHex.slice(0, 2), 16), parseInt(fromHex.slice(2, 4), 16), parseInt(fromHex.slice(4, 6), 16)];
  const b = [parseInt(toHex.slice(0, 2), 16), parseInt(toHex.slice(2, 4), 16), parseInt(toHex.slice(4, 6), 16)];
  return lines.map((line, i) => {
    const t = lines.length === 1 ? 0 : i / (lines.length - 1);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return rgb(r, g, bl) + line + RESET;
  }).join("\n");
}

// ── Rainbow shift (animated) ──────────────────────────────────────────
export function rainbow(text: string, shift: number = 0): string {
  const colors = PALETTES.rainbow;
  const chars = Array.from(text);
  return chars.map((c, i) => {
    const idx = ((i + shift) % colors.length + colors.length) % colors.length;
    const [r, g, b] = colors[idx];
    return rgb(r, g, b) + c + RESET;
  }).join("");
}

// ── Box-drawing characters ────────────────────────────────────────────
export const BOX = {
  // Single
  tl: "\u256D", tr: "\u256E", bl: "\u2570", br: "\u256F",
  h: "\u2500", v: "\u2502",
  // Rounded
  rTl: "\u256D", rTr: "\u256E", rBl: "\u2570", rBr: "\u256F",
  // Double
  dTl: "\u2554", dTr: "\u2557", dBl: "\u255A", dBr: "\u255D",
  dH: "\u2550", dV: "\u2551",
  // Heavy
  hTl: "\u250F", hTr: "\u2513", hBl: "\u2517", hBr: "\u251B",
  hH: "\u2501", hV: "\u2503",
  // T-junctions
  tUp: "\u2534", tDown: "\u252C", tLeft: "\u251E", tRight: "\u251C",
  // Cross
  cross: "\u253C",
  // Dots
  dot: "\u00B7", bullet: "\u2022", small: "\u22C5",
  // Arrows
  right: "\u2192", left: "\u2190", up: "\u2191", down: "\u2193",
  // Sparkles
  star: "\u2726", diamond: "\u25C6", bulletD: "\u25CF",
  square: "\u25A0", squareS: "\u25AB",
};

export type BoxStyle = "single" | "rounded" | "double" | "heavy";

function getBoxChars(style: BoxStyle): { tl: string; tr: string; bl: string; br: string; h: string; v: string } {
  switch (style) {
    case "rounded": return { tl: BOX.rTl, tr: BOX.rTr, bl: BOX.rBl, br: BOX.rBr, h: BOX.h, v: BOX.v };
    case "double": return { tl: BOX.dTl, tr: BOX.dTr, bl: BOX.dBl, br: BOX.dBr, h: BOX.dH, v: BOX.dV };
    case "heavy": return { tl: BOX.hTl, tr: BOX.hTr, bl: BOX.hBl, br: BOX.hBr, h: BOX.hH, v: BOX.hV };
    default: return { tl: BOX.tl, tr: BOX.tr, bl: BOX.bl, br: BOX.br, h: BOX.h, v: BOX.v };
  }
}

// ── Box with title and content ────────────────────────────────────────
export interface BoxOptions {
  title?: string;
  width?: number;
  style?: BoxStyle;
  borderColor?: (s: string) => string;
  titleColor?: (s: string) => string;
  paddingX?: number;
  align?: "left" | "center" | "right";
}

export function box(title: string, content: string[], opts: BoxOptions = {}): string {
  const style = opts.style ?? "rounded";
  const bc = opts.borderColor ?? pc.gray;
  const tc = opts.titleColor ?? pc.cyan;
  const padX = opts.paddingX ?? 1;
  const chars = getBoxChars(style);
  const width = opts.width ?? Math.max(title.length + 4, ...content.map(l => l.length + padX * 2));
  const innerWidth = width - 2;
  const lines: string[] = [];
  const topTitle = title ? ` ${title} ` : "";
  const topLeft = chars.h.repeat(Math.max(0, Math.floor((width - topTitle.length - 2) / 2)));
  const topRight = chars.h.repeat(Math.max(0, width - topTitle.length - 2 - Math.floor((width - topTitle.length - 2) / 2)));
  lines.push(bc(chars.tl) + bc(topLeft) + (title ? tc(topTitle) : "") + bc(topRight) + bc(chars.tr));
  for (const c of content) {
    const padded = c.padEnd(innerWidth - padX * 2);
    const leftSpace = " ".repeat(padX);
    const rightSpace = " ".repeat(Math.max(0, innerWidth - padX - padded.length));
    lines.push(bc(chars.v) + leftSpace + padded + rightSpace + bc(chars.v));
  }
  lines.push(bc(chars.bl) + bc(chars.h.repeat(innerWidth)) + bc(chars.br));
  return lines.join("\n");
}

// ── Spinner frames ────────────────────────────────────────────────────
const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2838", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
const DOTS_FRAMES = ["\u28FE", "\u28FD", "\u28FB", "\u28BF", "\u287F", "\u28DF", "\u28EF", "\u28F7"];
const PULSE_FRAMES = ["\u25D0", "\u25D3", "\u25D1", "\u25D2"];
const ARROW_FRAMES = ["\u2190", "\u2196", "\u2191", "\u2197", "\u2192", "\u2198", "\u2193", "\u2199"];

export type SpinnerStyle = "braille" | "dots" | "pulse" | "arrows" | "gradient";

function getSpinnerFrames(style: SpinnerStyle): string[] {
  switch (style) {
    case "dots": return DOTS_FRAMES;
    case "pulse": return PULSE_FRAMES;
    case "arrows": return ARROW_FRAMES;
    case "gradient": return SPINNER_FRAMES;
    default: return SPINNER_FRAMES;
  }
}

export class Spinner {
  private frame = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private text: string;
  private style: SpinnerStyle;
  private color: (s: string) => string;

  constructor(text: string, style: SpinnerStyle = "gradient", color: (s: string) => string = pc.cyan) {
    this.text = text;
    this.style = style;
    this.color = color;
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.render();
      this.frame = (this.frame + 1) % getSpinnerFrames(this.style).length;
    }, 80);
  }

  setText(text: string): void {
    this.text = text;
    if (!this.interval) this.render();
  }

  private render(): void {
    const frames = getSpinnerFrames(this.style);
    const ch = frames[this.frame];
    process.stdout.write(`\r\x1b[2K   ${this.color(ch)} ${pc.gray(this.text)}`);
  }

  stop(finalText?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (finalText) {
      process.stdout.write(`\r\x1b[2K   ${pc.green("\u2713")} ${pc.gray(finalText)}\n`);
    } else {
      process.stdout.write("\r\x1b[2K");
    }
  }
}

// ── Progress bar with gradient ────────────────────────────────────────
export function progressBar(value: number, max: number, width: number = 20, label: string = ""): string {
  const pct = Math.min(1, value / max);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const colors = PALETTES.aura;
  let bar = "";
  for (let i = 0; i < filled; i++) {
    const t = filled === 1 ? 0 : i / (filled - 1);
    const idx = t * (colors.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(colors.length - 1, lo + 1);
    const f = idx - lo;
    const a = colors[lo];
    const b = colors[hi];
    const r = Math.round(a[0] + (b[0] - a[0]) * f);
    const g = Math.round(a[1] + (b[1] - a[1]) * f);
    const bl = Math.round(a[2] + (b[2] - a[2]) * f);
    bar += bg(r, g, bl) + " " + RESET;
  }
  bar += pc.gray("\u2591".repeat(empty));
  const labelStr = label ? ` ${pc.gray(label)}` : "";
  return `${bar} ${pc.white(`${(pct * 100).toFixed(1)}%`)}${labelStr}`;
}

// ── Tokens bar (in/out visual) ────────────────────────────────────────
export function tokenBar(input: number, output: number, total: number, width: number = 30): string {
  if (total === 0) return pc.gray("\u2591".repeat(width)) + ` ${pc.dim("0%")}`;
  const inPct = input / total;
  const outPct = output / total;
  const inW = Math.max(0, Math.round(inPct * width));
  const outW = Math.max(0, Math.round(outPct * width));
  const remW = Math.max(0, width - inW - outW);
  const inBar = "\x1b[38;2;92;156;245m" + "\u2588".repeat(inW) + RESET;
  const outBar = "\x1b[38;2;250;178;131m" + "\u2588".repeat(outW) + RESET;
  const remBar = pc.gray("\u2591".repeat(remW));
  return `${inBar}${outBar}${remBar} ${pc.gray(`${total.toLocaleString()} tok`)}`;
}

// ── Tree view (file tree) ─────────────────────────────────────────────
export interface TreeNode {
  name: string;
  isDir: boolean;
  children?: TreeNode[];
}

export function renderTree(nodes: TreeNode[], depth: number = 0, maxDepth: number = 3): string {
  if (depth > maxDepth) return "";
  const out: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const prefix = "  ".repeat(depth) + (isLast ? "\u2514\u2500 " : "\u251C\u2500 ");
    const icon = node.isDir ? "\x1b[38;2;127;216;143m\u25B8\x1b[39m" : "\x1b[38;2;152;195;121m\u2022\x1b[39m";
    const name = node.isDir ? pc.cyan(node.name) : pc.white(node.name);
    const slash = node.isDir ? pc.gray("/") : "";
    out.push(`${pc.gray(prefix)}${icon} ${name}${slash}`);
    if (node.children && node.children.length > 0) {
      out.push(renderTree(node.children, depth + 1, maxDepth));
    }
  }
  return out.filter(l => l).join("\n");
}

// ── Spinner rainbow animation (for welcome) ──────────────────────────
export async function animWelcome(text: string, durationMs: number = 1500): Promise<void> {
  if (!process.stdout.isTTY) {
    console.log(text);
    return;
  }
  const start = Date.now();
  let frame = 0;
  while (Date.now() - start < durationMs) {
    const shifted = rainbow(text, frame);
    process.stdout.write(`\r\x1b[2K   ${shifted}`);
    frame++;
    await new Promise(r => setTimeout(r, 60));
  }
  process.stdout.write("\n");
}

// ── Divider with various styles ───────────────────────────────────────
export function divider(style: "thin" | "thick" | "double" | "dotted" | "dashed" | "gradient" = "thin", width: number = 60): string {
  switch (style) {
    case "thick": return pc.gray("\u2501".repeat(width));
    case "double": return pc.gray("\u2550".repeat(width));
    case "dotted": return pc.gray("\u00B7".repeat(width));
    case "dashed": return pc.gray("\u2504".repeat(width));
    case "gradient": {
      const colors = PALETTES.aura;
      let out = "";
      for (let i = 0; i < width; i++) {
        const t = i / (width - 1);
        const idx = t * (colors.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.min(colors.length - 1, lo + 1);
        const f = idx - lo;
        const a = colors[lo];
        const b = colors[hi];
        const r = Math.round(a[0] + (b[0] - a[0]) * f);
        const g = Math.round(a[1] + (b[1] - a[1]) * f);
        const bl = Math.round(a[2] + (b[2] - a[2]) * f);
        out += rgb(r, g, bl) + "\u2501" + RESET;
      }
      return out;
    }
    default: return pc.gray("\u2500".repeat(width));
  }
}

// ── Status indicator (pulse, dot) ────────────────────────────────────
export function statusIndicator(state: "ok" | "warn" | "err" | "busy" | "idle"): string {
  switch (state) {
    case "ok": return "\x1b[38;2;127;216;143m\u25CF\x1b[39m";
    case "warn": return "\x1b[38;2;245;207;102m\u25CF\x1b[39m";
    case "err": return "\x1b[38;2;224;108;117m\u25CF\x1b[39m";
    case "busy": return "\x1b[38;2;86;182;194m\u25CF\x1b[39m";
    default: return pc.gray("\u25CB");
  }
}

// ── Pill (rounded badge) ──────────────────────────────────────────────
export function pill(text: string, color: [number, number, number] = [127, 216, 143], textColor: [number, number, number] = [30, 30, 30]): string {
  return bg(color[0], color[1], color[2]) + rgb(textColor[0], textColor[1], textColor[2]) + ` ${text} ` + RESET;
}

// ── Key-value line with separator ─────────────────────────────────────
export function kvs(items: Array<[string, string]>, sep: string = "\u2502"): string {
  return items.map(([k, v]) => `${pc.dim(k)} ${pc.white(v)}`).join(` ${pc.gray(sep)} `);
}

// ── Code block with title and language ────────────────────────────────
export function codeBlock(code: string, lang: string = "", title: string = ""): string {
  const header = title ? ` ${title} ` : "";
  const langLabel = lang ? pc.gray(` \u00B7 ${lang}`) : "";
  const top = pc.gray("\u256D" + "\u2500".repeat(3) + header) + (langLabel) + pc.gray("\u2500".repeat(Math.max(0, 50 - header.length - langLabel.length)) + "\u256E");
  const lines = code.split("\n");
  const body = lines.map(l => pc.gray("\u2502") + " " + l).join("\n");
  const bottom = pc.gray("\u2570" + "\u2500".repeat(54) + "\u256F");
  return [top, body, bottom].join("\n");
}

// ── Cost sparkline with value ────────────────────────────────────────
export function costSparkline(values: number[], width: number = 16): string {
  if (values.length === 0) return pc.gray("\u2591".repeat(width));
  const max = Math.max(...values, 0.0001);
  const blocks = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];
  const step = values.length / width;
  let out = "";
  for (let i = 0; i < width; i++) {
    const idx = Math.min(values.length - 1, Math.floor(i * step));
    const v = values[idx];
    const blockIdx = Math.min(7, Math.floor((v / max) * 7));
    const c = PALETTES.aura[Math.floor((i / (width - 1)) * (PALETTES.aura.length - 1))];
    out += rgb(c[0], c[1], c[2]) + blocks[blockIdx] + RESET;
  }
  return out;
}

// ── Section header with double border ────────────────────────────────
export function section(title: string, color: (s: string) => string = pc.cyan): string {
  const titleStr = ` ${title} `;
  const left = color("\u2553");
  const right = color("\u2557");
  const line = color("\u2550".repeat(Math.max(40, titleStr.length + 4)));
  return `${left}${line.slice(0, 1)}${titleStr}${line.slice(1)}${right}`;
}

// ── Welcome box with capabilities ────────────────────────────────────
export interface WelcomeItem {
  icon: string;
  title: string;
  desc: string;
}

export function welcome(caps: WelcomeItem[], version: string): string {
  const lines: string[] = [];
  const title = gradText("\u2728 AURA \u2728", "aura");
  const tagline = gradText("autonomous AI coding agent", "sunset");
  lines.push("");
  lines.push(`  ${title}  ${pc.dim("v" + version)}`);
  lines.push(`  ${tagline}`);
  lines.push(`  ${divider("gradient", 60)}`);
  lines.push("");
  for (const c of caps) {
    lines.push(`  ${c.icon}  ${pc.bold(pc.white(c.title))}  ${pc.dim("\u2014")}  ${pc.gray(c.desc)}`);
  }
  lines.push("");
  lines.push(`  ${divider("gradient", 60)}`);
  lines.push(`  ${pc.dim("Type")} ${pc.cyan("your task")} ${pc.dim("to begin, or")} ${pc.cyan("/")} ${pc.dim("for commands, or")} ${pc.cyan("?")} ${pc.dim("for help")}`);
  lines.push("");
  return lines.join("\n");
}

// ── Up time formatter ────────────────────────────────────────────────
export function uptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ── Memory formatter ─────────────────────────────────────────────────
export function bytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

// ── Truncate with ellipsis ───────────────────────────────────────────
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "\u2026";
}
