import pc from "picocolors";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function generateUnifiedDiff(oldContent: string, newContent: string, _filePath: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);
  const diffLines: string[] = [];
  let added = 0, removed = 0;

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : null;
    const newLine = i < newLines.length ? newLines[i] : null;
    if (oldLine === newLine) {
      diffLines.push(` ${pc.gray(oldLine ?? "")}`);
    } else {
      if (oldLine !== null) {
        diffLines.push(`-${COL.red(oldLine)}`);
        removed++;
      }
      if (newLine !== null) {
        diffLines.push(`+${COL.green(newLine)}`);
        added++;
      }
    }
  }

  if (added === 0 && removed === 0) return "";
  return diffLines.join("\n");
}

const COL = {
  red: (s: string) => `\x1b[38;2;224;108;117m${s}\x1b[39m`,
  green: (s: string) => `\x1b[38;2;127;216;143m${s}\x1b[39m`,
  gray: (s: string) => `\x1b[38;2;128;128;128m${s}\x1b[39m`,
  cyan: (s: string) => `\x1b[38;2;86;182;194m${s}\x1b[39m`,
};

export function previewFileWrite(path: string, content: string, workingDir: string): { isWrite: boolean; oldContent: string; diff: string } {
  const safePath = resolve(workingDir, path);
  if (!existsSync(safePath)) {
    return { isWrite: true, oldContent: "", diff: content.split("\n").map((l) => `+${COL.green(l)}`).join("\n") };
  }
  const oldContent = readFileSync(safePath, "utf-8");
  const diff = generateUnifiedDiff(oldContent, content, path);
  return { isWrite: false, oldContent, diff };
}

export function previewFilePatch(path: string, search: string, replace: string, replaceAll: boolean, workingDir: string): { oldContent: string; newContent: string; diff: string } {
  const safePath = resolve(workingDir, path);
  const oldContent = existsSync(safePath) ? readFileSync(safePath, "utf-8") : "";
  let newContent: string;
  if (replaceAll) {
    newContent = oldContent.split(search).join(replace);
  } else {
    newContent = oldContent.replace(search, replace);
  }
  const diff = generateUnifiedDiff(oldContent, newContent, path);
  return { oldContent, newContent, diff };
}

export function printDiffPreview(path: string, diff: string, isWrite: boolean): void {
  console.log();
  if (isWrite) {
    console.log(`  ${COL.cyan("\u2190")} ${COL.cyan("Write")} ${pc.white(path)}`);
  } else {
    console.log(`  ${COL.cyan("\u2190")} ${COL.cyan("Edit")} ${pc.white(path)}`);
  }
  console.log();
  const lines = diff.split("\n");
  const maxLines = Math.min(lines.length, 50);
  for (let i = 0; i < maxLines; i++) {
    console.log(`  ${lines[i]}`);
  }
  if (lines.length > 50) {
    console.log(`  ${COL.gray(`... ${lines.length - 50} more lines`)}`);
  }
  console.log();
}

export async function webSearch(query: string, maxResults: number = 5): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!resp.ok) {
      return `Web search failed: HTTP ${resp.status}`;
    }
    const html = await resp.text();
    const titleRegex = /<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/g;
    const urlRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"/g;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;

    const titles: string[] = [];
    const urls: string[] = [];
    const snippets: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = titleRegex.exec(html)) !== null) {
      titles.push(match[1].replace(/<[^>]*>/g, "").trim());
    }
    while ((match = urlRegex.exec(html)) !== null) {
      let u = match[1];
      if (u.startsWith("//duckduckgo.com/l/?uddg=")) {
        u = decodeURIComponent(u.replace("//duckduckgo.com/l/?uddg=", "").split("&")[0]);
      }
      urls.push(u);
    }
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(match[1].replace(/<[^>]*>/g, "").trim());
    }

    const count = Math.min(maxResults, Math.min(titles.length, urls.length));
    if (count === 0) {
      return `No results found for "${query}".`;
    }

    const lines: string[] = [`Web search results for "${query}":\n`];
    for (let i = 0; i < count; i++) {
      lines.push(`${i + 1}. ${titles[i] || "(no title)"}`);
      lines.push(`   URL: ${urls[i] || "(no url)"}`);
      if (snippets[i]) {
        lines.push(`   ${snippets[i].slice(0, 200)}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  } catch (e) {
    return `Web search failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}
