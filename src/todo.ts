import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";

export interface TodoItem {
  id: number;
  text: string;
  status: "pending" | "in_progress" | "done";
  createdAt: number;
}

const TODO_FILE = ".aura-todos.json";

function todoPath(workdir: string): string {
  return join(workdir, TODO_FILE);
}

export function loadTodos(workdir: string): TodoItem[] {
  const p = todoPath(workdir);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as TodoItem[];
  } catch {
    return [];
  }
}

export function saveTodos(workdir: string, todos: TodoItem[]): void {
  writeFileSync(todoPath(workdir), JSON.stringify(todos, null, 2), "utf-8");
}

export function addTodo(workdir: string, text: string): TodoItem {
  const todos = loadTodos(workdir);
  const item: TodoItem = {
    id: todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1,
    text,
    status: "pending",
    createdAt: Date.now(),
  };
  todos.push(item);
  saveTodos(workdir, todos);
  return item;
}

export function updateTodoStatus(workdir: string, id: number, status: TodoItem["status"]): boolean {
  const todos = loadTodos(workdir);
  const item = todos.find(t => t.id === id);
  if (!item) return false;
  item.status = status;
  saveTodos(workdir, todos);
  return true;
}

export function removeTodo(workdir: string, id: number): boolean {
  const todos = loadTodos(workdir);
  const idx = todos.findIndex(t => t.id === id);
  if (idx === -1) return false;
  todos.splice(idx, 1);
  saveTodos(workdir, todos);
  return true;
}

export function clearTodos(workdir: string): void {
  saveTodos(workdir, []);
}

export function printTodos(workdir: string): void {
  const todos = loadTodos(workdir);
  console.log();
  if (todos.length === 0) {
    console.log(`  ${pc.gray("No todos. Use /todo add <text>")}`);
    console.log();
    return;
  }
  console.log(`  ${pc.bold("Todos")}`);
  console.log();
  for (const t of todos) {
    let icon: string;
    let color: (s: string) => string;
    if (t.status === "done") { icon = "\u2713"; color = pc.green; }
    else if (t.status === "in_progress") { icon = "\u25CB"; color = pc.yellow; }
    else { icon = "\u25CB"; color = pc.gray; }
    const text = t.status === "done" ? pc.gray(t.text) : t.text;
    console.log(`  ${color(icon)} ${pc.gray(`#${t.id}`)} ${text}`);
  }
  const pending = todos.filter(t => t.status === "pending").length;
  const inProgress = todos.filter(t => t.status === "in_progress").length;
  const done = todos.filter(t => t.status === "done").length;
  console.log();
  console.log(`  ${pc.gray(`${done}/${todos.length} done` + (inProgress > 0 ? ` \xB7 ${inProgress} in progress` : "") + (pending > 0 ? ` \xB7 ${pending} pending` : ""))}`);
  console.log();
}

export function getTodosSummary(workdir: string): string {
  const todos = loadTodos(workdir);
  if (todos.length === 0) return "";
  const done = todos.filter(t => t.status === "done").length;
  const pending = todos.filter(t => t.status === "pending").length;
  const inProgress = todos.filter(t => t.status === "in_progress").length;
  const lines: string[] = [`TODO Tracker: ${done}/${todos.length} done, ${inProgress} in progress, ${pending} pending`];
  for (const t of todos) {
    const icon = t.status === "done" ? "[x]" : t.status === "in_progress" ? "[~]" : "[ ]";
    lines.push(`  ${icon} #${t.id} ${t.text}`);
  }
  return lines.join("\n");
}
