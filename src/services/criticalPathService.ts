import type { Task, TaskDependency } from "../types/task";

export type CriticalPathResult = {
  tasks: Task[];
  projectEnd: Date | null;
  criticalTaskIds: Set<string>;
  criticalDependencyKeys: Set<string>;
  error: string | null;
};

export type LocalCriticalPathResult = {
  selectedSummaryTaskId: string | null;
  projectEnd: Date | null;
  criticalTaskIds: Set<string>;
  criticalDependencyKeys: Set<string>;
  error: string | null;
};

type CpmAnalysis = {
  projectStart: Date | null;
  projectEndOffset: number;
  criticalTaskIds: Set<string>;
  criticalDependencyKeys: Set<string>;
  error: string | null;
};

type CpmNode = {
  task: Task;
  duration: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalSlack: number;
};

type CpmEdge = {
  predecessorId: string;
  successorId: string;
  dependency: TaskDependency;
  lag: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SLACK_TOLERANCE_MS = 60 * 1000;

function buildChildrenMap(tasks: Task[]) {
  const map = new Map<string, string[]>();
  tasks.forEach((task) => {
    if (!task.parentId) return;
    const children = map.get(task.parentId) ?? [];
    children.push(task.id);
    map.set(task.parentId, children);
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
    stack.push(...(childrenMap.get(current) ?? []));
  }

  return result;
}

function normalizeDependencies(dependencies: Task["dependencies"]): TaskDependency[] {
  if (!Array.isArray(dependencies)) return [];

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

function getTaskDuration(task: Task) {
  return Math.max(0, task.end.getTime() - task.start.getTime());
}

function getLagMs(dependency: TaskDependency) {
  if (Number.isFinite(dependency.lag)) {
    return (dependency.lag ?? 0) * MS_PER_DAY;
  }

  return 0;
}

function getDependencyKey(successorId: string, dependency: TaskDependency) {
  return `${successorId}-${dependency.taskId}-${dependency.type}`;
}

function emptyResult(tasks: Task[], error: string | null = null): CriticalPathResult {
  return {
    tasks: tasks.map((task) => ({
      ...task,
      isCritical: false,
      dependencies: normalizeDependencies(task.dependencies).map((dependency) => ({
        ...dependency,
        isCritical: false,
      })),
    })),
    projectEnd: null,
    criticalTaskIds: new Set<string>(),
    criticalDependencyKeys: new Set<string>(),
    error,
  };
}

function getForwardRequiredStart(edge: CpmEdge, predecessor: CpmNode, successor: CpmNode) {
  if (edge.dependency.type === "FS") {
    return predecessor.earlyFinish + edge.lag;
  }

  if (edge.dependency.type === "SS") {
    return predecessor.earlyStart + edge.lag;
  }

  return predecessor.earlyFinish + edge.lag - successor.duration;
}

function getBackwardAllowedStart(edge: CpmEdge, predecessor: CpmNode, successor: CpmNode) {
  if (edge.dependency.type === "FS") {
    return successor.lateStart - edge.lag - predecessor.duration;
  }

  if (edge.dependency.type === "SS") {
    return successor.lateStart - edge.lag;
  }

  return successor.lateFinish - edge.lag - predecessor.duration;
}

function isControllingCriticalDependency(edge: CpmEdge, predecessor: CpmNode, successor: CpmNode) {
  if (edge.dependency.type === "FS") {
    return Math.abs(successor.earlyStart - (predecessor.earlyFinish + edge.lag)) <= SLACK_TOLERANCE_MS;
  }

  if (edge.dependency.type === "SS") {
    return Math.abs(successor.earlyStart - (predecessor.earlyStart + edge.lag)) <= SLACK_TOLERANCE_MS;
  }

  return Math.abs(successor.earlyFinish - (predecessor.earlyFinish + edge.lag)) <= SLACK_TOLERANCE_MS;
}

function emptyAnalysis(error: string | null = null): CpmAnalysis {
  return {
    projectStart: null,
    projectEndOffset: 0,
    criticalTaskIds: new Set<string>(),
    criticalDependencyKeys: new Set<string>(),
    error,
  };
}

function runCpmAnalysis(cpmTasks: Task[], cycleError: string): CpmAnalysis {
  const cpmTaskIds = new Set(cpmTasks.map((task) => task.id));

  if (cpmTasks.length === 0) {
    return emptyAnalysis();
  }

  const projectStart = cpmTasks.reduce<Date>(
    (earliest, task) => (task.start < earliest ? task.start : earliest),
    cpmTasks[0].start
  );
  const nodes = new Map<string, CpmNode>();
  const outgoing = new Map<string, CpmEdge[]>();
  const incomingCount = new Map<string, number>();

  cpmTasks.forEach((task) => {
    const duration = getTaskDuration(task);
    const scheduledStartOffset = Math.max(0, task.start.getTime() - projectStart.getTime());
    nodes.set(task.id, {
      task,
      duration,
      earlyStart: scheduledStartOffset,
      earlyFinish: scheduledStartOffset + duration,
      lateStart: 0,
      lateFinish: 0,
      totalSlack: 0,
    });
    outgoing.set(task.id, []);
    incomingCount.set(task.id, 0);
  });

  cpmTasks.forEach((task) => {
    normalizeDependencies(task.dependencies).forEach((dependency) => {
      if (!cpmTaskIds.has(dependency.taskId) || dependency.taskId === task.id) return;
      const edge: CpmEdge = {
        predecessorId: dependency.taskId,
        successorId: task.id,
        dependency,
        lag: getLagMs(dependency),
      };
      outgoing.get(edge.predecessorId)?.push(edge);
      incomingCount.set(edge.successorId, (incomingCount.get(edge.successorId) ?? 0) + 1);
    });
  });

  const queue = cpmTasks
    .map((task) => task.id)
    .filter((taskId) => (incomingCount.get(taskId) ?? 0) === 0);
  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const taskId = queue.shift();
    if (!taskId) continue;
    topologicalOrder.push(taskId);

    (outgoing.get(taskId) ?? []).forEach((edge) => {
      incomingCount.set(edge.successorId, (incomingCount.get(edge.successorId) ?? 0) - 1);
      if ((incomingCount.get(edge.successorId) ?? 0) === 0) {
        queue.push(edge.successorId);
      }
    });
  }

  if (topologicalOrder.length !== cpmTasks.length) {
    return emptyAnalysis(cycleError);
  }

  topologicalOrder.forEach((taskId) => {
    const predecessor = nodes.get(taskId);
    if (!predecessor) return;

    predecessor.earlyFinish = predecessor.earlyStart + predecessor.duration;

    (outgoing.get(taskId) ?? []).forEach((edge) => {
      const successor = nodes.get(edge.successorId);
      if (!successor) return;

      const requiredStart = getForwardRequiredStart(edge, predecessor, successor);
      successor.earlyStart = Math.max(successor.earlyStart, requiredStart);
      successor.earlyFinish = successor.earlyStart + successor.duration;
    });
  });

  const projectEndOffset = Math.max(...Array.from(nodes.values()).map((node) => node.earlyFinish));

  nodes.forEach((node) => {
    node.lateFinish = projectEndOffset;
    node.lateStart = projectEndOffset - node.duration;
  });

  [...topologicalOrder].reverse().forEach((taskId) => {
    const predecessor = nodes.get(taskId);
    if (!predecessor) return;

    (outgoing.get(taskId) ?? []).forEach((edge) => {
      const successor = nodes.get(edge.successorId);
      if (!successor) return;

      const allowedStart = getBackwardAllowedStart(edge, predecessor, successor);
      predecessor.lateStart = Math.min(predecessor.lateStart, allowedStart);
      predecessor.lateFinish = predecessor.lateStart + predecessor.duration;
    });
  });

  const criticalTaskIds = new Set<string>();
  nodes.forEach((node, taskId) => {
    node.totalSlack = node.lateStart - node.earlyStart;
    if (node.totalSlack <= SLACK_TOLERANCE_MS) {
      criticalTaskIds.add(taskId);
    }
  });

  const criticalDependencyKeys = new Set<string>();
  nodes.forEach((predecessor, predecessorId) => {
    (outgoing.get(predecessorId) ?? []).forEach((edge) => {
      const successor = nodes.get(edge.successorId);
      if (!successor) return;
      if (
        criticalTaskIds.has(edge.predecessorId) &&
        criticalTaskIds.has(edge.successorId) &&
        isControllingCriticalDependency(edge, predecessor, successor)
      ) {
        criticalDependencyKeys.add(getDependencyKey(edge.successorId, edge.dependency));
      }
    });
  });

  return {
    projectStart,
    projectEndOffset,
    criticalTaskIds,
    criticalDependencyKeys,
    error: null,
  };
}

export function calculateCriticalPath(tasks: Task[]): CriticalPathResult {
  const childrenMap = buildChildrenMap(tasks);
  const cpmTasks = tasks.filter(
    (task) => !childrenMap.has(task.id) && ((task.type ?? "task") === "task" || task.type === "milestone")
  );

  const analysis = runCpmAnalysis(cpmTasks, "关键路径无法计算：依赖关系中存在循环，请先修复任务依赖。");

  if (analysis.error) {
    return emptyResult(tasks, analysis.error);
  }

  const { projectStart, projectEndOffset, criticalTaskIds, criticalDependencyKeys } = analysis;

  const hasCriticalDescendantMemo = new Map<string, boolean>();
  const hasCriticalDescendant = (taskId: string): boolean => {
    if (hasCriticalDescendantMemo.has(taskId)) return hasCriticalDescendantMemo.get(taskId)!;

    const result = (childrenMap.get(taskId) ?? []).some((childId) => {
      if (criticalTaskIds.has(childId)) return true;
      return hasCriticalDescendant(childId);
    });
    hasCriticalDescendantMemo.set(taskId, result);
    return result;
  };

  return {
    tasks: tasks.map((task) => {
      const isSummary = childrenMap.has(task.id);
      const isCritical = isSummary ? hasCriticalDescendant(task.id) : criticalTaskIds.has(task.id);

      return {
        ...task,
        isCritical,
        dependencies: normalizeDependencies(task.dependencies).map((dependency) => ({
          ...dependency,
          isCritical: criticalDependencyKeys.has(getDependencyKey(task.id, dependency)),
        })),
      };
    }),
    projectEnd: projectStart ? new Date(projectStart.getTime() + projectEndOffset) : null,
    criticalTaskIds,
    criticalDependencyKeys,
    error: null,
  };
}

export function calculateLocalCriticalPath(tasks: Task[], selectedSummaryTaskId: string | null): LocalCriticalPathResult {
  if (!selectedSummaryTaskId) {
    return {
      selectedSummaryTaskId: null,
      projectEnd: null,
      criticalTaskIds: new Set<string>(),
      criticalDependencyKeys: new Set<string>(),
      error: null,
    };
  }

  const childrenMap = buildChildrenMap(tasks);
  if (!childrenMap.has(selectedSummaryTaskId)) {
    return {
      selectedSummaryTaskId: null,
      projectEnd: null,
      criticalTaskIds: new Set<string>(),
      criticalDependencyKeys: new Set<string>(),
      error: null,
    };
  }

  const descendantIds = collectDescendants(childrenMap, selectedSummaryTaskId);
  const cpmTasks = tasks.filter(
    (task) =>
      descendantIds.has(task.id) &&
      !childrenMap.has(task.id) &&
      ((task.type ?? "task") === "task" || task.type === "milestone")
  );
  const analysis = runCpmAnalysis(cpmTasks, "父任务内关键路径无法计算：该父任务内部存在循环依赖，请先修复依赖关系。");

  return {
    selectedSummaryTaskId,
    projectEnd: analysis.projectStart ? new Date(analysis.projectStart.getTime() + analysis.projectEndOffset) : null,
    criticalTaskIds: analysis.criticalTaskIds,
    criticalDependencyKeys: analysis.criticalDependencyKeys,
    error: analysis.error,
  };
}
