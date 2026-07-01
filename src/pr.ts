import { toolExecuteShell } from "./tools";
import { isGitRepo, getGitStatus, gitLog } from "./git";

async function gh(args: string, workingDir: string): Promise<{ stdout: string; stderr: string; exitCode: number; success: boolean }> {
  return await toolExecuteShell(`gh ${args}`, workingDir, 30_000);
}

export async function isGhInstalled(workingDir: string): Promise<boolean> {
  const isWindows = process.platform === "win32";
  const shell = isWindows ? "cmd" : "/bin/sh";
  const flag = isWindows ? "/c" : "-c";
  const proc = Bun.spawn({
    cmd: [shell, flag, "gh --version"],
    stdout: "pipe",
    stderr: "pipe",
    cwd: workingDir,
  });
  const exitCode = await proc.exited;
  return exitCode === 0;
}

export async function isGhAuthed(workingDir: string): Promise<boolean> {
  const r = await gh("auth status", workingDir);
  return r.success || r.stdout.includes("Logged in");
}

export async function createPullRequest(
  workingDir: string,
  title: string,
  body: string,
  baseBranch?: string,
): Promise<{ success: boolean; message: string; url?: string }> {
  const isRepo = await isGitRepo(workingDir);
  if (!isRepo) {
    return { success: false, message: "Not a git repository." };
  }

  const ghOk = await isGhInstalled(workingDir);
  if (!ghOk) {
    return { success: false, message: "GitHub CLI (gh) not installed. Install from https://cli.github.com" };
  }

  const authed = await isGhAuthed(workingDir);
  if (!authed) {
    return { success: false, message: "Not authenticated with GitHub. Run: gh auth login" };
  }

  const status = await getGitStatus(workingDir);
  if (status.length === 0) {
    return { success: false, message: "No changes to create a PR from." };
  }

  const pushResult = await gh("push -u origin HEAD", workingDir);
  if (!pushResult.success && !pushResult.stderr.includes("Everything up-to-date")) {
    return { success: false, message: `git push failed: ${pushResult.stderr.slice(0, 200)}` };
  }

  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedBody = body.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const baseArg = baseBranch ? ` --base ${baseBranch}` : "";
  const prResult = await gh(`pr create --title "${escapedTitle}" --body "${escapedBody}"${baseArg}`, workingDir);

  if (prResult.success) {
    const url = prResult.stdout.trim().split("\n").pop() ?? "";
    return { success: true, message: "PR created", url };
  }

  if (prResult.stderr.includes("already exists")) {
    return { success: false, message: "A PR already exists for this branch." };
  }

  return { success: false, message: `gh pr create failed: ${prResult.stderr.slice(0, 300)}` };
}

export async function generatePrBody(workingDir: string): Promise<string> {
  const log = await gitLog(workingDir, 10);
  const status = await getGitStatus(workingDir);

  const lines: string[] = [];
  lines.push("## Summary");
  lines.push("");
  lines.push("<!-- Describe the changes -->");
  lines.push("");
  lines.push("## Changes");
  lines.push("");
  for (const c of status.slice(0, 20)) {
    const icon = c.status === "??" ? "+" : c.status.includes("A") ? "+" : c.status.includes("D") ? "-" : "~";
    lines.push(`- [${icon}] ${c.file}`);
  }
  lines.push("");
  lines.push("## Commits");
  lines.push("");
  for (const line of log.split("\n").slice(0, 5)) {
    if (line.trim()) lines.push(`- ${line}`);
  }
  lines.push("");
  lines.push("## Testing");
  lines.push("");
  lines.push("<!-- How to test these changes -->");

  return lines.join("\n");
}
