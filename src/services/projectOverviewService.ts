import type { Task } from "../types/task";

export type OverviewTask = Task & {
  hasChildren?: boolean;
  level?: number;
};

export type ProjectHealthStats = {
  totalTasks: number;
  inProgress: number;
  completed: number;
  overdue: number;
  readyMilestones: number;
  passedMilestones: number;
  globalCritical: number;
  baselineDelayed: number;
  actualOverdue: number;
  dependencyIssues: number;
};

export type ProjectRiskCategory =
  | "overdue"
  | "baselineDelayed"
  | "actualOverdue"
  | "readyMilestone"
  | "dependencyIssue"
  | "globalCritical";

export type ProjectRiskItem = {
  key: string;
  taskId: string;
  taskName: string;
  taskTypeLabel: string;
  plannedEnd: string;
  actualStatus: string;
  reason: string;
  isSummary: boolean;
};

export type ProjectOverview = {
  stats: ProjectHealthStats;
  risks: Record<ProjectRiskCategory, ProjectRiskItem[]>;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDayStamp(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateYMD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function getMilestoneActualDate(task: OverviewTask) {
  if ((task.type ?? "task") !== "milestone" || task.milestoneStatus !== "passed") return undefined;
  if (task.actualEnd) return task.actualEnd;
  if (task.passedAt) return new Date(task.passedAt);
  return task.actualStart;
}

function getTaskActualStart(task: OverviewTask) {
  if ((task.type ?? "task") === "milestone") return getMilestoneActualDate(task);
  return task.actualStart;
}

function getTaskActualEnd(task: OverviewTask) {
  if ((task.type ?? "task") === "milestone") return getMilestoneActualDate(task);
  if (task.hasChildren && task.progress < 100) return undefined;
  return task.actualEnd;
}

export function isMilestoneAwaitingConfirmation(task: Pick<OverviewTask, "type" | "milestoneStatus" | "end">, date = new Date()) {
  if ((task.type ?? "task") !== "milestone") return false;
  if (task.milestoneStatus === "passed") return false;
  return task.milestoneStatus === "ready" || utcDayStamp(date) >= utcDayStamp(task.end);
}

export function isCountableTask(task: OverviewTask) {
  return !task.hasChildren && (task.type ?? "task") === "task";
}

export function isCountableMilestone(task: OverviewTask) {
  return !task.hasChildren && (task.type ?? "task") === "milestone";
}

function isCountableWorkItem(task: OverviewTask) {
  return isCountableTask(task) || isCountableMilestone(task);
}

function hasDependencyIssue(task: OverviewTask) {
  return Boolean(
    task.dependencyBlocked ||
      task.dependencyViolation ||
      task.dependencyActualViolation ||
      task.dependencyMissing
  );
}

function isBaselineDelayed(task: OverviewTask) {
  if (!task.baselineStart || !task.baselineEnd) return false;
  return utcDayStamp(task.start) > utcDayStamp(task.baselineStart) ||
    utcDayStamp(task.end) > utcDayStamp(task.baselineEnd);
}

function isActualOverdue(task: OverviewTask, date = new Date()) {
  const actualStart = getTaskActualStart(task);
  const actualEnd = getTaskActualEnd(task);
  const plannedEndStamp = utcDayStamp(task.end);

  if (actualEnd) return utcDayStamp(actualEnd) > plannedEndStamp;
  if (!actualStart) return false;
  return utcDayStamp(date) > plannedEndStamp;
}

function getTaskTypeLabel(task: OverviewTask) {
  if (task.hasChildren) return "父任务";
  if ((task.type ?? "task") === "milestone") return "节点";
  return "任务";
}

function getActualStatus(task: OverviewTask) {
  const actualStart = getTaskActualStart(task);
  const actualEnd = getTaskActualEnd(task);

  if (actualEnd) {
    return (task.type ?? "task") === "milestone"
      ? `实际通过 ${formatDateYMD(actualEnd)}`
      : `实际完成 ${formatDateYMD(actualEnd)}`;
  }

  if (actualStart) return `进行中，自 ${formatDateYMD(actualStart)}`;
  return "未记录";
}

function getBaselineDelayReason(task: OverviewTask) {
  if (!task.baselineStart || !task.baselineEnd) return "未纳入基线";

  const messages: string[] = [];
  const startDiff = Math.round((utcDayStamp(task.start) - utcDayStamp(task.baselineStart)) / MS_PER_DAY);
  const endDiff = Math.round((utcDayStamp(task.end) - utcDayStamp(task.baselineEnd)) / MS_PER_DAY);

  if (startDiff > 0) messages.push(`开始晚于基线 ${startDiff} 天`);
  if (endDiff > 0) messages.push(`结束晚于基线 ${endDiff} 天`);
  return messages.length > 0 ? messages.join("；") : "当前计划晚于基线";
}

function makeRiskItem(task: OverviewTask, category: ProjectRiskCategory, reason: string): ProjectRiskItem {
  return {
    key: `${category}-${task.id}`,
    taskId: task.id,
    taskName: task.name,
    taskTypeLabel: getTaskTypeLabel(task),
    plannedEnd: formatDateYMD(task.end),
    actualStatus: getActualStatus(task),
    reason,
    isSummary: task.hasChildren === true,
  };
}

function sortRiskItems(items: ProjectRiskItem[]) {
  return [...items].sort((a, b) => {
    if (a.plannedEnd !== b.plannedEnd) return a.plannedEnd.localeCompare(b.plannedEnd);
    return a.taskName.localeCompare(b.taskName, "zh-CN");
  });
}

export function calculateProjectHealthStats(tasks: OverviewTask[], date = new Date()): ProjectHealthStats {
  return tasks.reduce<ProjectHealthStats>(
    (stats, task) => {
      if (isCountableTask(task)) {
        stats.totalTasks += 1;
        if (task.scheduleStatus === "inProgress") stats.inProgress += 1;
        if (task.scheduleStatus === "completed") stats.completed += 1;
        if (task.scheduleStatus === "overdue") stats.overdue += 1;
      }

      if (isCountableMilestone(task)) {
        stats.totalTasks += 1;
        if (isMilestoneAwaitingConfirmation(task, date)) stats.readyMilestones += 1;
        if (task.milestoneStatus === "passed") stats.passedMilestones += 1;
      }

      if (!isCountableWorkItem(task)) return stats;

      if (task.isCritical) stats.globalCritical += 1;
      if (isBaselineDelayed(task)) stats.baselineDelayed += 1;
      if (isActualOverdue(task, date)) stats.actualOverdue += 1;
      if (hasDependencyIssue(task)) stats.dependencyIssues += 1;

      return stats;
    },
    {
      totalTasks: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      readyMilestones: 0,
      passedMilestones: 0,
      globalCritical: 0,
      baselineDelayed: 0,
      actualOverdue: 0,
      dependencyIssues: 0,
    }
  );
}

export function buildProjectOverview(tasks: OverviewTask[], date = new Date()): ProjectOverview {
  const risks: ProjectOverview["risks"] = {
    overdue: [],
    baselineDelayed: [],
    actualOverdue: [],
    readyMilestone: [],
    dependencyIssue: [],
    globalCritical: [],
  };

  tasks.forEach((task) => {
    if ((task.type ?? "task") === "task" && task.scheduleStatus === "overdue") {
      risks.overdue.push(makeRiskItem(task, "overdue", "已超过计划结束"));
    }

    if (isBaselineDelayed(task)) {
      risks.baselineDelayed.push(makeRiskItem(task, "baselineDelayed", getBaselineDelayReason(task)));
    }

    if (isActualOverdue(task, date)) {
      const actualEnd = getTaskActualEnd(task);
      risks.actualOverdue.push(
        makeRiskItem(task, "actualOverdue", actualEnd ? "实际完成晚于计划" : "进行中已超计划结束")
      );
    }

    if (isMilestoneAwaitingConfirmation(task, date)) {
      risks.readyMilestone.push(makeRiskItem(task, "readyMilestone", "节点日期已到，待确认通过"));
    }

    if (hasDependencyIssue(task)) {
      risks.dependencyIssue.push(makeRiskItem(task, "dependencyIssue", "依赖异常"));
    }

    if (task.isCritical) {
      risks.globalCritical.push(makeRiskItem(task, "globalCritical", "处于全局关键路径"));
    }
  });

  return {
    stats: calculateProjectHealthStats(tasks, date),
    risks: {
      overdue: sortRiskItems(risks.overdue),
      baselineDelayed: sortRiskItems(risks.baselineDelayed),
      actualOverdue: sortRiskItems(risks.actualOverdue),
      readyMilestone: sortRiskItems(risks.readyMilestone),
      dependencyIssue: sortRiskItems(risks.dependencyIssue),
      globalCritical: sortRiskItems(risks.globalCritical),
    },
  };
}
