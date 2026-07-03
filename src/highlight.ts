import pc from "picocolors";

const C = {
  keyword: "\x1b[38;2;197;134;192m",
  string: "\x1b[38;2;206;145;120m",
  number: "\x1b[38;2;181;206;168m",
  comment: "\x1b[38;2;106;153;85m\x1b[3m",
  func: "\x1b[38;2;229;192;123m",
  type: "\x1b[38;2;86;182;194m",
  builtin: "\x1b[38;2;92;156;245m",
  punct: "\x1b[38;2;152;195;121m",
  tag: "\x1b[38;2;224;108;117m",
  attr: "\x1b[38;2;152;195;121m",
  reset: "\x1b[0m",
};

const LANG_KEYWORDS: Record<string, RegExp> = {
  ts: /\b(const|let|var|function|class|interface|type|enum|export|import|from|as|extends|implements|public|private|protected|readonly|static|async|await|return|if|else|for|while|do|switch|case|break|continue|new|this|super|try|catch|finally|throw|typeof|instanceof|in|of|void|null|undefined|true|false|never|any|unknown|namespace|declare|abstract|get|set)\b/,
  js: /\b(const|let|var|function|class|extends|export|import|from|as|async|await|return|if|else|for|while|do|switch|case|break|continue|new|this|super|try|catch|finally|throw|typeof|instanceof|in|of|void|null|undefined|true|false)\b/,
  py: /\b(def|class|import|from|as|if|elif|else|for|while|try|except|finally|with|return|yield|raise|pass|break|continue|in|not|and|or|is|None|True|False|self|cls|lambda|async|await|global|nonlocal)\b/,
  go: /\b(func|var|const|type|struct|interface|package|import|if|else|for|range|switch|case|default|break|continue|return|defer|go|chan|map|select|fallthrough|nil|true|false)\b/,
  rs: /\b(fn|let|mut|pub|use|mod|crate|struct|enum|impl|trait|self|Self|if|else|match|for|while|loop|return|break|continue|in|as|where|async|await|dyn|static|const|unsafe|move|ref|true|false)\b/,
  rb: /\b(def|class|module|if|elsif|else|unless|case|when|while|until|for|in|do|end|begin|rescue|ensure|raise|return|yield|break|next|redo|retry|self|nil|true|false|require|include|extend|attr|private|public|protected)\b/,
  sh: /\b(if|then|else|elif|fi|for|in|do|done|while|case|esac|function|return|exit|export|local|alias|set|unset|read|echo|cd|pwd|ls|rm|mv|cp|grep|awk|sed|cat)\b/,
  md: /^/,
  html: /^/,
  css: /^/,
  json: /^/,
  yaml: /^/,
};

const LANG_STRINGS: Record<string, RegExp> = {
  ts: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/,
  js: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/,
  py: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|"""[\s\S]*?"""|'''[\s\S]*?''')/,
  go: /("(?:\\.|[^"\\])*"|`[^`]*`)/,
  rs: /("(?:\\.|[^"\\])*"|b?"(?:\\.|[^"\\])*")/,
  rb: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/,
  sh: /("(?:\\.|[^"\\])*"|'[^']*')/,
  html: /("(?:\\.|[^"\\])*"|'[^']*')/,
  css: /("(?:\\.|[^"\\])*"|'[^']*')/,
  json: /("(?:\\.|[^"\\])*")/,
  yaml: /("(?:\\.|[^"\\])*"|'[^']*')/,
};

const LANG_NUMBERS: Record<string, RegExp> = {
  ts: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:[eE][+-]?\d+)?n?)\b/,
  js: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:[eE][+-]?\d+)?n?)\b/,
  py: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:[eE][+-]?\d+)?j?|True|False|None)\b/,
  go: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/,
  rs: /\b(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+\.?\d*(?:[eE][+-]?\d+)?(?:f32|f64|i8|i16|i32|i64|u8|u16|u32|u64|usize|isize)?)\b/,
  rb: /\b\d+\.?\d*\b/,
  sh: /\b\d+\b/,
  html: /^/,
  css: /#(?:[0-9a-fA-F]{3,8})|\b\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms|deg)?\b/,
  json: /\b\d+\.?\d*\b/,
  yaml: /\b\d+\.?\d*\b/,
  md: /^/,
};

