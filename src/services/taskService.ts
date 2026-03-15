import type { Task } from "../types/task";

const STORAGE_KEY = "gantt_tasks";

type StoredTask = Omit<Task, "start" | "end"> & {
  start: string;
  end: string;
};

function isStorageAvailable() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toStoredTask(task: Task): StoredTask {
  return {
    id: task.id,
    name: task.name,
    progress: task.progress,
    start: formatDate(task.start),
    end: formatDate(task.end),
  };
}

function fromStoredTask(task: StoredTask): Task | null {
  if (!task || typeof task !== "object") return null;
  if (typeof task.id !== "string" || typeof task.name !== "string") return null;
  if (typeof task.start !== "string" || typeof task.end !== "string") return null;
  const parsedStart = parseDate(task.start);
  const parsedEnd = parseDate(task.end);
  if (!parsedStart || !parsedEnd) return null;
  const progress = Number.isFinite(task.progress) ? Number(task.progress) : 0;
  return {
    id: task.id,
    name: task.name,
    start: parsedStart,
    end: parsedEnd,
    progress: Math.max(0, Math.min(100, progress)),
  };
}

export function loadTasks(): Task[] | null {
  if (!isStorageAvailable()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredTask[];
    if (!Array.isArray(parsed)) return null;
    const tasks = parsed
      .map((item) => fromStoredTask(item))
      .filter((item): item is Task => Boolean(item));
    return tasks;
  } catch {
    return null;
  }
}

export function saveTasks(tasks: Task[]) {
  if (!isStorageAvailable()) return;
  const payload = tasks.map((task) => toStoredTask(task));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function addTask(task: Task) {
  const tasks = loadTasks() ?? [];
  const next = [...tasks, task];
  saveTasks(next);
  return next;
}

export function updateTask(task: Task) {
  const tasks = loadTasks() ?? [];
  const next = tasks.map((item) => (item.id === task.id ? task : item));
  saveTasks(next);
  return next;
}

export function deleteTask(id: string) {
  const tasks = loadTasks() ?? [];
  const next = tasks.filter((item) => item.id !== id);
  saveTasks(next);
  return next;
}
