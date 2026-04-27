import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "../types/project";
import type { Task, TaskDependency } from "../types/task";
import {
  createProject as createStoredProject,
  createProjectFromTemplate as createStoredProjectFromTemplate,
  deleteProject as deleteStoredProject,
  duplicateProject as duplicateStoredProject,
  getActiveProjectId,
  getProjects,
  saveProjectAsTemplate as saveStoredProjectAsTemplate,
  saveProjects,
  setActiveProjectId as persistActiveProjectId,
  updateProject as updateStoredProject,
} from "../services/projectService";
import { calculateCriticalPath, calculateLocalCriticalPath } from "../services/criticalPathService";

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

export type DependencyConflict = {
  taskId: string;
  taskName: string;
  dependencyTaskId: string;
  dependencyTaskName: string;
  type: TaskDependency["type"];
  field: "start" | "end";
  currentValue: Date;
  requiredValue: Date;
};

const DEFAULT_PARENT_ID: string | null = null;
const DEFAULT_DEPENDENCIES: TaskDependency[] = [];
const DEFAULT_TASK_TYPE: Task["type"] = "task";
const DEFAULT_MILESTONE_STATUS: NonNullable<Task["milestoneStatus"]> = "pending";
const DEFAULT_EXPANDED = true;
const EMPTY_TASKS: Task[] = [];

type ProjectState = {
  projects: Project[];
  activeProjectId: string | null;
};

function createTaskId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeDependencies(dependencies: Task["dependencies"]): TaskDependency[] {
  if (!Array.isArray(dependencies)) return DEFAULT_DEPENDENCIES;

  return dependencies.flatMap((dependency) => {
    if (
      !dependency ||
      typeof dependency !== "object" ||
      typeof dependency.taskId !== "string" ||
      (dependency.type !== "FS" && dependency.type !== "SS" && dependency.type !== "FF")
    ) {
      return [];
    }

    return [
      {
        taskId: dependency.taskId,
        type: dependency.type,
        lag: Number.isFinite(dependency.lag) ? dependency.lag : undefined,
      },
    ];
  });
}

function utcDayStamp(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function getUnpassedMilestoneStatus(task: Task, date = new Date()): NonNullable<Task["milestoneStatus"]> {
  return utcDayStamp(date) >= utcDayStamp(task.end) ? "ready" : "pending";
}

function calculateScheduleStatus(task: Task, date = new Date()): NonNullable<Task["scheduleStatus"]> {
  const currentStamp = utcDayStamp(date);
  const startStamp = utcDayStamp(task.start);
  const endStamp = utcDayStamp(task.end);

  if (task.progress >= 100) return "completed";
  if (currentStamp < startStamp) return "notStarted";
  if (currentStamp > endStamp) return "overdue";
  return "inProgress";
}

export function hasInvalidDependencies(tasks: Task[], taskId: string, dependencies: TaskDependency[]) {
  const dependencyIds = new Set<string>();

  for (const dependency of dependencies) {
    if (dependency.taskId === taskId) return true;
    if (dependencyIds.has(dependency.taskId)) return true;
    dependencyIds.add(dependency.taskId);
  }

  const dependencyMap = new Map<string, string[]>();
  tasks.forEach((task) => {
    dependencyMap.set(
      task.id,
      normalizeDependencies(task.dependencies).map((dependency) => dependency.taskId)
    );
  });
  dependencyMap.set(
    taskId,
    dependencies.map((dependency) => dependency.taskId)
  );

  const stack = [...(dependencyMap.get(taskId) ?? [])];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === taskId) return true;

    visited.add(current);
    const nextDependencies = dependencyMap.get(current) ?? [];
    stack.push(...nextDependencies);
  }

  return false;
}