const LANG_COMMENTS: Record<string, RegExp> = {
  ts: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  js: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  py: /#[^\n]*/,
  go: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  rs: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  rb: /#[^\n]*/,
  sh: /#[^\n]*/,
  html: /<!--[\s\S]*?-->/,
  css: /\/\*[\s\S]*?\*\//,
  json: /^/,
  yaml: /#[^\n]*/,
  md: /^/,
};

const COMMENT_LANGS = new Set(["ts", "js", "go", "rs", "rb", "sh", "html", "css", "yaml"]);

const LANG_FUNCS: Record<string, RegExp> = {
  ts: /\b([a-zA-Z_$][\w$]*)(?=\()/,
  js: /\b([a-zA-Z_$][\w$]*)(?=\()/,
  py: /\b([a-zA-Z_][\w]*)(?=\()/,
  go: /\b([a-zA-Z_][\w]*)(?=\()/,
  rs: /\b([a-zA-Z_][\w]*)(?=\()/,
  rb: /\b([a-zA-Z_][\w?!]*)(?=\()/,
  sh: /\b([a-zA-Z_][\w]*)(?=[ \t]*\()/,
  css: /^/,
  html: /^/,
  json: /^/,
  yaml: /^/,
  md: /^/,
};

function getLangFromFence(lang: string): string {
  const l = lang.toLowerCase().split(/\s+/)[0];
  if (l === "typescript" || l === "tsx") return "ts";
  if (l === "javascript" || l === "jsx") return "js";
  if (l === "python" || l === "py") return "py";
  if (l === "golang") return "go";
  if (l === "rust" || l === "rs") return "rs";
  if (l === "ruby") return "rb";
  if (l === "bash" || l === "sh" || l === "zsh" || l === "shell") return "sh";
  return l;
}

function highlightCode(code: string, lang: string): string {
  if (!LANG_KEYWORDS[lang]) lang = "ts";
  const patterns: Array<[RegExp, string]> = [];
  if (COMMENT_LANGS.has(lang)) patterns.push([LANG_COMMENTS[lang], C.comment]);
  patterns.push([LANG_STRINGS[lang], C.string]);
  patterns.push([LANG_NUMBERS[lang], C.number]);
  patterns.push([LANG_KEYWORDS[lang], C.keyword]);
  patterns.push([LANG_FUNCS[lang], C.func]);

  const result: string[] = [];
  let i = 0;
  while (i < code.length) {
    let matched = false;
    for (const [pat, color] of patterns) {
      pat.lastIndex = 0;
      const slice = code.slice(i);
      const m = slice.match(pat);
      if (m && m.index === 0) {
        result.push(color + m[0] + C.reset);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.push(code[i]);
      i++;
    }
  }
  return result.join("");
}

export function highlight(text: string): string {
  const out: string[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(renderMarkdown(text.slice(last, m.index)));
    const lang = getLangFromFence(m[1]);
    const highlighted = highlightCode(m[2], lang);
    const lines = highlighted.split("\n");
    out.push(C.builtin + "\u2502" + C.reset + " " + lines.join("\n" + C.builtin + "\u2502" + C.reset + " "));
    last = m.index + m[0].length;
  }
  out.push(renderMarkdown(text.slice(last)));
  return out.join("");
}

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/)!;
      const level = m[1].length;
      const icons = ["\u2588", "\u2589", "\u258A", "\u258B", "\u258C", "\u258D"];
      const text = m[2];
      const colored = level === 1 ? pc.bold(pc.cyan(text)) : level === 2 ? pc.bold(pc.white(text)) : pc.bold(pc.gray(text));
      out.push(`  ${pc.cyan(icons[level - 1] ?? "\u258D")} ${colored}`);
      i++;
    } else if (/^\s*[-*]\s+/.test(line)) {
      out.push(`  ${pc.cyan("\u25E6")} ${renderInline(line.replace(/^\s*[-*]\s+/, ""))}`);
      i++;
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const m = line.match(/^(\s*)(\d+)\.\s+(.*)$/)!;
      out.push(`  ${pc.cyan(m[2] + ".")} ${renderInline(m[3])}`);
      i++;
    } else if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1])) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(...renderTable(tableLines));
    } else if (line.trim() === "---") {
      out.push(`  ${pc.gray("\u2500".repeat(60))}`);
      i++;
    } else if (line.trim() === "") {
      out.push("");
      i++;
    } else {
      out.push(renderInline(line));
      i++;
    }
  }
  return out.join("\n");
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, c: string) => pc.bold(c))
    .replace(/`([^`]+)`/g, (_, c: string) => `\x1b[48;5;238m\x1b[37m ${c} \x1b[39m\x1b[49m`)
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, c: string) => pc.italic(c));
}

function renderTable(tableLines: string[]): string[] {
  const rows = tableLines.map(l => l.split("|").slice(1, -1).map(c => c.trim()));
  if (rows.length < 2) return tableLines;
  const dataRows = [rows[0], ...rows.slice(2)];
  const widths = rows[0].map((_, col) => Math.max(...rows.map(r => (r[col] ?? "").length)));
  const out: string[] = [];
  const sep = `  ${pc.gray("\u2502")} `;
  out.push(sep + dataRows[0].map((c, i) => pc.bold(c.padEnd(widths[i]))).join(sep));
  out.push(`  ${pc.gray("\u2500".repeat(widths.reduce((a, b) => a + b, 0) + 3 * widths.length))}`);
  for (let i = 1; i < dataRows.length; i++) {
    out.push(sep + dataRows[i].map((c, j) => c.padEnd(widths[j])).join(sep));
  }
  return out;
}

export const SHORTCUT_HIGHLIGHT = highlight;

export type Locale = "en" | "ru";

const MESSAGES: Record<Locale, Record<string, string>> = {
  en: {
    "ready": "ready",
    "type_task": "Type your task or / for commands",
    "goodbye": "goodbye",
    "cancelled": "cancelled",
    "plan_mode_enabled": "PLAN MODE enabled",
    "plan_mode_disabled": "PLAN MODE disabled",
    "plan_ready": "PLAN READY",
    "plan_approved": "Plan approved. Executing...",
    "plan_discarded": "Plan discarded.",
    "agent_switched": "Agent switched to",
    "auto_lint_failed": "AUTO-LINT FAILED",
    "memory_updated": "MEMORY.md updated",
    "config_loaded": ".aurarc loaded",
    "auramd_loaded": "AURA.md loaded",
    "init_tip": "Tip: run /init to generate AURA.md + .aurarc",
    "tip_help": "type your task, / for commands, ? for help, \\plan for plan mode",
    "no_plan": "No plan to approve",
    "no_plan_to_review": "No plan yet. Run a task with /plan enabled",
    "branch_created": "branch",
    "pr_created": "PR",
    "auto_confirm": "AUTO",
    "planning": "PLANNING",
  },
  ru: {
    "ready": "готово",
    "type_task": "Введите задачу или / для команд",
    "goodbye": "до свидания",
    "cancelled": "отменено",
    "plan_mode_enabled": "РЕЖИМ ПЛАНА включён",
    "plan_mode_disabled": "РЕЖИМ ПЛАНА выключен",
    "plan_ready": "ПЛАН ГОТОВ",
    "plan_approved": "План одобрен. Выполняю...",
    "plan_discarded": "План отменён.",
    "agent_switched": "Агент переключён на",
    "auto_lint_failed": "АВТО-ЛИНТ НЕ ПРОШЁЛ",
    "memory_updated": "MEMORY.md обновлён",
    "config_loaded": ".aurarc загружен",
    "auramd_loaded": "AURA.md загружен",
    "init_tip": "Подсказка: запустите /init для создания AURA.md + .aurarc",
    "tip_help": "введите задачу, / для команд, ? для справки, \\plan для режима плана",
    "no_plan": "Нет плана для одобрения",
    "no_plan_to_review": "Плана ещё нет. Выполните задачу с включённым /plan",
    "branch_created": "ветка",
    "pr_created": "PR",
    "auto_confirm": "АВТО",
    "planning": "ПЛАНИРОВАНИЕ",
  },
};

let currentLocale: Locale = "en";

export function setLocale(loc: Locale): void { currentLocale = loc; }
export function getLocale(): Locale { return currentLocale; }

export function detectLocale(): Locale {
  const env = process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || "";
  if (env.toLowerCase().startsWith("ru")) return "ru";
  return "en";
}

export function t(key: string, fallback?: string): string {
  return MESSAGES[currentLocale][key] ?? MESSAGES.en[key] ?? fallback ?? key;
}
