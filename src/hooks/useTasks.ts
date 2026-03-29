import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task } from "../types/task";
import { mockTasks } from "../data/mockTasks";
import { loadTasks, saveTasks } from "../services/taskService";

export type TaskInput = Omit<Task, "id" | "isExpanded">;

export type TaskTreeNode = {
  task: Task;
  children: TaskTreeNode[];
};

export type TaskRow = Task & {
  level: number;
  hasChildren: boolean;
};

export type MoveTaskOptions = {
  referenceId?: string | null;
  placement?: "before" | "after";
};

export type DeleteTaskOptions = {
  mode?: "delete" | "promote";
};

const DEFAULT_PARENT_ID: string | null = null;
const DEFAULT_DEPENDENCIES: string[] = [];
const DEFAULT_TASK_TYPE: Task["type"] = "task";
const DEFAULT_EXPANDED = true;

function createTaskId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    parentId: task.parentId ?? DEFAULT_PARENT_ID,
    dependencies: task.dependencies ?? DEFAULT_DEPENDENCIES,
    type: task.type ?? DEFAULT_TASK_TYPE,
    isExpanded: task.isExpanded ?? DEFAULT_EXPANDED,
  };
}

function buildChildrenMap(tasks: Task[]) {
  const map = new Map<string, string[]>();
  tasks.forEach((task) => {
    if (!task.parentId) return;
    const list = map.get(task.parentId) ?? [];
    list.push(task.id);
    map.set(task.parentId, list);
  });
  return map;
}