export function checkDependencyConflicts(tasks: Task[]): DependencyConflict[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const conflicts: DependencyConflict[] = [];

  tasks.forEach((task) => {
    normalizeDependencies(task.dependencies).forEach((dependency) => {
      const predecessor = taskMap.get(dependency.taskId);
      if (!predecessor) return;

      if (dependency.type === "FS" && task.start.getTime() < predecessor.end.getTime()) {
        conflicts.push({
          taskId: task.id,
          taskName: task.name,
          dependencyTaskId: predecessor.id,
          dependencyTaskName: predecessor.name,
          type: dependency.type,
          field: "start",
          currentValue: task.start,
          requiredValue: predecessor.end,
        });
        return;
      }

      if (dependency.type === "SS" && task.start.getTime() < predecessor.start.getTime()) {
        conflicts.push({
          taskId: task.id,
          taskName: task.name,
          dependencyTaskId: predecessor.id,
          dependencyTaskName: predecessor.name,
          type: dependency.type,
          field: "start",
          currentValue: task.start,
          requiredValue: predecessor.start,
        });
        return;
      }

      if (dependency.type === "FF" && task.end.getTime() < predecessor.end.getTime()) {
        conflicts.push({
          taskId: task.id,
          taskName: task.name,
          dependencyTaskId: predecessor.id,
          dependencyTaskName: predecessor.name,
          type: dependency.type,
          field: "end",
          currentValue: task.end,
          requiredValue: predecessor.end,
        });
      }
    });
  });

  return conflicts;
}

function normalizeTask(task: Task): Task {
  const type = task.type ?? DEFAULT_TASK_TYPE;
  const start = new Date(task.start);
  const end = type === "milestone" ? new Date(start) : new Date(task.end);
  const milestoneStatus = type === "milestone" ? task.milestoneStatus ?? DEFAULT_MILESTONE_STATUS : undefined;
  const progress = milestoneStatus === "passed" ? 100 : task.progress;

  return {
    ...task,
    start,
    end,
    parentId: task.parentId ?? DEFAULT_PARENT_ID,
    dependencies: normalizeDependencies(task.dependencies),
    type,
    progress,
    milestoneStatus,
    passedAt: milestoneStatus === "passed" ? task.passedAt : undefined,
    isExpanded: task.isExpanded ?? DEFAULT_EXPANDED,
    isCritical: false,
    isLocalCritical: false,
    scheduleStatus: calculateScheduleStatus({ ...task, start, end, type, progress, milestoneStatus }),
    isMilestoneOverdue: false,
  };
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    tasks: project.tasks.map(normalizeTask),
  };
}

function resolveActiveProjectId(projects: Project[]) {
  const storedActiveProjectId = getActiveProjectId();
  if (storedActiveProjectId && projects.some((project) => project.id === storedActiveProjectId)) {
    return storedActiveProjectId;
  }

  return projects.find((project) => !project.isTemplate)?.id ?? projects[0]?.id ?? null;
}

function initializeProjectState(): ProjectState {
  const projects = getProjects().map(normalizeProject);
  const activeProjectId = resolveActiveProjectId(projects);

  if (activeProjectId) {
    persistActiveProjectId(activeProjectId);
  }

  return { projects, activeProjectId };
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

function shiftTask(task: Task, deltaMs: number): Task {
  return {
    ...task,
    start: new Date(task.start.getTime() + deltaMs),
    end: new Date(task.end.getTime() + deltaMs),
  };
}

function shiftTaskTree(
  taskMap: Map<string, Task>,
  childrenMap: Map<string, string[]>,
  taskId: string,
  deltaMs: number,
  visited = new Set<string>()
) {
  if (visited.has(taskId)) return;
  const task = taskMap.get(taskId);
  if (!task) return;

  visited.add(taskId);
  taskMap.set(taskId, shiftTask(task, deltaMs));

  const children = childrenMap.get(taskId) ?? [];
  children.forEach((childId) => {
    shiftTaskTree(taskMap, childrenMap, childId, deltaMs, visited);
  });
}

function getRequiredDependencyShift(task: Task, taskMap: Map<string, Task>) {
  let requiredDelta = 0;

  normalizeDependencies(task.dependencies).forEach((dependency) => {
    const predecessor = taskMap.get(dependency.taskId);
    if (!predecessor) return;

    if (dependency.type === "FS") {
      requiredDelta = Math.max(requiredDelta, predecessor.end.getTime() - task.start.getTime());
      return;
    }

    if (dependency.type === "SS") {
      requiredDelta = Math.max(requiredDelta, predecessor.start.getTime() - task.start.getTime());
      return;
    }

    requiredDelta = Math.max(requiredDelta, predecessor.end.getTime() - task.end.getTime());
  });

  return Math.max(0, requiredDelta);
}

export function applyAutoScheduling(tasks: Task[]) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const childrenMap = buildChildrenMap(tasks);
  const incomingCount = new Map<string, number>();
  const outgoingMap = new Map<string, string[]>();
  const processed = new Set<string>();
  let changed = false;

  tasks.forEach((task) => {
    incomingCount.set(task.id, 0);
    outgoingMap.set(task.id, []);
  });

  tasks.forEach((task) => {
    normalizeDependencies(task.dependencies).forEach((dependency) => {
      if (!taskMap.has(dependency.taskId) || dependency.taskId === task.id) return;

      incomingCount.set(task.id, (incomingCount.get(task.id) ?? 0) + 1);
      const outgoing = outgoingMap.get(dependency.taskId) ?? [];
      outgoing.push(task.id);
      outgoingMap.set(dependency.taskId, outgoing);
    });
  });

  const queue = tasks
    .map((task) => task.id)
    .filter((taskId) => (incomingCount.get(taskId) ?? 0) === 0);

  while (queue.length > 0) {
    const taskId = queue.shift();
    if (!taskId || processed.has(taskId)) continue;

    processed.add(taskId);
    const currentTask = taskMap.get(taskId);
    if (!currentTask) continue;

    const requiredShift = getRequiredDependencyShift(currentTask, taskMap);
    if (requiredShift > 0) {
      shiftTaskTree(taskMap, childrenMap, taskId, requiredShift);
      changed = true;
    }

    const outgoing = outgoingMap.get(taskId) ?? [];
    outgoing.forEach((nextTaskId) => {
      incomingCount.set(nextTaskId, (incomingCount.get(nextTaskId) ?? 0) - 1);
      if ((incomingCount.get(nextTaskId) ?? 0) === 0) {
        queue.push(nextTaskId);
      }
    });
  }

  if (!changed) return tasks;
  return tasks.map((task) => taskMap.get(task.id) ?? task);
}

