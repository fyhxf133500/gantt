import type { DependencyType, Task, TaskDependency } from "../types/task";

const STORAGE_KEY = "gantt_tasks";
const STORAGE_VERSION_KEY = "gantt_tasks_version";
const CURRENT_STORAGE_VERSION = "3";
const RESET_ONCE_KEY = "gantt_tasks_reset_v3";

type StoredTask = Omit<Task, "start" | "end"> & {
  start: string;
  end: string;
};

type LegacyStoredTask = Omit<StoredTask, "dependencies"> & {
  dependencies?: Array<string | TaskDependency>;
};

function isStorageAvailable() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function ensureStorageVersion() {
  if (!isStorageAvailable()) return false;

  const resetDone = window.localStorage.getItem(RESET_ONCE_KEY);
  if (!resetDone) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.setItem(RESET_ONCE_KEY, "1");
    window.localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
    return false;
  }

  const version = window.localStorage.getItem(STORAGE_VERSION_KEY);
  if (version === CURRENT_STORAGE_VERSION) return true;

  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
  return false;
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
    parentId: task.parentId ?? null,
    dependencies: (task.dependencies ?? []).map((dependency) => ({
      taskId: dependency.taskId,
      type: dependency.type,
      lag: Number.isFinite(dependency.lag) ? dependency.lag : undefined,
    })),
    type: task.type ?? "task",
    isExpanded: task.isExpanded ?? true,
  };
}

function isDependencyType(value: unknown): value is DependencyType {
  return value === "FS" || value === "SS" || value === "FF";
}

function normalizeStoredDependencies(dependencies: LegacyStoredTask["dependencies"]): TaskDependency[] {
  if (!Array.isArray(dependencies)) return [];

  return dependencies.flatMap<TaskDependency>((dependency) => {
    if (typeof dependency === "string") {
      return [{ taskId: dependency, type: "FS" as const }];
    }

    if (
      dependency &&
      typeof dependency === "object" &&
      typeof dependency.taskId === "string" &&
      isDependencyType(dependency.type)
    ) {
      return [
        {
          taskId: dependency.taskId,
          type: dependency.type,
          lag: Number.isFinite(dependency.lag) ? dependency.lag : undefined,
        },
      ];
    }

    return [];
  });
}

function fromStoredTask(task: LegacyStoredTask): Task | null {
  if (!task || typeof task !== "object") return null;
  if (typeof task.id !== "string" || typeof task.name !== "string") return null;
  if (typeof task.start !== "string" || typeof task.end !== "string") return null;
  const parsedStart = parseDate(task.start);
  const parsedEnd = parseDate(task.end);
  if (!parsedStart || !parsedEnd) return null;
  const progress = Number.isFinite(task.progress) ? Number(task.progress) : 0;
  const dependencies = normalizeStoredDependencies(task.dependencies);
  const parentId = typeof task.parentId === "string" ? task.parentId : null;
  const type: Task["type"] = task.type === "milestone" ? "milestone" : "task";
  const isExpanded = typeof task.isExpanded === "boolean" ? task.isExpanded : true;

  return {
    id: task.id,
    name: task.name,
    start: parsedStart,
    end: parsedEnd,
    progress: Math.max(0, Math.min(100, progress)),
    parentId,
    dependencies,
    type,
    isExpanded,
  };
}

export function loadTasks(): Task[] | null {
  if (!isStorageAvailable()) return null;
  if (!ensureStorageVersion()) return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LegacyStoredTask[];
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
  window.localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
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