function collectDescendants(childrenMap: Map<string, string[]>, rootId: string) {
  const result = new Set<string>();
  const stack = [...(childrenMap.get(rootId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || result.has(current)) continue;
    result.add(current);
    const children = childrenMap.get(current) ?? [];
    stack.push(...children);
  }

  return result;
}

function isDescendant(tasks: Task[], taskId: string, potentialParentId: string) {
  if (taskId === potentialParentId) return true;
  const childrenMap = buildChildrenMap(tasks);
  const descendants = collectDescendants(childrenMap, taskId);
  return descendants.has(potentialParentId);
}

export function calculateParentSummary(tasks: Task[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenMap = buildChildrenMap(tasks);
  const memo = new Map<string, { start: Date; end: Date; progress: number }>();
  const visiting = new Set<string>();

  const durationWeight = (start: Date, end: Date) => {
    const diff = end.getTime() - start.getTime();
    return diff > 0 ? diff : 1;
  };

  const computeSummary = (taskId: string): { start: Date; end: Date; progress: number } => {
    if (memo.has(taskId)) return memo.get(taskId)!;
    const task = byId.get(taskId);
    if (!task) {
      return { start: new Date(), end: new Date(), progress: 0 };
    }

    if (visiting.has(taskId)) {
      return { start: task.start, end: task.end, progress: task.progress };
    }

    const children = childrenMap.get(taskId);
    if (!children || children.length === 0) {
      const leaf = { start: task.start, end: task.end, progress: task.progress };
      memo.set(taskId, leaf);
      return leaf;
    }

    visiting.add(taskId);
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;
    let totalWeight = 0;
    let weightedSum = 0;

    children.forEach((childId) => {
      const child = byId.get(childId);
      if (!child) return;
      const childSummary = computeSummary(childId);
      if (!minStart || childSummary.start < minStart) minStart = childSummary.start;
      if (!maxEnd || childSummary.end > maxEnd) maxEnd = childSummary.end;

      const weight = durationWeight(childSummary.start, childSummary.end);
      totalWeight += weight;
      weightedSum += childSummary.progress * weight;
    });

    const start = minStart ?? task.start;
    const end = maxEnd ?? task.end;
    const progress = totalWeight > 0 ? weightedSum / totalWeight : task.progress;

    const summary = { start, end, progress };
    memo.set(taskId, summary);
    visiting.delete(taskId);
    return summary;
  };

  let changed = false;
  const next = tasks.map((task) => {
    const children = childrenMap.get(task.id);
    if (!children || children.length === 0) return task;

    const summary = computeSummary(task.id);
    const startChanged = task.start.getTime() !== summary.start.getTime();
    const endChanged = task.end.getTime() !== summary.end.getTime();
    const progressChanged = Math.abs(task.progress - summary.progress) > 0.0001;

    if (!startChanged && !endChanged && !progressChanged) return task;
    changed = true;
    return { ...task, start: summary.start, end: summary.end, progress: summary.progress };
  });

  return changed ? next : tasks;
}

export function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
  const nodes = new Map<string, TaskTreeNode>();
  const roots: TaskTreeNode[] = [];

  tasks.forEach((task) => {
    nodes.set(task.id, { task, children: [] });
  });

  tasks.forEach((task) => {
    const node = nodes.get(task.id);
    if (!node) return;

    const parentId = task.parentId ?? null;
    const parentNode = parentId ? nodes.get(parentId) : null;

    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export function flattenTasks(tree: TaskTreeNode[]): TaskRow[] {
  const result: TaskRow[] = [];

  const walk = (nodes: TaskTreeNode[], level: number) => {
    nodes.forEach((node) => {
      const hasChildren = node.children.length > 0;
      result.push({
        ...node.task,
        level,
        hasChildren,
      });

      const isExpanded = node.task.isExpanded !== false;
      if (hasChildren && isExpanded) {
        walk(node.children, level + 1);
      }
    });
  };

  walk(tree, 0);
  return result;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const storedTasks = loadTasks();
    const baseTasks = storedTasks ?? mockTasks;
    return baseTasks.map(normalizeTask);
  });

  useEffect(() => {
    const next = calculateParentSummary(tasks);
    if (next !== tasks) {
      setTasks(next);
      return;
    }
    saveTasks(tasks);
  }, [tasks]);

  const taskTree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const visibleTasks = useMemo(() => flattenTasks(taskTree), [taskTree]);

  const addTask = useCallback((input: TaskInput) => {
    setTasks((prev) => [
      ...prev,
      normalizeTask({
        ...input,
        id: createTaskId(),
      }),
    ]);
  }, []);

  const updateTask = useCallback((id: string, input: TaskInput) => {
    setTasks((prev) => {
      const current = prev.find((task) => task.id === id);
      if (!current) return prev;

      const nextParentId = input.parentId ?? current.parentId ?? null;
      if (nextParentId && isDescendant(prev, id, nextParentId)) {
        return prev;
      }

      return prev.map((task) => (task.id === id ? normalizeTask({ ...task, ...input, parentId: nextParentId }) : task));
    });
  }, []);

  const moveTask = useCallback((id: string, parentId: string | null, options?: MoveTaskOptions) => {
    setTasks((prev) => {
      const current = prev.find((task) => task.id === id);
      if (!current) return prev;

      const referenceId = options?.referenceId ?? null;
      if (referenceId && referenceId === id) return prev;

      const referenceTask = referenceId ? prev.find((task) => task.id === referenceId) : null;
      const nextParentId = parentId ?? referenceTask?.parentId ?? null;

      if (nextParentId && isDescendant(prev, id, nextParentId)) {
        return prev;
      }

      if (referenceTask && isDescendant(prev, id, referenceTask.id)) {
        return prev;
      }

      const updatedTask = normalizeTask({ ...current, parentId: nextParentId });
      const remaining = prev.filter((task) => task.id !== id);

      let insertIndex = remaining.length;
      if (referenceTask && options?.placement) {
        const refIndex = remaining.findIndex((task) => task.id === referenceTask.id);
        if (refIndex !== -1) {
          insertIndex = options.placement === "before" ? refIndex : refIndex + 1;
        }
      }

      remaining.splice(insertIndex, 0, updatedTask);
      return remaining;
    });
  }, []);

  const deleteTask = useCallback((id: string, options?: DeleteTaskOptions) => {
    setTasks((prev) => {
      const current = prev.find((task) => task.id === id);
      if (!current) return prev;

      const childrenMap = buildChildrenMap(prev);
      const hasChildren = (childrenMap.get(id) ?? []).length > 0;
      const mode = options?.mode ?? (hasChildren ? "delete" : "delete");

      if (mode === "promote") {
        return prev
          .filter((task) => task.id !== id)
          .map((task) => (task.parentId === id ? normalizeTask({ ...task, parentId: null }) : task));
      }

      const descendants = collectDescendants(childrenMap, id);
      const removeIds = new Set<string>([id, ...descendants]);
      return prev.filter((task) => !removeIds.has(task.id));
    });
  }, []);

  const toggleTaskExpanded = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        const current = task.isExpanded !== false;
        return { ...task, isExpanded: !current };
      })
    );
  }, []);

  return { tasks, visibleTasks, addTask, updateTask, moveTask, deleteTask, toggleTaskExpanded };
}