export function buildCreatedTasks(prev: Task[], input: TaskInput) {
  const nextTask = normalizeTask({
    ...input,
    id: createTaskId(),
  });

  if (hasInvalidDependencies(prev, nextTask.id, nextTask.dependencies ?? [])) {
    return null;
  }

  return [...prev, nextTask];
}

export function buildUpdatedTasks(prev: Task[], id: string, input: TaskInput) {
  const current = prev.find((task) => task.id === id);
  if (!current) return null;

  const nextParentId = input.parentId ?? current.parentId ?? null;
  if (nextParentId && isDescendant(prev, id, nextParentId)) {
    return null;
  }

  const nextTask = normalizeTask({ ...current, ...input, parentId: nextParentId });
  if (hasInvalidDependencies(prev, id, nextTask.dependencies ?? [])) {
    return null;
  }

  return prev.map((task) => (task.id === id ? nextTask : task));
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

export function flattenTasks(tree: TaskTreeNode[], options?: { respectExpansion?: boolean }): TaskRow[] {
  const result: TaskRow[] = [];
  const respectExpansion = options?.respectExpansion ?? true;

  const walk = (nodes: TaskTreeNode[], level: number) => {
    nodes.forEach((node) => {
      const hasChildren = node.children.length > 0;
      result.push({
        ...node.task,
        level,
        hasChildren,
      });

      const isExpanded = node.task.isExpanded !== false;
      if (hasChildren && (!respectExpansion || isExpanded)) {
        walk(node.children, level + 1);
      }
    });
  };

  walk(tree, 0);
  return result;
}

export function useTasks() {
  const [projectState, setProjectState] = useState<ProjectState>(initializeProjectState);
  const [selectedSummaryTaskId, setSelectedSummaryTaskId] = useState<string | null>(null);
  const { projects, activeProjectId } = projectState;
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null,
    [activeProjectId, projects]
  );
  const tasks = activeProject?.tasks ?? EMPTY_TASKS;

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  const setActiveProjectTasks = useCallback((updater: Task[] | ((prev: Task[]) => Task[])) => {
    setProjectState((prev) => {
      const activeProject = prev.projects.find((project) => project.id === prev.activeProjectId) ?? prev.projects[0];
      if (!activeProject) return prev;

      const nextTasks = typeof updater === "function" ? updater(activeProject.tasks) : updater;
      if (nextTasks === activeProject.tasks) return prev;

      const normalizedTasks = nextTasks.map(normalizeTask);
      const nextProjects = prev.projects.map((project) =>
        project.id === activeProject.id
          ? { ...project, tasks: normalizedTasks, updatedAt: new Date().toISOString() }
          : project
      );

      return { ...prev, projects: nextProjects };
    });
  }, []);

  useEffect(() => {
    const next = calculateParentSummary(tasks);
    if (next !== tasks) {
      setActiveProjectTasks(next);
    }
  }, [setActiveProjectTasks, tasks]);

  useEffect(() => {
    setSelectedSummaryTaskId(null);
  }, [activeProjectId]);

  useEffect(() => {
    if (!selectedSummaryTaskId) return;
    const childrenMap = buildChildrenMap(tasks);
    if (!childrenMap.has(selectedSummaryTaskId)) {
      setSelectedSummaryTaskId(null);
    }
  }, [tasks, selectedSummaryTaskId]);

  const criticalPath = useMemo(() => calculateCriticalPath(tasks), [tasks]);
  const localCriticalPath = useMemo(
    () => calculateLocalCriticalPath(criticalPath.tasks, selectedSummaryTaskId),
    [criticalPath.tasks, selectedSummaryTaskId]
  );
  const tasksWithCriticalPaths = useMemo(() => {
    const childrenMap = buildChildrenMap(criticalPath.tasks);
    const todayStamp = utcDayStamp(new Date());
    const localScopeIds = selectedSummaryTaskId
      ? new Set<string>([selectedSummaryTaskId, ...collectDescendants(childrenMap, selectedSummaryTaskId)])
      : new Set<string>();
    const localDescendantMemo = new Map<string, boolean>();
    const hasLocalCriticalDescendant = (taskId: string): boolean => {
      if (localDescendantMemo.has(taskId)) return localDescendantMemo.get(taskId)!;
      const result = (childrenMap.get(taskId) ?? []).some((childId) => {
        if (localCriticalPath.criticalTaskIds.has(childId)) return true;
        return hasLocalCriticalDescendant(childId);
      });
      localDescendantMemo.set(taskId, result);
      return result;
    };

    return criticalPath.tasks.map((task) => {
      const isSummary = childrenMap.has(task.id);
      const scheduleStatus = calculateScheduleStatus(task);
      const isLocalCritical = isSummary
        ? localScopeIds.has(task.id) && hasLocalCriticalDescendant(task.id)
        : localCriticalPath.criticalTaskIds.has(task.id);
      const isMilestoneOverdue =
        (task.type ?? "task") === "milestone" &&
        task.milestoneStatus !== "passed" &&
        todayStamp > utcDayStamp(task.end);

      return {
        ...task,
        scheduleStatus,
        isLocalCritical,
        isMilestoneOverdue,
        dependencies: normalizeDependencies(task.dependencies).map((dependency) => ({
          ...dependency,
          isLocalCritical: localCriticalPath.criticalDependencyKeys.has(`${task.id}-${dependency.taskId}-${dependency.type}`),
        })),
      };
    });
  }, [criticalPath.tasks, localCriticalPath.criticalDependencyKeys, localCriticalPath.criticalTaskIds, selectedSummaryTaskId]);
  const taskTree = useMemo(() => buildTaskTree(tasksWithCriticalPaths), [tasksWithCriticalPaths]);
  const taskRows = useMemo(() => flattenTasks(taskTree, { respectExpansion: false }), [taskTree]);
  const visibleTasks = useMemo(() => flattenTasks(taskTree), [taskTree]);

  const addTask = useCallback((input: TaskInput) => {
    setActiveProjectTasks((prev) => buildCreatedTasks(prev, input) ?? prev);
  }, [setActiveProjectTasks]);

  const updateTask = useCallback((id: string, input: TaskInput) => {
    setActiveProjectTasks((prev) => buildUpdatedTasks(prev, id, input) ?? prev);
  }, [setActiveProjectTasks]);

  const moveTask = useCallback((id: string, parentId: string | null, options?: MoveTaskOptions) => {
    setActiveProjectTasks((prev) => {
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
  }, [setActiveProjectTasks]);

  const deleteTask = useCallback((id: string, options?: DeleteTaskOptions) => {
    setActiveProjectTasks((prev) => {
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
  }, [setActiveProjectTasks]);

  const toggleTaskExpanded = useCallback((id: string) => {
    setActiveProjectTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        const current = task.isExpanded !== false;
        return { ...task, isExpanded: !current };
      })
    );
  }, [setActiveProjectTasks]);

  const replaceTasks = useCallback((nextTasks: Task[]) => {
    setActiveProjectTasks(nextTasks.map(normalizeTask));
  }, [setActiveProjectTasks]);

  const toggleMilestonePassed = useCallback((id: string) => {
    setActiveProjectTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id || (task.type ?? "task") !== "milestone") return task;

        if (task.milestoneStatus === "passed") {
          return normalizeTask({
            ...task,
            milestoneStatus: getUnpassedMilestoneStatus(task),
            passedAt: undefined,
            progress: 0,
          });
        }

        return normalizeTask({
          ...task,
          milestoneStatus: "passed",
          passedAt: new Date().toISOString(),
          progress: 100,
        });
      })
    );
  }, [setActiveProjectTasks]);

  const createProject = useCallback((name: string) => {
    const project = createStoredProject(name);
    const nextProjects = getProjects().map(normalizeProject);
    setProjectState({ projects: nextProjects, activeProjectId: project.id });
    setSelectedSummaryTaskId(null);
    return project;
  }, []);

  const duplicateProject = useCallback((projectId: string) => {
    const project = duplicateStoredProject(projectId);
    if (!project) return null;

    const nextProjects = getProjects().map(normalizeProject);
    setProjectState({ projects: nextProjects, activeProjectId: project.id });
    setSelectedSummaryTaskId(null);
    return project;
  }, []);

  const saveProjectAsTemplate = useCallback((projectId: string) => {
    const project = saveStoredProjectAsTemplate(projectId);
    if (!project) return null;

    const nextProjects = getProjects().map(normalizeProject);
    setProjectState((prev) => ({ projects: nextProjects, activeProjectId: prev.activeProjectId }));
    return project;
  }, []);

  const createProjectFromTemplate = useCallback((templateId: string) => {
    const project = createStoredProjectFromTemplate(templateId);
    if (!project) return null;

    const nextProjects = getProjects().map(normalizeProject);
    setProjectState({ projects: nextProjects, activeProjectId: project.id });
    setSelectedSummaryTaskId(null);
    return project;
  }, []);

  const selectProject = useCallback((projectId: string) => {
    setProjectState((prev) => {
      if (!prev.projects.some((project) => project.id === projectId)) return prev;
      persistActiveProjectId(projectId);
      return { ...prev, activeProjectId: projectId };
    });
    setSelectedSummaryTaskId(null);
  }, []);

  const renameProject = useCallback((projectId: string, name: string) => {
    const updatedProject = updateStoredProject(projectId, { name });
    if (!updatedProject) return null;

    const nextProjects = getProjects().map(normalizeProject);
    const nextActiveProjectId = resolveActiveProjectId(nextProjects);
    setProjectState({ projects: nextProjects, activeProjectId: nextActiveProjectId });
    return updatedProject;
  }, []);

  const deleteProject = useCallback((projectId: string) => {
    const nextProjects = deleteStoredProject(projectId).map(normalizeProject);
    const nextActiveProjectId = resolveActiveProjectId(nextProjects);
    if (nextActiveProjectId) {
      persistActiveProjectId(nextActiveProjectId);
    }
    setProjectState({ projects: nextProjects, activeProjectId: nextActiveProjectId });
    setSelectedSummaryTaskId(null);
  }, []);

  const selectSummaryTask = useCallback((id: string) => {
    setSelectedSummaryTaskId(id);
  }, []);

  const clearSelectedSummaryTask = useCallback(() => {
    setSelectedSummaryTaskId(null);
  }, []);

  return {
    projects,
    activeProject,
    activeProjectId,
    tasks: tasksWithCriticalPaths,
    taskRows,
    visibleTasks,
    criticalPathProjectEnd: criticalPath.projectEnd,
    criticalPathError: criticalPath.error,
    selectedSummaryTaskId,
    localCriticalTaskIds: localCriticalPath.criticalTaskIds,
    localCriticalPathError: localCriticalPath.error,
    addTask,
    updateTask,
    moveTask,
    deleteTask,
    createProject,
    duplicateProject,
    saveProjectAsTemplate,
    createProjectFromTemplate,
    selectProject,
    renameProject,
    deleteProject,
    toggleTaskExpanded,
    replaceTasks,
    toggleMilestonePassed,
    selectSummaryTask,
    clearSelectedSummaryTask,
  };
}
