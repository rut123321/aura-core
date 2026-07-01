import { toolExecuteShell } from "./tools";
import type { GitChange } from "./types";

async function git(args: string, workingDir: string): Promise<{ stdout: string; stderr: string; exitCode: number; success: boolean }> {
  return await toolExecuteShell(`git ${args}`, workingDir, 15_000);
}

export async function isGitRepo(workingDir: string): Promise<boolean> {
  const r = await git("rev-parse --is-inside-work-tree", workingDir);
  return r.success && r.stdout.trim() === "true";
}

export async function getGitStatus(workingDir: string): Promise<GitChange[]> {
  const r = await git("status --porcelain", workingDir);
  if (!r.success) return [];
  const changes: GitChange[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim();
    const file = line.slice(3).trim().replace(/"/g, "");
    changes.push({ status: status || "?", file });
  }
  return changes;
}

export async function getGitDiff(workingDir: string, staged: boolean = false): Promise<string> {
  const args = staged ? "diff --cached" : "diff";
  const r = await git(args, workingDir);
  if (!r.success) return r.stderr || "No changes or not a git repo.";
  return r.stdout || "No uncommitted changes.";
}

export async function getGitDiffStat(workingDir: string): Promise<string> {
  const r = await git("diff --stat", workingDir);
  if (!r.success) return "No changes or not a git repo.";
  return r.stdout || "No uncommitted changes.";
}

export async function gitCommit(message: string, workingDir: string): Promise<{ success: boolean; message: string }> {
  const addResult = await git("add -A", workingDir);
  if (!addResult.success) {
    return { success: false, message: `git add failed: ${addResult.stderr}` };
  }
  const escapedMsg = message.replace(/"/g, '\\"');
  const commitResult = await git(`commit -m "${escapedMsg}"`, workingDir);
  if (!commitResult.success) {
    if (commitResult.stdout.includes("nothing to commit")) {
      return { success: false, message: "Nothing to commit. Working tree clean." };
    }
    return { success: false, message: `git commit failed: ${commitResult.stderr || commitResult.stdout}` };
  }
  return { success: true, message: commitResult.stdout.trim() };
}

export async function gitUndo(workingDir: string, path?: string): Promise<{ success: boolean; message: string }> {
  if (path) {
    const r = await git(`restore "${path}"`, workingDir);
    if (!r.success) return { success: false, message: `restore failed: ${r.stderr}` };
    return { success: true, message: `Restored: ${path}` };
  }
  const r = await git("restore .", workingDir);
  if (!r.success) return { success: false, message: `restore failed: ${r.stderr}` };
  return { success: true, message: "All uncommitted changes reverted." };
}

export async function gitLog(workingDir: string, count: number = 10): Promise<string> {
  const r = await git(`log --oneline -${count}`, workingDir);
  if (!r.success) return "No commits yet or not a git repo.";
  return r.stdout || "No commits found.";
}

export async function gitBranch(workingDir: string): Promise<{ current: string; branches: string[] }> {
  const r = await git("branch", workingDir);
  if (!r.success) return { current: "", branches: [] };
  const branches: string[] = [];
  let current = "";
  for (const line of r.stdout.split("\n")) {
    if (!line.trim()) continue;
    if (line.startsWith("*")) {
      current = line.slice(1).trim();
      branches.push(current);
    } else {
      branches.push(line.trim());
    }
  }
  return { current, branches };
}

export async function gitCheckout(branch: string, workingDir: string): Promise<{ success: boolean; message: string }> {
  const r = await git(`checkout ${branch}`, workingDir);
  if (!r.success) return { success: false, message: r.stderr || "Checkout failed." };
  return { success: true, message: `Switched to branch: ${branch}` };
}

export async function gitCreateBranch(name: string, workingDir: string): Promise<{ success: boolean; message: string }> {
  const r = await git(`checkout -b ${name}`, workingDir);
  if (!r.success) return { success: false, message: r.stderr || "Branch creation failed." };
  return { success: true, message: `Created and switched to: ${name}` };
}

export async function gitChangesSummary(workingDir: string): Promise<{ total: number; added: number; modified: number; deleted: number; untracked: number; files: GitChange[] }> {
  const changes = await getGitStatus(workingDir);
  let added = 0, modified = 0, deleted = 0, untracked = 0;
  for (const c of changes) {
    if (c.status === "??") untracked++;
    else if (c.status.includes("A")) added++;
    else if (c.status.includes("D")) deleted++;
    else if (c.status.includes("M")) modified++;
  }
  return { total: changes.length, added, modified, deleted, untracked, files: changes };
}
