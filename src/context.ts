import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import type { ContextFile } from "./types";

const contextFiles: Map<string, ContextFile> = new Map();

function resolveSafePath(inputPath: string, workingDir: string): string {
  const normalizedWorking = resolve(workingDir);
  const resolved = resolve(workingDir, inputPath);
  if (!resolved.startsWith(normalizedWorking)) {
    throw new Error(`Path "${inputPath}" is outside the working directory.`);
  }
  return resolved;
}

export function addContextFile(relPath: string, workingDir: string): { success: boolean; message: string; file?: ContextFile } {
  const safePath = resolveSafePath(relPath, workingDir);
  if (!existsSync(safePath)) {
    return { success: false, message: `File not found: ${relPath}` };
  }
  try {
    const content = readFileSync(safePath, "utf-8");
    if (content.includes("\0")) {
      return { success: false, message: `Binary file: ${relPath}` };
    }
    const ctxFile: ContextFile = { path: relPath, content, addedAt: Date.now() };
    contextFiles.set(relPath, ctxFile);
    return { success: true, message: `Added to context: ${relPath} (${content.length} chars)`, file: ctxFile };
  } catch (e) {
    return { success: false, message: `Failed to read: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function dropContextFile(relPath: string): { success: boolean; message: string } {
  if (contextFiles.has(relPath)) {
    contextFiles.delete(relPath);
    return { success: true, message: `Removed from context: ${relPath}` };
  }
  return { success: false, message: `Not in context: ${relPath}` };
}

export function getContextFiles(): ContextFile[] {
  return Array.from(contextFiles.values());
}

export function clearContextFiles(): void {
  contextFiles.clear();
}

export function buildContextBlock(): string {
  const files = getContextFiles();
  if (files.length === 0) return "";
  const blocks: string[] = ["\n\n## PERSISTENT CONTEXT FILES\nThe following files are kept in context and should be considered for all tasks:"];
  for (const f of files) {
    blocks.push(`\n### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
  }
  return blocks.join("\n");
}

export function parseFileReferences(input: string, workingDir: string): { processedPrompt: string; addedFiles: string[]; errors: string[] } {
  const addedFiles: string[] = [];
  const errors: string[] = [];
  const fileRefRegex = /@([\w./\\-]+\.\w+)/g;
  let processedPrompt = input;
  let match: RegExpExecArray | null;

  const matches: Array<{ full: string; path: string }> = [];
  while ((match = fileRefRegex.exec(input)) !== null) {
    matches.push({ full: match[0], path: match[1] });
  }

  for (const m of matches) {
    const safePath = resolveSafePath(m.path, workingDir);
    if (existsSync(safePath)) {
      try {
        const content = readFileSync(safePath, "utf-8");
        if (content.includes("\0")) {
          errors.push(`@${m.path}: binary file, skipped`);
          continue;
        }
        const truncated = content.length > 50000
          ? content.slice(0, 50000) + "\n... [truncated]"
          : content;
        processedPrompt = processedPrompt.replace(
          m.full,
          `\n[File: ${m.path}]\n\`\`\`\n${truncated}\n\`\`\`\n`,
        );
        addedFiles.push(m.path);
      } catch (e) {
        errors.push(`@${m.path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      errors.push(`@${m.path}: file not found`);
    }
  }

  return { processedPrompt, addedFiles, errors };
}

export function createInitFile(workingDir: string): { success: boolean; message: string; path: string } {
  const initPath = join(workingDir, "AURA.md");

  if (existsSync(initPath)) {
    return { success: false, message: "AURA.md already exists", path: initPath };
  }

  const template = `# AURA.md — Project Context for Aura-Core

## Project Overview
<!-- Describe your project: what it does, tech stack, key architecture decisions -->

## Build & Test Commands
<!-- List the commands to build, test, lint, and run the project -->
- Build: \`bun build\`
- Test: \`bun test\`
- Lint: \`bun run lint\`
- Run: \`bun run dev\`

## Code Style
<!-- Describe coding conventions, naming patterns, file organization -->

## Important Files
<!-- List key files the agent should know about -->

## Notes
<!-- Anything else the AI agent should know about this project -->
`;

  try {
    const parentDir = dirname(initPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
    writeFileSync(initPath, template, "utf-8");
    return { success: true, message: "Created AURA.md", path: initPath };
  } catch (e) {
    return { success: false, message: `Failed: ${e instanceof Error ? e.message : String(e)}`, path: initPath };
  }
}

export function loadInitFile(workingDir: string): string | null {
  const initPath = join(workingDir, "AURA.md");
  if (!existsSync(initPath)) return null;
  try {
    return readFileSync(initPath, "utf-8");
  } catch {
    return null;
  }
}

export function loadMemoryFile(workingDir: string): string | null {
  const memPath = join(workingDir, "MEMORY.md");
  if (!existsSync(memPath)) return null;
  try {
    return readFileSync(memPath, "utf-8");
  } catch {
    return null;
  }
}

export function buildFullSystemPrompt(basePrompt: string, workingDir: string): string {
  let prompt = basePrompt;

  const initContent = loadInitFile(workingDir);
  if (initContent) {
    prompt += `\n\n## PROJECT CONTEXT (AURA.md)\n${initContent}`;
  }

  const memContent = loadMemoryFile(workingDir);
  if (memContent) {
    prompt += `\n\n## AGENT MEMORY (MEMORY.md)\n${memContent}`;
  }

  const ctxBlock = buildContextBlock();
  if (ctxBlock) {
    prompt += ctxBlock;
  }

  return prompt;
}
