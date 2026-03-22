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

      return prev.map((task) => (task.id === id ? normalizeTask({ ...task, ...input }) : task));
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
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

  return { tasks, visibleTasks, addTask, updateTask, deleteTask, toggleTaskExpanded };
}
