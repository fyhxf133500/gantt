import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, WheelEvent, FC } from "react";
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import type { Task, TaskDependency } from "../types/task";
import { GanttToolbar, type GanttDisplayMode } from "./GanttToolbar";
import {
  calculateProjectHealthStats,
  isCountableMilestone,
  isCountableTask,
  isMilestoneAwaitingConfirmation,
  type ProjectHealthStats,
} from "../services/projectOverviewService";

export type GanttChartProps = {
  projectId: string | null;
  tasks: TaskRow[];
  allTasks: TaskRow[];
  focusedTask: FocusedTaskRequest | null;
  criticalPathError?: string | null;
  selectedSummaryTaskId: string | null;
  localCriticalPathError?: string | null;
  hasBaseline: boolean;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onUpdateTask: (id: string, input: TaskUpdateInput) => boolean;
  onCaptureBaseline: () => void;
  onClearBaseline: () => void;
  onExportExcel: () => void;
  onToggleExpand: (id: string) => void;
  onMoveTask: (id: string, parentId: string | null, options?: MoveTaskOptions) => void;
  onToggleMilestonePassed: (id: string, options?: { force?: boolean }) => void;
  onSelectSummaryTask: (id: string) => void;
  onClearSelectedSummaryTask: () => void;
  onClearFocusedTask: () => void;
};

type TaskUpdateInput = Pick<Task, "name" | "start" | "end" | "progress">;

type TaskRow = Task & {
  level: number;
  hasChildren: boolean;
};

type FocusedTaskRequest = {
  taskId: string;
  requestId: number;
};

type MoveTaskOptions = {
  referenceId?: string | null;
  placement?: "before" | "after";
};

type TaskFilterValue =
  | "all"
  | "task"
  | "milestone"
  | "summary"
  | "completed"
  | "overdue"
  | "readyMilestone"
  | "globalCritical"
  | "localCritical";

type TaskListHeaderProps = {
  headerHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
};

type TaskListTableBaseProps = {
  rowHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
  locale: string;
  tasks: GanttTask[];
  selectedTaskId: string;
  setSelectedTask: (taskId: string) => void;
  onExpanderClick: (task: GanttTask) => void;
};

type TaskListTableContentProps = TaskListTableBaseProps & {
  taskById: Map<string, TaskRow>;
  dependencyTaskById: Map<string, TaskRow>;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onToggleExpand: (id: string) => void;
  onMoveTask: (id: string, parentId: string | null, options?: MoveTaskOptions) => void;
  onToggleMilestonePassed: (id: string, options?: { force?: boolean }) => void;
  selectedSummaryTaskId: string | null;
  onSelectSummaryTask: (id: string) => void;
  onHoverTask: (taskId: string | null) => void;
  focusedTask: FocusedTaskRequest | null;
  onClearFocusedTask: () => void;
};

type TooltipContentProps = {
  task: GanttTask;
  fontSize: string;
  fontFamily: string;
};

type DependencyPath = {
  key: string;
  taskId: string;
  predecessorId: string;
  d: string;
  type: TaskDependency["type"];
  isCritical: boolean;
  isLocalCritical: boolean;
};

type DependencyOverlayLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  summaryBars: SummaryBarOverlay[];
  paths: DependencyPath[];
  baselineBars: BaselineBarOverlay[];
  actualBars: ActualBarOverlay[];
  globalCriticalRects: OverlayRect[];
  localCriticalRects: OverlayRect[];
  milestones: MilestoneOverlay[];
};

type OverlayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MilestoneOverlay = {
  id: string;
  name: string;
  rect: OverlayRect;
  isCritical: boolean;
  isLocalCritical: boolean;
};

type SummaryBarOverlay = {
  id: string;
  name: string;
  rect: OverlayRect;
  progressWidth: number;
};

type BaselineBarOverlay = {
  id: string;
  rect: OverlayRect;
  isMilestone: boolean;
};

type ActualBarOverlay = {
  id: string;
  normalRect?: OverlayRect;
  overdueRect?: OverlayRect;
  milestoneRect?: OverlayRect;
  isMilestone?: boolean;
  isOverdue?: boolean;
  isOpen: boolean;
  tooltip: string;
  delayDays: number;
};

type DependencyIssue = {
  key: string;
  category: "missing" | "plan" | "progress" | "actual";
  categoryLabel: string;
  predecessorName: string;
  dependencyType: TaskDependency["type"];
  description: string;
};

type DependencyPopoverState = {
  taskId: string;
  left: number;
  top: number;
};

type StatusHelpPopoverState = {
  left: number;
  top: number;
};

type ActualTooltipState = {
  taskId: string;
  left: number;
  top: number;
};

type PendingMilestonePass = {
  task: TaskRow;
  issues: DependencyIssue[];
};

const HEADER_HEIGHT = 64;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HEADER_COLUMNS = ["任务名称", "计划开始", "计划结束", "状态", "操作"];
const TASK_LIST_COLUMN_WIDTH = 155;
const TASK_LIST_WIDTH = HEADER_COLUMNS.length * TASK_LIST_COLUMN_WIDTH;
const TIMELINE_RIGHT_SAFE_WIDTH = 24;
const DAY_COLUMN_WIDTH = 50;
const WEEK_COLUMN_WIDTH = 92;
const MONTH_COLUMN_WIDTH = 112;
const DAY_HEADER_WEEKDAY_MIN_WIDTH = 46;
const DAY_HEADER_FULL_Y = 48;
const DAY_HEADER_COMPACT_Y = 52;
const DAY_PRE_STEPS = 2;
const WEEK_PRE_STEPS = 1;
const MONTH_PRE_STEPS = 1;
const DEPENDENCY_INDENT = 18;
const RANGE_EXTENDER_TASK_ID = "__gantt-range-extender__";
const MILESTONE_DIAMOND_SIZE = 16;
const MILESTONE_BAR_HEIGHT = 18;
const MILESTONE_LABEL_OFFSET = 12;
const PLAN_BAR_FILL = 48;
const DUAL_TRACK_PLAN_BAR_FILL = 34;
const ACTUAL_BAR_HEIGHT_RATIO = 0.52;
const ACTUAL_BAR_GAP = 4;
const ACTUAL_BAR_MIN_WIDTH = 8;
const ACTUAL_MILESTONE_SIZE = 12;
const BASELINE_BAR_HEIGHT = 2;
const BASELINE_BAR_MIN_WIDTH = 8;
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};
const TASK_FILTER_OPTIONS: Array<{ value: TaskFilterValue; label: string; requiresLocalSummary?: boolean }> = [
  { value: "all", label: "全部任务" },
  { value: "task", label: "普通任务" },
  { value: "milestone", label: "里程碑" },
  { value: "summary", label: "父任务" },
  { value: "completed", label: "已完成任务" },
  { value: "overdue", label: "已延期任务" },
  { value: "readyMilestone", label: "待确认节点" },
  { value: "globalCritical", label: "全局关键任务" },
  { value: "localCritical", label: "局部关键任务", requiresLocalSummary: true },
];

function formatDateYMD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type TaskDisplayStatus = {
  label: string;
  variant: "none" | "notStarted" | "inProgress" | "completed" | "pending" | "ready" | "overdue" | "passed";
  actionLabel?: string;
};

const SCHEDULE_STATUS_LABELS: Record<NonNullable<Task["scheduleStatus"]>, string> = {
  notStarted: "未开始",
  inProgress: "进行中",
  completed: "已完成",
  overdue: "已延期",
  atRisk: "有风险",
};

function getTaskDisplayStatus(task: Task): TaskDisplayStatus {
  if ((task.type ?? "task") !== "milestone") {
    const status = task.scheduleStatus ?? "notStarted";
    return {
      label: SCHEDULE_STATUS_LABELS[status],
      variant: status === "atRisk" ? "inProgress" : status,
    };
  }

  if (task.milestoneStatus === "passed") {
    return {
      label: "已通过",
      variant: "passed",
      actionLabel: "撤销通过",
    };
  }

  const isReady = task.milestoneStatus === "ready" || utcDayStamp(new Date()) >= utcDayStamp(task.end);
  return {
    label: isReady ? "待确认" : "未开始",
    variant: isReady ? "ready" : "notStarted",
    actionLabel: "确认通过",
  };
}

function getActualDeviationText(task: Task) {
  const messages: string[] = [];

  if (task.actualStart) {
    const startDiff = Math.round((utcDayStamp(task.actualStart) - utcDayStamp(task.start)) / MS_PER_DAY);
    if (startDiff > 0) {
      messages.push(`晚开始 ${startDiff} 天`);
    }
  }

  if (task.actualEnd) {
    const endDiff = Math.round((utcDayStamp(task.actualEnd) - utcDayStamp(task.end)) / MS_PER_DAY);
    if (endDiff > 0) {
      messages.push(`实际延期 ${endDiff} 天`);
    } else if (endDiff < 0) {
      messages.push(`提前 ${Math.abs(endDiff)} 天`);
    }
  }

  return messages.length > 0 ? messages.join("；") : undefined;
}

function getStartDeviationText(task: Task) {
  if (!task.actualStart) return null;
  const startDiff = Math.round((utcDayStamp(task.actualStart) - utcDayStamp(task.start)) / MS_PER_DAY);
  if (startDiff > 0) return `晚开始 ${startDiff} 天`;
  if (startDiff < 0) return `提前开始 ${Math.abs(startDiff)} 天`;
  return "按计划开始";
}

function getEndDeviationText(task: Task, date = new Date()) {
  const isMilestone = (task.type ?? "task") === "milestone";
  if (task.actualEnd) {
    const endDiff = Math.round((utcDayStamp(task.actualEnd) - utcDayStamp(task.end)) / MS_PER_DAY);
    if (endDiff > 0) return isMilestone ? `延期通过 ${endDiff} 天` : `延期完成 ${endDiff} 天`;
    if (endDiff < 0) return isMilestone ? `提前通过 ${Math.abs(endDiff)} 天` : `提前完成 ${Math.abs(endDiff)} 天`;
    return isMilestone ? "按计划通过" : "按计划完成";
  }

  if (task.actualStart && task.progress < 100) {
    const overdueDays = Math.floor((utcDayStamp(date) - utcDayStamp(task.end)) / MS_PER_DAY);
    if (overdueDays > 0) return `进行中，已超计划 ${overdueDays} 天`;
  }

  return null;
}

function getBaselineDeviationText(task: Pick<Task, "start" | "end" | "baselineStart" | "baselineEnd">) {
  if (!task.baselineStart || !task.baselineEnd) return null;

  const messages: string[] = [];
  const startDiff = Math.round((utcDayStamp(task.start) - utcDayStamp(task.baselineStart)) / MS_PER_DAY);
  const endDiff = Math.round((utcDayStamp(task.end) - utcDayStamp(task.baselineEnd)) / MS_PER_DAY);

  if (startDiff > 0) messages.push(`开始推迟 ${startDiff} 天`);
  if (startDiff < 0) messages.push(`开始提前 ${Math.abs(startDiff)} 天`);
  if (endDiff > 0) messages.push(`结束推迟 ${endDiff} 天`);
  if (endDiff < 0) messages.push(`结束提前 ${Math.abs(endDiff)} 天`);

  return messages.length > 0 ? messages.join("；") : "与基线一致";
}

type ActualTaskLike = {
  type?: GanttTask["type"] | Task["type"];
  actualStart?: Date;
  actualEnd?: Date;
  milestoneStatus?: Task["milestoneStatus"];
  passedAt?: string;
  progress: number;
  hasChildren?: boolean;
};

function isSummaryTaskLike(task: ActualTaskLike) {
  return task.type === "project" || task.hasChildren === true;
}

function getMilestoneActualDate(task: ActualTaskLike) {
  if (task.type !== "milestone" || task.milestoneStatus !== "passed") return undefined;
  if (task.actualEnd) return task.actualEnd;
  if (task.passedAt) return new Date(task.passedAt);
  return task.actualStart;
}

function getTaskActualStart(task: ActualTaskLike) {
  if (task.type === "milestone") return getMilestoneActualDate(task);
  return task.actualStart;
}

function getTaskActualEnd(task: ActualTaskLike) {
  if (task.type === "milestone") return getMilestoneActualDate(task);
  if (isSummaryTaskLike(task) && task.progress < 100) return undefined;
  return task.actualEnd;
}

function getActualBarTooltip(task: Task, actualEnd: Date, isOpen: boolean) {
  const delayDays = Math.max(0, Math.round((utcDayStamp(actualEnd) - utcDayStamp(task.end)) / MS_PER_DAY));
  const lines = [
    `实际开始：${formatDateYMD(task.actualStart!)}`,
    `${isOpen ? "进行至今天" : "实际完成"}：${formatDateYMD(actualEnd)}`,
  ];

  if (delayDays > 0) {
    lines.push(`是否延期：是`);
    lines.push(`延期天数：${delayDays} 天`);
  } else {
    lines.push("是否延期：否");
    lines.push("延期天数：0 天");
  }

  const deviation = getActualDeviationText({ ...task, actualEnd });
  lines.push(`偏差：${deviation ?? "与计划一致"}`);
  return lines.join("\n");
}

function buildActualSegmentRect(x1: number, x2: number, y: number, height: number): OverlayRect | undefined {
  const left = Math.min(x1, x2);
  const width = Math.abs(x2 - x1);
  return {
    x: left,
    y,
    width: Math.max(ACTUAL_BAR_MIN_WIDTH, width),
    height,
  };
}

function getActualBarBounds(bar: ActualBarOverlay): OverlayRect | null {
  const rects = [bar.normalRect, bar.overdueRect, bar.milestoneRect].filter((rect): rect is OverlayRect => Boolean(rect));
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function getDependencyIssues(
  task: Task,
  taskById: Map<string, TaskRow>,
  options?: { assumeProgress?: number; assumeActualStart?: Date; assumeActualEnd?: Date }
): DependencyIssue[] {
  const taskProgress = options?.assumeProgress ?? task.progress;
  const taskWithAssumptions = {
    ...task,
    actualStart: options?.assumeActualStart ?? task.actualStart,
    actualEnd: options?.assumeActualEnd ?? task.actualEnd,
    milestoneStatus:
      (task.type ?? "task") === "milestone" && options?.assumeActualEnd
        ? "passed"
        : task.milestoneStatus,
  };
  const taskActualStart = getTaskActualStart(taskWithAssumptions);
  const taskActualEnd = getTaskActualEnd(taskWithAssumptions);
  const issues: DependencyIssue[] = [];
  const getPredecessorName = (predecessor: TaskRow) => {
    const sameNameCount = Array.from(taskById.values()).filter((item) => item.name === predecessor.name).length;
    if (sameNameCount <= 1) return predecessor.name;
    return `${predecessor.name}（${predecessor.id.slice(0, 8)}）`;
  };

  (task.dependencies ?? []).forEach((dependency, index) => {
    const predecessor = taskById.get(dependency.taskId);
    const keyPrefix = `${task.id}-${dependency.taskId}-${dependency.type}-${index}`;
    if (!predecessor) {
      issues.push({
        key: `${keyPrefix}-missing`,
        category: "missing",
        categoryLabel: "依赖缺失",
        predecessorName: `ID ${dependency.taskId}`,
        dependencyType: dependency.type,
        description: "前置任务不存在或已被删除，已跳过该依赖匹配",
      });
      return;
    }

    if (dependency.type === "FS" && predecessor.progress < 100 && taskProgress > 0) {
      issues.push({
        key: `${keyPrefix}-progress`,
        category: "progress",
        categoryLabel: "进度状态依赖异常",
        predecessorName: getPredecessorName(predecessor),
        dependencyType: dependency.type,
        description: `前置任务尚未完成，但当前任务已经${taskProgress >= 100 ? "完成" : "开始"}`,
      });
    }

    if (dependency.type === "SS" && predecessor.progress <= 0 && taskProgress > 0) {
      issues.push({
        key: `${keyPrefix}-progress`,
        category: "progress",
        categoryLabel: "进度状态依赖异常",
        predecessorName: getPredecessorName(predecessor),
        dependencyType: dependency.type,
        description: "前置任务尚未开始，但当前任务已经开始",
      });
    }

    if (dependency.type === "FF" && predecessor.progress < 100 && taskProgress >= 100) {
      issues.push({
        key: `${keyPrefix}-progress`,
        category: "progress",
        categoryLabel: "进度状态依赖异常",
        predecessorName: getPredecessorName(predecessor),
        dependencyType: dependency.type,
        description: "前置任务尚未完成，但当前任务已经完成",
      });
    }

    if (dependency.type === "FS" && task.start.getTime() < predecessor.end.getTime()) {
      issues.push({
        key: `${keyPrefix}-plan`,
        category: "plan",
        categoryLabel: "计划依赖异常",
        predecessorName: getPredecessorName(predecessor),
        dependencyType: dependency.type,
        description: "计划开始时间早于前置任务计划完成时间",
      });
    }

    if (dependency.type === "SS" && task.start.getTime() < predecessor.start.getTime()) {
      issues.push({
        key: `${keyPrefix}-plan`,
        category: "plan",
        categoryLabel: "计划依赖异常",
        predecessorName: getPredecessorName(predecessor),
        dependencyType: dependency.type,
        description: "计划开始时间早于前置任务计划开始时间",
      });
    }

    if (dependency.type === "FF" && task.end.getTime() < predecessor.end.getTime()) {
      issues.push({
        key: `${keyPrefix}-plan`,
        category: "plan",
        categoryLabel: "计划依赖异常",
        predecessorName: getPredecessorName(predecessor),
        dependencyType: dependency.type,
        description: "计划完成时间早于前置任务计划完成时间",
      });
    }

    const predecessorActualStart = getTaskActualStart(predecessor);
    const predecessorActualEnd = getTaskActualEnd(predecessor);

    if (dependency.type === "FS" && taskActualStart) {
      if (!predecessorActualEnd) {
        issues.push({
          key: `${keyPrefix}-actual-missing-end`,
          category: "actual",
          categoryLabel: "实际时间依赖异常",
          predecessorName: getPredecessorName(predecessor),
          dependencyType: dependency.type,
          description: "前置任务尚未记录实际完成时间，当前任务已记录实际开始时间（FS）",
        });
      } else if (taskActualStart.getTime() < predecessorActualEnd.getTime()) {
        issues.push({
          key: `${keyPrefix}-actual`,
          category: "actual",
          categoryLabel: "实际时间依赖异常",
          predecessorName: getPredecessorName(predecessor),
          dependencyType: dependency.type,
          description: "实际开始时间早于前置任务实际完成时间（FS）",
        });
      }
    }

    if (dependency.type === "SS" && taskActualStart) {
      if (!predecessorActualStart) {
        issues.push({
          key: `${keyPrefix}-actual-missing-start`,
          category: "actual",
          categoryLabel: "实际时间依赖异常",
          predecessorName: getPredecessorName(predecessor),
          dependencyType: dependency.type,
          description: "前置任务尚未记录实际开始时间，当前任务已记录实际开始时间（SS）",
        });
      } else if (taskActualStart.getTime() < predecessorActualStart.getTime()) {
        issues.push({
          key: `${keyPrefix}-actual`,
          category: "actual",
          categoryLabel: "实际时间依赖异常",
          predecessorName: getPredecessorName(predecessor),
          dependencyType: dependency.type,
          description: "实际开始时间早于前置任务实际开始时间（SS）",
        });
      }
    }

    if (dependency.type === "FF" && taskActualEnd) {
      if (!predecessorActualEnd) {
        issues.push({
          key: `${keyPrefix}-actual-missing-end`,
          category: "actual",
          categoryLabel: "实际时间依赖异常",
          predecessorName: getPredecessorName(predecessor),
          dependencyType: dependency.type,
          description: "前置任务尚未记录实际完成时间，当前任务已记录实际完成时间（FF）",
        });
      } else if (taskActualEnd.getTime() < predecessorActualEnd.getTime()) {
        issues.push({
          key: `${keyPrefix}-actual`,
          category: "actual",
          categoryLabel: "实际时间依赖异常",
          predecessorName: getPredecessorName(predecessor),
          dependencyType: dependency.type,
          description: "实际完成时间早于前置任务实际完成时间（FF）",
        });
      }
    }
  });

  return issues;
}

function getDurationDays(start: Date, end: Date) {
  const diff = Math.floor((utcDayStamp(end) - utcDayStamp(start)) / MS_PER_DAY);
  return Math.max(0, diff + 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function snapToNearestDayStart(date: Date) {
  const dayStart = startOfLocalDay(date);
  const nextDayStart = addDays(dayStart, 1);
  const previousDayStart = addDays(dayStart, -1);
  const candidates = [previousDayStart, dayStart, nextDayStart];

  return candidates.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(date.getTime() - nearest.getTime());
    const candidateDistance = Math.abs(date.getTime() - candidate.getTime());
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, dayStart);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getActualDisplayEnd(task: Task & { hasChildren?: boolean }, date = new Date()) {
  const actualStart = getTaskActualStart(task);
  if (!actualStart) return null;

  if ((task.type ?? "task") === "milestone") {
    return getTaskActualEnd(task) ?? null;
  }

  const actualEnd = getTaskActualEnd(task);
  if (actualEnd) return actualEnd;
  if (isSummaryTaskLike(task)) {
    if (task.progress < 100) return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return null;
  }
  if (task.progress > 0) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  return null;
}

function getDisplayIntervalStart(date: Date, task: Pick<Task, "type"> & { hasChildren?: boolean }) {
  if ((task.type ?? "task") === "milestone") return date;
  return addDays(date, -1);
}

function getDisplayIntervalEnd(date: Date) {
  return date;
}

function getTimelineX(date: Date, rangeStart: Date, mode: ViewMode, columnWidth: number) {
  if (mode === ViewMode.Month) {
    const wholeMonths =
      (date.getFullYear() - rangeStart.getFullYear()) * 12 + date.getMonth() - rangeStart.getMonth();
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const monthFraction = Math.max(0, date.getDate() - 1) / daysInMonth;
    return (wholeMonths + monthFraction) * columnWidth;
  }

  const unitMs = mode === ViewMode.Week ? MS_PER_DAY * 7 : MS_PER_DAY;
  return ((date.getTime() - rangeStart.getTime()) / unitMs) * columnWidth;
}

function getActualBarOverlayRect(
  task: TaskRow,
  rangeStart: Date,
  viewMode: ViewMode,
  columnWidth: number,
  plannedRect: OverlayRect,
  scrollLeft: number
): ActualBarOverlay | null {
  const actualStart = getTaskActualStart(task);
  if (!actualStart) return null;
  const actualEnd = getActualDisplayEnd(task);
  if (!actualEnd || actualEnd < actualStart) return null;

  const displayActualStart = getDisplayIntervalStart(actualStart, task);
  const displayActualEnd = getDisplayIntervalEnd(actualEnd);
  const displayPlannedEnd = getDisplayIntervalEnd(task.end);
  const startX = getTimelineX(displayActualStart, rangeStart, viewMode, columnWidth) - scrollLeft;
  const endX = getTimelineX(displayActualEnd, rangeStart, viewMode, columnWidth) - scrollLeft;
  const plannedEndX = getTimelineX(displayPlannedEnd, rangeStart, viewMode, columnWidth) - scrollLeft;
  const actualHeight = Math.max(8, Math.min(14, plannedRect.height * ACTUAL_BAR_HEIGHT_RATIO));
  const delayDays = Math.max(0, Math.round((utcDayStamp(actualEnd) - utcDayStamp(task.end)) / MS_PER_DAY));
  const isOpen = !getTaskActualEnd(task);
  const rowTop = plannedRect.y + (plannedRect.height - plannedRect.height / DUAL_TRACK_PLAN_BAR_FILL * 100) / 2;
  const fallbackY = plannedRect.y + plannedRect.height + ACTUAL_BAR_GAP;
  const laneBottomY = rowTop + plannedRect.height / DUAL_TRACK_PLAN_BAR_FILL * 100;
  const y = Math.min(fallbackY, laneBottomY - actualHeight - 4);

  if ((task.type ?? "task") === "milestone") {
    const markerRect = {
      x: startX - ACTUAL_MILESTONE_SIZE / 2,
      y: y + actualHeight / 2 - ACTUAL_MILESTONE_SIZE / 2,
      width: ACTUAL_MILESTONE_SIZE,
      height: ACTUAL_MILESTONE_SIZE,
    };
    return {
      id: task.id,
      isOpen: false,
      isMilestone: true,
      isOverdue: actualEnd > task.end,
      tooltip: getActualBarTooltip({ ...task, actualStart, actualEnd }, actualEnd, false),
      delayDays,
      milestoneRect: markerRect,
    };
  }

  const normalRect = actualStart > task.end
    ? undefined
    : buildActualSegmentRect(startX, Math.min(endX, plannedEndX), y, actualHeight);
  const overdueRect = actualEnd > task.end
    ? buildActualSegmentRect(Math.max(startX, plannedEndX), endX, y, actualHeight)
    : undefined;

  return {
    id: task.id,
    isOpen,
    tooltip: getActualBarTooltip({ ...task, actualStart, actualEnd: getTaskActualEnd(task) }, actualEnd, isOpen),
    delayDays,
    normalRect,
    overdueRect,
  };
}

function getBaselineBarOverlayRect(
  task: TaskRow,
  rangeStart: Date,
  viewMode: ViewMode,
  columnWidth: number,
  plannedRect: OverlayRect,
  scrollLeft: number
): BaselineBarOverlay | null {
  if (!task.baselineStart || !task.baselineEnd) return null;
  if (task.baselineEnd < task.baselineStart) return null;

  const isMilestone = (task.type ?? "task") === "milestone";
  const displayBaselineStart = getDisplayIntervalStart(task.baselineStart, task);
  const displayBaselineEnd = getDisplayIntervalEnd(task.baselineEnd);
  const startX = getTimelineX(displayBaselineStart, rangeStart, viewMode, columnWidth) - scrollLeft;
  const endX = getTimelineX(displayBaselineEnd, rangeStart, viewMode, columnWidth) - scrollLeft;
  const width = isMilestone ? BASELINE_BAR_MIN_WIDTH : Math.max(BASELINE_BAR_MIN_WIDTH, endX - startX);
  const x = isMilestone ? startX - width / 2 : startX;
  const y = Math.max(2, plannedRect.y - 5);

  return {
    id: task.id,
    isMilestone,
    rect: {
      x,
      y,
      width,
      height: BASELINE_BAR_HEIGHT,
    },
  };
}

function buildDependencyPath(
  dependency: TaskDependency,
  predecessorRect: OverlayRect,
  currentRect: OverlayRect
) {
  const predecessorLeft = predecessorRect.x;
  const predecessorRight = predecessorRect.x + predecessorRect.width;
  const currentLeft = currentRect.x;
  const currentRight = currentRect.x + currentRect.width;
  const predecessorCenterY = predecessorRect.y + predecessorRect.height / 2;
  const currentCenterY = currentRect.y + currentRect.height / 2;

  if (dependency.type === "SS") {
    const elbowX = Math.min(predecessorLeft, currentLeft) - DEPENDENCY_INDENT;
    return `M ${predecessorLeft} ${predecessorCenterY} L ${elbowX} ${predecessorCenterY} L ${elbowX} ${currentCenterY} L ${currentLeft} ${currentCenterY}`;
  }

  if (dependency.type === "FF") {
    const elbowX = Math.max(predecessorRight, currentRight) + DEPENDENCY_INDENT;
    return `M ${predecessorRight} ${predecessorCenterY} L ${elbowX} ${predecessorCenterY} L ${elbowX} ${currentCenterY} L ${currentRight} ${currentCenterY}`;
  }

  const elbowX = predecessorRight + Math.max(DEPENDENCY_INDENT, (currentLeft - predecessorRight) / 2);
  return `M ${predecessorRight} ${predecessorCenterY} L ${elbowX} ${predecessorCenterY} L ${elbowX} ${currentCenterY} L ${currentLeft} ${currentCenterY}`;
}

function buildDiamondPoints(centerX: number, centerY: number, size = MILESTONE_DIAMOND_SIZE) {
  const radius = size / 2;
  return [
    `${centerX} ${centerY - radius}`,
    `${centerX + radius} ${centerY}`,
    `${centerX} ${centerY + radius}`,
    `${centerX - radius} ${centerY}`,
  ].join(" ");
}

function buildMilestoneShapePoints(rect: OverlayRect) {
  const centerY = rect.y + rect.height / 2;
  const width = Math.max(MILESTONE_DIAMOND_SIZE, rect.width);

  if (width <= MILESTONE_DIAMOND_SIZE + 2) {
    return buildDiamondPoints(rect.x + width / 2, centerY, MILESTONE_DIAMOND_SIZE);
  }

  const bevel = Math.min(MILESTONE_DIAMOND_SIZE / 2, width / 2);
  return [
    `${rect.x} ${centerY}`,
    `${rect.x + bevel} ${rect.y}`,
    `${rect.x + width - bevel} ${rect.y}`,
    `${rect.x + width} ${centerY}`,
    `${rect.x + width - bevel} ${rect.y + rect.height}`,
    `${rect.x + bevel} ${rect.y + rect.height}`,
  ].join(" ");
}

function getMilestoneOverlayRect(rawRect: OverlayRect): OverlayRect {
  const centerY = rawRect.y + rawRect.height / 2;
  const width = Math.max(MILESTONE_DIAMOND_SIZE, rawRect.width);
  const x = rawRect.width >= MILESTONE_DIAMOND_SIZE ? rawRect.x : rawRect.x + rawRect.width / 2 - width / 2;

  return {
    x,
    y: centerY - MILESTONE_BAR_HEIGHT / 2,
    width,
    height: MILESTONE_BAR_HEIGHT,
  };
}

function getChartSvg(root: HTMLDivElement) {
  const svgElements = Array.from(root.querySelectorAll<SVGSVGElement>("svg"));
  const candidates = svgElements.filter((svg) => !svg.classList.contains("dependency-overlay-svg"));
  if (candidates.length === 0) return null;

  return candidates.reduce<SVGSVGElement | null>((largest, svg) => {
    if (!largest) return svg;
    return svg.getBoundingClientRect().height > largest.getBoundingClientRect().height ? svg : largest;
  }, null);
}

function getChartViewport(chartSvg: SVGSVGElement, root: HTMLDivElement) {
  const svgRect = chartSvg.getBoundingClientRect();
  let element = chartSvg.parentElement;
  let fallback = element;

  while (element && element !== root) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const clipsHorizontally = style.overflowX !== "visible" || style.overflow !== "visible";
    const isVisibleViewport = rect.width < svgRect.width - 1;

    if (clipsHorizontally && isVisibleViewport) {
      return element;
    }

    fallback = element;
    element = element.parentElement;
  }

  return fallback;
}

function TaskListHeader({ headerHeight, rowWidth, fontFamily, fontSize }: TaskListHeaderProps) {
  const [statusHelpPopover, setStatusHelpPopover] = useState<StatusHelpPopoverState | null>(null);
  const cellStyle: CSSProperties = {
    minWidth: rowWidth,
    padding: "0 8px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    height: "100%",
  };
  const separatorStyle: CSSProperties = {
    width: 1,
    height: headerHeight * 0.5,
    marginTop: headerHeight * 0.2,
    background: "#e2e8f0",
  };

  useEffect(() => {
    if (!statusHelpPopover) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".status-help-button") || target.closest(".status-help-popover")) return;
      setStatusHelpPopover(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [statusHelpPopover]);

  return (
    <div style={{ fontFamily, fontSize }}>
      <div
        className="task-list-header-row"
        style={{
          display: "flex",
          alignItems: "center",
          height: headerHeight - 2,
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {HEADER_COLUMNS.map((label, index) => (
          <div key={label} style={{ display: "flex", alignItems: "center" }}>
            <div style={cellStyle}>
              <span>{label}</span>
              {label === "状态" && (
                <button
                  type="button"
                  className={statusHelpPopover ? "status-help-button status-help-button--active" : "status-help-button"}
                  aria-label="查看状态说明"
                  title="查看状态说明"
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    setStatusHelpPopover((current) =>
                      current
                        ? null
                        : {
                            left: rect.left + rect.width / 2,
                            top: rect.bottom + 8,
                          }
                    );
                  }}
                >
                  ?
                </button>
              )}
            </div>
            {index < HEADER_COLUMNS.length - 1 && <div style={separatorStyle} />}
          </div>
        ))}
      </div>
      {statusHelpPopover && (
        <div
          className="status-help-popover"
          style={{ left: statusHelpPopover.left, top: statusHelpPopover.top }}
          role="dialog"
          aria-label="状态说明"
        >
          <div className="status-help-popover-title">状态说明</div>
          <div className="status-help-popover-list">
            <div><strong>未开始</strong>：计划日期未到，且还没有开始。</div>
            <div><strong>进行中</strong>：任务已有进度，或当前日期处于计划区间内。</div>
            <div><strong>已完成</strong>：任务进度达到 100%。</div>
            <div><strong>已延期</strong>：超过计划结束日期但仍未完成。</div>
            <div><strong>待确认</strong>：节点日期已到，需要人工确认通过。</div>
            <div><strong>已通过</strong>：节点已被人工确认。</div>
            <div><strong>红色 !</strong>：当前进度或节点状态与前置依赖存在冲突。</div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectHealthBar({
  stats,
  onFilterChange,
}: {
  stats: ProjectHealthStats;
  onFilterChange: (filter: TaskFilterValue) => void;
}) {
  const items: Array<{
    key: string;
    label: string;
    value: number;
    variant?: "neutral" | "blue" | "green" | "red" | "amber" | "critical";
    filter?: TaskFilterValue;
  }> = [
    { key: "total", label: "总任务", value: stats.totalTasks, variant: "neutral" },
    { key: "inProgress", label: "进行中", value: stats.inProgress, variant: "blue" },
    { key: "completed", label: "已完成", value: stats.completed, variant: "green", filter: "completed" },
    { key: "overdue", label: "已延期", value: stats.overdue, variant: "red", filter: "overdue" },
    { key: "readyMilestones", label: "待确认节点", value: stats.readyMilestones, variant: "amber", filter: "readyMilestone" },
    { key: "passedMilestones", label: "已通过节点", value: stats.passedMilestones, variant: "green" },
    { key: "globalCritical", label: "全局关键", value: stats.globalCritical, variant: "critical", filter: "globalCritical" },
  ];

  return (
    <div className="project-health-bar" aria-label="项目健康概览">
      {items.map((item) => {
        const className = [
          "project-health-pill",
          `project-health-pill--${item.variant ?? "neutral"}`,
          item.filter ? "project-health-pill--clickable" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={item.key}
            type="button"
            className={className}
            onClick={() => {
              if (item.filter) {
                onFilterChange(item.filter);
              }
            }}
            disabled={!item.filter}
            title={item.filter ? `筛选${item.label}` : undefined}
          >
            <span className="project-health-pill-label">{item.label}</span>
            <span className="project-health-pill-value">{item.value}</span>
          </button>
        );
      })}
    </div>
  );
}

function TaskListTableContent({
  rowHeight,
  rowWidth,
  fontFamily,
  fontSize,
  locale,
  tasks,
  selectedTaskId,
  setSelectedTask,
  taskById,
  dependencyTaskById,
  onEditTask,
  onDeleteTask,
  onToggleExpand,
  onMoveTask,
  onToggleMilestonePassed,
  selectedSummaryTaskId,
  onSelectSummaryTask,
  onHoverTask,
  focusedTask,
  onClearFocusedTask,
}: TaskListTableContentProps) {
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, DATE_FORMAT_OPTIONS), [locale]);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "inside" | null>(null);
  const [dependencyPopover, setDependencyPopover] = useState<DependencyPopoverState | null>(null);
  const [pendingMilestonePass, setPendingMilestonePass] = useState<PendingMilestonePass | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const displayTasks = useMemo(
    () => tasks.filter((task) => task.id !== RANGE_EXTENDER_TASK_ID),
    [tasks]
  );

  useEffect(() => {
    if (!focusedTask) return undefined;
    if (!displayTasks.some((task) => task.id === focusedTask.taskId)) return undefined;

    setSelectedTask(focusedTask.taskId);
    const frameId = requestAnimationFrame(() => {
      rowRefs.current.get(focusedTask.taskId)?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [displayTasks, focusedTask, setSelectedTask]);

  useEffect(() => {
    if (!dependencyPopover) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".dependency-warning-button") ||
        target.closest(".dependency-warning-popover")
      ) {
        return;
      }
      setDependencyPopover(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [dependencyPopover]);

  const isInvalidDropTarget = (dragId: string, targetId: string) => {
    if (dragId === targetId) return true;
    let current = taskById.get(targetId);
    while (current?.parentId) {
      if (current.parentId === dragId) return true;
      current = taskById.get(current.parentId);
    }
    return false;
  };

  return (
    <div
      className={draggingTaskId ? "task-list-table task-list-table--dragging" : "task-list-table"}
      style={{ fontFamily, fontSize }}
      onDragOver={(event) => {
        if (!draggingTaskId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (dropTargetId) {
          setDropTargetId(null);
          setDropPosition(null);
        }
      }}
      onDrop={(event) => {
        if (!draggingTaskId) return;
        event.preventDefault();
        const dragId = event.dataTransfer.getData("text/plain") || draggingTaskId;
        if (!dragId) return;
        onMoveTask(dragId, null);
        setDraggingTaskId(null);
        setDropTargetId(null);
        setDropPosition(null);
      }}
    >
      {displayTasks.map((task) => {
        const originalTask = taskById.get(task.id);
        const level = originalTask?.level ?? 0;
        const hasChildren = originalTask?.hasChildren ?? false;
        const isExpanded = originalTask?.isExpanded !== false;
        const expanderSymbol = hasChildren ? (isExpanded ? "▼" : "▶") : "";

        const isSelected = selectedTaskId === task.id;
        const isFocusedFromOverview = focusedTask?.taskId === task.id;
        const isSelectedSummary = hasChildren && selectedSummaryTaskId === task.id;
        const isDropTarget = Boolean(draggingTaskId && dropTargetId === task.id);
        const isDropInside = isDropTarget && dropPosition === "inside";
        const isDropBefore = isDropTarget && dropPosition === "before";
        const isDropAfter = isDropTarget && dropPosition === "after";
        const isDraggingRow = draggingTaskId === task.id;
        const rowClassName = [
          "task-list-row",
          isSelected ? "task-list-row--active" : "",
          isFocusedFromOverview ? "task-list-row--overview-focus" : "",
          isSelectedSummary ? "task-list-row--summary-selected" : "",
          isDropInside ? "task-list-row--drag-target" : "",
          isDropBefore ? "task-list-row--drop-before" : "",
          isDropAfter ? "task-list-row--drop-after" : "",
          isDraggingRow ? "task-list-row--dragging" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const cellStyle: CSSProperties = {
          minWidth: rowWidth,
          maxWidth: rowWidth,
        };
        const displayTask = originalTask ?? task;
        const displayStatus = originalTask
          ? getTaskDisplayStatus(originalTask)
          : ({ label: "—", variant: "none" } satisfies TaskDisplayStatus);
        const actualDeviationText = originalTask ? getActualDeviationText(originalTask) : undefined;
        const dependencyIssues = originalTask ? getDependencyIssues(originalTask, dependencyTaskById) : [];
        const assumedMilestonePassDate = new Date();
        const milestonePassIssues =
          originalTask && displayStatus.actionLabel === "确认通过"
            ? getDependencyIssues(originalTask, dependencyTaskById, {
                assumeProgress: 100,
                assumeActualStart: assumedMilestonePassDate,
                assumeActualEnd: assumedMilestonePassDate,
              })
            : [];
        const isDependencyPopoverOpen = Boolean(originalTask && dependencyPopover?.taskId === originalTask.id);
        const nameIndentStyle: CSSProperties = {
          paddingLeft: `${level * 16}px`,
        };

        return (
          <div
            key={`${task.id}-row`}
            ref={(node) => {
              if (node) {
                rowRefs.current.set(task.id, node);
              } else {
                rowRefs.current.delete(task.id);
              }
            }}
            className={rowClassName}
            style={{ height: rowHeight }}
            onMouseEnter={() => onHoverTask(task.id)}
            onMouseLeave={() => onHoverTask(null)}
            onClick={(event) => {
              event.stopPropagation();
              onClearFocusedTask();
              setSelectedTask(task.id);
              if (hasChildren && originalTask) {
                onSelectSummaryTask(originalTask.id);
              }
            }}
            draggable={Boolean(originalTask) && !originalTask?.hasChildren}
            onDragStart={(event) => {
              if (!originalTask || originalTask.hasChildren) return;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", originalTask.id);
              setDraggingTaskId(originalTask.id);
              setDropTargetId(null);
              setDropPosition(null);
            }}
            onDragEnd={() => {
              setDraggingTaskId(null);
              setDropTargetId(null);
              setDropPosition(null);
            }}
            onDragOver={(event) => {
              if (!draggingTaskId || !originalTask) return;
              const dragId = draggingTaskId;
              if (isInvalidDropTarget(dragId, originalTask.id)) {
                event.dataTransfer.dropEffect = "none";
                setDropTargetId(null);
                setDropPosition(null);
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              const offset = event.clientY - rect.top;
              const ratio = rect.height > 0 ? offset / rect.height : 0.5;
              let nextPosition: "before" | "after" | "inside" = "inside";
              if (ratio < 0.25) {
                nextPosition = "before";
              } else if (ratio > 0.75) {
                nextPosition = "after";
              }
              event.dataTransfer.dropEffect = "move";
              setDropTargetId(originalTask.id);
              setDropPosition(nextPosition);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!originalTask) return;
              const dragId = event.dataTransfer.getData("text/plain") || draggingTaskId;
              if (!dragId) return;
              if (isInvalidDropTarget(dragId, originalTask.id)) {
                setDropTargetId(null);
                setDropPosition(null);
                return;
              }
              if (dropPosition === "before" || dropPosition === "after") {
                const targetParentId = originalTask.parentId ?? null;
                onMoveTask(dragId, targetParentId, {
                  referenceId: originalTask.id,
                  placement: dropPosition,
                });
              } else {
                onMoveTask(dragId, originalTask.id);
              }
              setDraggingTaskId(null);
              setDropTargetId(null);
              setDropPosition(null);
            }}
          >
            <div className="task-list-cell" style={cellStyle} title={displayTask.name}>
              <div className="task-list-name-wrapper" style={nameIndentStyle}>
                <button
                  type="button"
                  className={expanderSymbol ? "task-list-expander" : "task-list-expander task-list-expander--empty"}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (hasChildren && originalTask) {
                      onToggleExpand(originalTask.id);
                    }
                  }}
                  aria-label={expanderSymbol ? "切换子任务" : undefined}
                  disabled={!expanderSymbol}
                >
                  {expanderSymbol}
                </button>
                <span className="task-list-name">{displayTask.name}</span>
              </div>
            </div>
            <div className="task-list-cell" style={cellStyle}>
              {dateFormatter.format(displayTask.start)}
            </div>
            <div className="task-list-cell" style={cellStyle}>
              {dateFormatter.format(displayTask.end)}
            </div>
            <div className="task-list-cell" style={cellStyle}>
              <div className="milestone-status-cell">
                <span
                  className={`milestone-status-badge milestone-status-badge--${displayStatus.variant}`}
                  title={actualDeviationText}
                >
                  {displayStatus.label}
                </span>
                {dependencyIssues.length > 0 && originalTask && (
                  <button
                    type="button"
                    className={isDependencyPopoverOpen
                      ? "dependency-warning-button dependency-warning-button--active"
                      : "dependency-warning-button"}
                    aria-label="查看依赖异常详情"
                    title="查看依赖异常详情"
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setDependencyPopover((current) =>
                        current?.taskId === originalTask.id
                          ? null
                          : {
                              taskId: originalTask.id,
                              left: rect.left + rect.width / 2,
                              top: rect.bottom + 8,
                            }
                      );
                    }}
                  >
                    !
                  </button>
                )}
                {displayStatus.actionLabel && originalTask && (
                  <button
                    type="button"
                    className="task-action-button task-action-button--compact"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (displayStatus.actionLabel === "确认通过" && milestonePassIssues.length > 0) {
                        setPendingMilestonePass({ task: originalTask, issues: milestonePassIssues });
                        return;
                      }
                      onToggleMilestonePassed(originalTask.id);
                    }}
                  >
                    {displayStatus.actionLabel}
                  </button>
                )}
              </div>
            </div>
            <div className="task-list-cell" style={cellStyle}>
              <div className="task-list-actions">
                <button
                  type="button"
                  className="task-action-button"
                  disabled={!originalTask}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (originalTask) {
                      onEditTask(originalTask);
                    }
                  }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="task-action-button task-action-button--danger"
                  disabled={!originalTask}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (originalTask) {
                      onDeleteTask(originalTask);
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {dependencyPopover && (() => {
        const task = dependencyTaskById.get(dependencyPopover.taskId);
        const issues = task ? getDependencyIssues(task, dependencyTaskById) : [];
        if (!task || issues.length === 0) return null;

        return (
          <div
            className="dependency-warning-popover"
            style={{ left: dependencyPopover.left, top: dependencyPopover.top }}
            role="dialog"
            aria-label="依赖异常详情"
          >
            <div className="dependency-warning-popover-title">{task.name}</div>
            {issues.map((issue) => (
              <div key={issue.key} className="dependency-warning-popover-item">
                <div className="dependency-warning-popover-line">
                  {issue.categoryLabel}：与“{issue.predecessorName}”存在 {issue.dependencyType} 依赖
                </div>
                <div className="dependency-warning-popover-desc">{issue.description}</div>
              </div>
            ))}
            <div className="dependency-warning-popover-advice">
              建议先完成前置任务，或调整依赖关系。
            </div>
          </div>
        );
      })()}
      {pendingMilestonePass && (
        <div className="dependency-confirm-overlay" role="presentation">
          <div
            className="dependency-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="依赖未满足确认"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dependency-confirm-title">依赖尚未满足</div>
            <div className="dependency-confirm-body">
              里程碑“{pendingMilestonePass.task.name}”的前置依赖尚未满足，默认不建议确认通过。
            </div>
            <div className="dependency-confirm-issues">
              {pendingMilestonePass.issues.map((issue) => (
                <div key={issue.key} className="dependency-confirm-issue">
                  <strong>{issue.dependencyType}</strong>
                  <span>{issue.categoryLabel}：与“{issue.predecessorName}”存在依赖，{issue.description}。</span>
                </div>
              ))}
            </div>
            <div className="dependency-confirm-advice">
              建议先完成前置任务，或调整依赖关系；如果确认业务上允许，可强制通过。
            </div>
            <div className="dependency-confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPendingMilestonePass(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  onToggleMilestonePassed(pendingMilestonePass.task.id, { force: true });
                  setPendingMilestonePass(null);
                }}
              >
                强制通过
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className="task-list-dropzone"
        style={{ height: Math.max(12, rowHeight / 3) }}
        onDragOver={(event) => {
          if (!draggingTaskId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (dropTargetId) {
            setDropTargetId(null);
            setDropPosition(null);
          }
        }}
        onDrop={(event) => {
          if (!draggingTaskId) return;
          event.preventDefault();
          const dragId = event.dataTransfer.getData("text/plain") || draggingTaskId;
          if (!dragId) return;
          onMoveTask(dragId, null);
          setDraggingTaskId(null);
          setDropTargetId(null);
          setDropPosition(null);
        }}
      />
    </div>
  );
}

function TooltipContent({ task, fontSize, fontFamily }: TooltipContentProps) {
  const taskWithActual = task as GanttTask & Partial<Pick<Task, "baselineStart" | "baselineEnd" | "actualStart" | "actualEnd" | "milestoneStatus" | "passedAt">>;
  const actualStart = getTaskActualStart(taskWithActual);
  const actualEnd = getTaskActualEnd(taskWithActual);
  const hasActualTime = Boolean(actualStart || actualEnd);
  const hasBaselineTime = Boolean(taskWithActual.baselineStart && taskWithActual.baselineEnd);
  const isSummaryTask = task.type === "project";
  const deviationTask = {
    ...taskWithActual,
    actualStart,
    actualEnd,
    type: task.type === "project" ? "task" : task.type,
  } as Task;
  const actualEndLabel = actualEnd
    ? formatDateYMD(actualEnd)
    : isSummaryTask && task.progress >= 100
      ? "未记录"
      : "进行中 / 未完成";
  const actualInfo = hasActualTime
    ? {
        start: actualStart ? formatDateYMD(actualStart) : "未记录",
        end: actualEndLabel,
        startDeviation: getStartDeviationText(deviationTask),
        endDeviation: getEndDeviationText(deviationTask),
      }
    : null;
  const baselineDeviationText = getBaselineDeviationText({
    start: task.start,
    end: task.end,
    baselineStart: taskWithActual.baselineStart,
    baselineEnd: taskWithActual.baselineEnd,
  });
  const rowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize,
    color: "#0f172a",
  };
  const isMilestone = task.type === "milestone";
  const durationDays = isMilestone ? 0 : getDurationDays(task.start, task.end);
  const containerStyle: CSSProperties = {
    fontFamily,
    padding: "12px 14px",
    minWidth: 180,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
  };
  const sectionTitleStyle: CSSProperties = {
    marginTop: 8,
    marginBottom: 4,
    fontSize,
    fontWeight: 700,
    color: "#334155",
  };
  const dividerStyle: CSSProperties = {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid #e2e8f0",
  };
  const hintStyle: CSSProperties = {
    marginTop: 4,
    fontSize: "11px",
    color: "#64748b",
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: 600, marginBottom: 8 }}>
        <span>{task.name}</span>
        <span>{Math.round(task.progress)}%</span>
      </div>
      <div>
        <div style={sectionTitleStyle}>计划</div>
        <div style={rowStyle}>
          <span>开始时间</span>
          <span>{formatDateYMD(task.start)}</span>
        </div>
        <div style={rowStyle}>
          <span>结束时间</span>
          <span>{formatDateYMD(task.end)}</span>
        </div>
        <div style={rowStyle}>
          <span>工期</span>
          <span>{durationDays} 天</span>
        </div>
        <div style={rowStyle}>
          <span>进度</span>
          <span>{Math.round(task.progress)}%</span>
        </div>
      </div>
      <div style={dividerStyle}>
        <div style={{ ...sectionTitleStyle, marginTop: 0 }}>基线</div>
        {hasBaselineTime ? (
          <>
            <div style={rowStyle}>
              <span>基线开始</span>
              <span>{formatDateYMD(taskWithActual.baselineStart!)}</span>
            </div>
            <div style={rowStyle}>
              <span>基线结束</span>
              <span>{formatDateYMD(taskWithActual.baselineEnd!)}</span>
            </div>
            <div style={rowStyle}>
              <span>计划偏差</span>
              <span>{baselineDeviationText}</span>
            </div>
            {isSummaryTask && <div style={hintStyle}>由子任务汇总</div>}
          </>
        ) : (
          <div style={rowStyle}>
            <span>未纳入基线</span>
          </div>
        )}
      </div>
      <div style={dividerStyle}>
        <div style={{ ...sectionTitleStyle, marginTop: 0 }}>实际</div>
        {actualInfo ? (
          <>
            <div style={rowStyle}>
              <span>开始时间</span>
              <span>{actualInfo.start}</span>
            </div>
            <div style={rowStyle}>
              <span>完成时间</span>
              <span>{actualInfo.end}</span>
            </div>
            {isSummaryTask && <div style={hintStyle}>由子任务汇总</div>}
            <div style={sectionTitleStyle}>偏差</div>
            {actualInfo.startDeviation && (
              <div style={rowStyle}>
                <span>开始</span>
                <span>{actualInfo.startDeviation}</span>
              </div>
            )}
            {actualInfo.endDeviation && (
              <div style={rowStyle}>
                <span>完成</span>
                <span>{actualInfo.endDeviation}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={rowStyle}>
              <span>实际时间未记录</span>
            </div>
            {isSummaryTask && <div style={hintStyle}>由子任务汇总</div>}
            <div style={sectionTitleStyle}>偏差</div>
            <div style={rowStyle}>
              <span>暂无偏差数据</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function zoomIn(mode: ViewMode) {
  if (mode === ViewMode.Month) return ViewMode.Week;
  if (mode === ViewMode.Week) return ViewMode.Day;
  return ViewMode.Day;
}

function zoomOut(mode: ViewMode) {
  if (mode === ViewMode.Day) return ViewMode.Week;
  if (mode === ViewMode.Week) return ViewMode.Month;
  return ViewMode.Month;
}

function getSvgHeight(svg: SVGElement) {
  const attr = svg.getAttribute("height");
  if (attr) {
    const parsed = Number.parseFloat(attr);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return svg.getBoundingClientRect().height;
}

function getCalendarHeaderSvg(root: HTMLDivElement) {
  const svgElements = Array.from(root.querySelectorAll<SVGSVGElement>("svg"));
  return (
    svgElements.find((svg) => {
      const svgHeight = getSvgHeight(svg);
      return Math.abs(svgHeight - HEADER_HEIGHT) <= 2;
    }) ?? null
  );
}

function splitDayHeaderText(value: string) {
  const match = value.trim().match(/^(.+?)(?:[,，]|\s)\s*(\d{1,2})$/);
  if (!match) return null;
  return { weekday: match[1], day: match[2] };
}

function hasExpectedDayHeaderTspans(text: SVGTextElement, marker: string, showWeekday: boolean) {
  if (text.dataset.ganttDayHeader !== marker) return false;

  const dateLine = text.querySelector("tspan.calendar-day-date");
  if (!dateLine) return false;

  return showWeekday ? Boolean(text.querySelector("tspan.calendar-day-weekday")) : true;
}

function replaceTextWithTspan(text: SVGTextElement, weekday: string, day: string, columnWidth: number) {
  const x = text.getAttribute("x") ?? "0";
  const showWeekday = columnWidth >= DAY_HEADER_WEEKDAY_MIN_WIDTH;
  const marker = showWeekday ? `${weekday}-${day}-full` : `${day}-compact`;

  if (hasExpectedDayHeaderTspans(text, marker, showWeekday)) return;

  text.textContent = "";
  text.dataset.ganttDayHeader = marker;
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("y", String(showWeekday ? DAY_HEADER_FULL_Y : DAY_HEADER_COMPACT_Y));

  if (!showWeekday) {
    const dayOnly = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    dayOnly.setAttribute("x", x);
    dayOnly.setAttribute("dy", "0");
    dayOnly.classList.add("calendar-day-date");
    dayOnly.textContent = day;
    text.appendChild(dayOnly);
    return;
  }

  const weekdayLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
  weekdayLine.setAttribute("x", x);
  weekdayLine.setAttribute("dy", "-0.35em");
  weekdayLine.classList.add("calendar-day-weekday");
  weekdayLine.textContent = weekday;

  const dayLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
  dayLine.setAttribute("x", x);
  dayLine.setAttribute("dy", "1.25em");
  dayLine.classList.add("calendar-day-date");
  dayLine.textContent = day;

  text.appendChild(weekdayLine);
  text.appendChild(dayLine);
}

function formatDayCalendarHeader(root: HTMLDivElement, columnWidth: number) {
  const headerSvg = getCalendarHeaderSvg(root);
  if (!headerSvg) return false;

  const calendarTexts = Array.from(headerSvg.querySelectorAll<SVGTextElement>("text"));
  let formatted = false;
  calendarTexts.forEach((text) => {
    const currentText = text.textContent ?? "";
    const dayHeader = splitDayHeaderText(currentText);
    if (!dayHeader) return;
    replaceTextWithTspan(text, dayHeader.weekday, dayHeader.day, columnWidth);
    formatted = true;
  });
  return formatted;
}

function utcDayStamp(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function getViewConfig(mode: ViewMode) {
  if (mode === ViewMode.Month) {
    return { columnWidth: MONTH_COLUMN_WIDTH, preStepsCount: MONTH_PRE_STEPS };
  }
  if (mode === ViewMode.Week) {
    return { columnWidth: WEEK_COLUMN_WIDTH, preStepsCount: WEEK_PRE_STEPS };
  }
  return { columnWidth: DAY_COLUMN_WIDTH, preStepsCount: DAY_PRE_STEPS };
}

function getRangeStart(earliestStart: Date, mode: ViewMode, preStepsCount: number) {
  if (mode === ViewMode.Month) {
    const monthStart = new Date(earliestStart.getFullYear(), earliestStart.getMonth(), 1);
    return addMonths(monthStart, -preStepsCount);
  }

  if (mode === ViewMode.Week) {
    const day = earliestStart.getDay();
    const monday = addDays(earliestStart, day === 0 ? -6 : 1 - day);
    const mondayStart = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
    return addDays(mondayStart, -7 * preStepsCount);
  }

  const dayStart = new Date(earliestStart.getFullYear(), earliestStart.getMonth(), earliestStart.getDate());
  return addDays(dayStart, -preStepsCount);
}

function getGeneratedRangeEnd(latestEnd: Date, mode: ViewMode) {
  const dayStart = new Date(latestEnd.getFullYear(), latestEnd.getMonth(), latestEnd.getDate());

  if (mode === ViewMode.Month) {
    return new Date(latestEnd.getFullYear() + 1, 0, 1);
  }

  if (mode === ViewMode.Week) {
    return addMonths(dayStart, 1.5);
  }

  return addDays(dayStart, 19);
}

function getRequiredRangeEnd(rangeStart: Date, visibleTimelineWidth: number, columnWidth: number, mode: ViewMode) {
  const availableWidth = Math.max(0, visibleTimelineWidth - columnWidth - TIMELINE_RIGHT_SAFE_WIDTH);
  const visibleUnits = Math.max(1, Math.floor(availableWidth / columnWidth));

  if (mode === ViewMode.Month) {
    return addMonths(rangeStart, visibleUnits);
  }

  if (mode === ViewMode.Week) {
    return addDays(rangeStart, visibleUnits * 7);
  }

  return addDays(rangeStart, visibleUnits);
}

function getEarliestStart(tasks: TaskRow[], includeActual = false, includeBaseline = false) {
  if (tasks.length === 0) return null;
  return tasks.reduce<Date>((earliest, task) => {
    const actualStart = includeActual && getTaskActualStart(task)
      ? getDisplayIntervalStart(getTaskActualStart(task)!, task)
      : undefined;
    const baselineStart = includeBaseline && task.baselineStart
      ? getDisplayIntervalStart(task.baselineStart, task)
      : undefined;
    const taskStart = [getDisplayIntervalStart(task.start, task), actualStart, baselineStart]
      .filter((date): date is Date => Boolean(date))
      .reduce((min, date) => (date < min ? date : min), getDisplayIntervalStart(task.start, task));
    return taskStart < earliest ? taskStart : earliest;
  }, [
    getDisplayIntervalStart(tasks[0].start, tasks[0]),
    includeActual && getTaskActualStart(tasks[0])
      ? getDisplayIntervalStart(getTaskActualStart(tasks[0])!, tasks[0])
      : undefined,
    includeBaseline && tasks[0].baselineStart
      ? getDisplayIntervalStart(tasks[0].baselineStart, tasks[0])
      : undefined,
  ]
    .filter((date): date is Date => Boolean(date))
    .reduce((min, date) => (date < min ? date : min), getDisplayIntervalStart(tasks[0].start, tasks[0])));
}

function getLatestEnd(tasks: TaskRow[], includeActual = false, includeBaseline = false) {
  if (tasks.length === 0) return null;
  return tasks.reduce<Date>((latest, task) => {
    const rawActualEnd = includeActual ? getActualDisplayEnd(task) : null;
    const actualEnd = rawActualEnd ? getDisplayIntervalEnd(rawActualEnd) : null;
    const baselineEnd = includeBaseline && task.baselineEnd
      ? getDisplayIntervalEnd(task.baselineEnd)
      : undefined;
    const taskEnd = [getDisplayIntervalEnd(task.end), actualEnd, baselineEnd]
      .filter((date): date is Date => Boolean(date))
      .reduce((max, date) => (date > max ? date : max), getDisplayIntervalEnd(task.end));
    return taskEnd > latest ? taskEnd : latest;
  }, [
    getDisplayIntervalEnd(tasks[0].end),
    includeActual && getActualDisplayEnd(tasks[0])
      ? getDisplayIntervalEnd(getActualDisplayEnd(tasks[0])!)
      : undefined,
    includeBaseline && tasks[0].baselineEnd
      ? getDisplayIntervalEnd(tasks[0].baselineEnd)
      : undefined,
  ]
    .filter((date): date is Date => Boolean(date))
    .reduce((max, date) => (date > max ? date : max), getDisplayIntervalEnd(tasks[0].end)));
}

function isSameDay(left: Date | null | undefined, right: Date | null | undefined) {
  if (!left || !right) return false;
  return utcDayStamp(left) === utcDayStamp(right);
}

function buildTaskRowMap(tasks: TaskRow[]) {
  return new Map(tasks.map((task) => [task.id, task]));
}

function buildTaskRowChildrenMap(tasks: TaskRow[]) {
  const map = new Map<string, string[]>();
  tasks.forEach((task) => {
    if (!task.parentId) return;
    const children = map.get(task.parentId) ?? [];
    children.push(task.id);
    map.set(task.parentId, children);
  });
  return map;
}

function addAncestors(task: TaskRow, taskById: Map<string, TaskRow>, includedIds: Set<string>) {
  let currentParentId = task.parentId ?? null;
  const visited = new Set<string>();

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    includedIds.add(currentParentId);
    currentParentId = taskById.get(currentParentId)?.parentId ?? null;
  }
}

function addDescendants(taskId: string, childrenMap: Map<string, string[]>, includedIds: Set<string>) {
  const stack = [...(childrenMap.get(taskId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || includedIds.has(current)) continue;
    includedIds.add(current);
    stack.push(...(childrenMap.get(current) ?? []));
  }
}

function hasCollapsedIncludedAncestor(
  task: TaskRow,
  taskById: Map<string, TaskRow>,
  includedIds: Set<string>
) {
  let currentParentId = task.parentId ?? null;
  const visited = new Set<string>();

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = taskById.get(currentParentId);
    if (!parent) return false;
    if (includedIds.has(parent.id) && parent.isExpanded === false) {
      return true;
    }
    currentParentId = parent.parentId ?? null;
  }

  return false;
}

function matchesTaskFilter(task: TaskRow, filter: TaskFilterValue) {
  const type = task.type ?? "task";

  if (filter === "all") return true;
  if (filter === "task") return type === "task" && !task.hasChildren;
  if (filter === "milestone") return type === "milestone";
  if (filter === "summary") return task.hasChildren;
  if (filter === "completed") return isCountableTask(task) && task.scheduleStatus === "completed";
  if (filter === "overdue") {
    return isCountableTask(task) && task.scheduleStatus === "overdue";
  }
  if (filter === "readyMilestone") return isCountableMilestone(task) && isMilestoneAwaitingConfirmation(task);
  if (filter === "globalCritical") return Boolean(task.isCritical);
  return Boolean(task.isLocalCritical);
}

function filterTaskRows(
  visibleTasks: TaskRow[],
  allTasks: TaskRow[],
  searchValue: string,
  filterValue: TaskFilterValue
) {
  const query = searchValue.trim().toLowerCase();
  const hasActiveFilter = query.length > 0 || filterValue !== "all";

  if (!hasActiveFilter) {
    return { tasks: visibleTasks, isFiltering: false };
  }

  const taskById = buildTaskRowMap(allTasks);
  const childrenMap = buildTaskRowChildrenMap(allTasks);
  const includedIds = new Set<string>();

  allTasks.forEach((task) => {
    const matchesSearch = query.length === 0 || task.name.toLowerCase().includes(query);
    if (!matchesSearch || !matchesTaskFilter(task, filterValue)) return;

    includedIds.add(task.id);
    addAncestors(task, taskById, includedIds);
    if (task.hasChildren) {
      addDescendants(task.id, childrenMap, includedIds);
    }
  });

  const filteredTasks = allTasks.filter(
    (task) => includedIds.has(task.id) && !hasCollapsedIncludedAncestor(task, taskById, includedIds)
  );

  return { tasks: filteredTasks, isFiltering: true };
}

function getViewDate(earliestStart: Date | null, mode: ViewMode) {
  if (!earliestStart) return undefined;
  const offset = mode === ViewMode.Month ? 0 : mode === ViewMode.Week ? 1 : 2;
  return new Date(earliestStart.getTime() + offset);
}

export function GanttChart({
  projectId,
  tasks,
  allTasks,
  focusedTask,
  criticalPathError,
  selectedSummaryTaskId,
  localCriticalPathError,
  hasBaseline,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onUpdateTask,
  onCaptureBaseline,
  onClearBaseline,
  onExportExcel,
  onToggleExpand,
  onMoveTask,
  onToggleMilestonePassed,
  onSelectSummaryTask,
  onClearSelectedSummaryTask,
  onClearFocusedTask,
}: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const [displayMode, setDisplayMode] = useState<GanttDisplayMode>("simple");
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showActual, setShowActual] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilterValue>("all");
  const [dependencyOverlay, setDependencyOverlay] = useState<DependencyOverlayLayout | null>(null);
  const [actualTooltip, setActualTooltip] = useState<ActualTooltipState | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [ganttWidth, setGanttWidth] = useState(0);
  const ganttContainerRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const viewConfig = useMemo(() => getViewConfig(viewMode), [viewMode]);
  const effectiveShowActual = displayMode === "analysis" && showActual;
  const effectiveShowBaseline = displayMode === "analysis" && showBaseline && hasBaseline;
  const effectiveShowCriticalPath = showCriticalPath;
  const filteredTaskResult = useMemo(
    () => filterTaskRows(tasks, allTasks, taskSearch, taskFilter),
    [allTasks, taskFilter, taskSearch, tasks]
  );
  const displayTasks = filteredTaskResult.tasks;
  const isFilteringTasks = filteredTaskResult.isFiltering;
  const availableFilterOptions = useMemo(
    () => TASK_FILTER_OPTIONS.filter((option) => !option.requiresLocalSummary || Boolean(selectedSummaryTaskId)),
    [selectedSummaryTaskId]
  );
  const healthStats = useMemo(() => calculateProjectHealthStats(allTasks), [allTasks]);
  const timelineStart = useMemo(
    () => getEarliestStart(displayTasks, effectiveShowActual, effectiveShowBaseline),
    [displayTasks, effectiveShowActual, effectiveShowBaseline]
  );
  const timelineEnd = useMemo(
    () => getLatestEnd(displayTasks, effectiveShowActual, effectiveShowBaseline),
    [displayTasks, effectiveShowActual, effectiveShowBaseline]
  );

  const handleDisplayModeChange = (mode: GanttDisplayMode) => {
    setDisplayMode(mode);
    if (mode === "simple") {
      setShowActual(false);
      setShowCriticalPath(false);
      setShowBaseline(false);
      return;
    }

    setShowActual(true);
    setShowCriticalPath(true);
    setShowBaseline(hasBaseline);
  };

  const handleCaptureBaseline = () => {
    const confirmed = window.confirm("设置基线会用当前计划覆盖已有基线，是否继续？");
    if (!confirmed) return;
    onCaptureBaseline();
    setShowBaseline(true);
  };

  const handleClearBaseline = () => {
    const confirmed = window.confirm("确认清除当前项目基线吗？");
    if (!confirmed) return;
    onClearBaseline();
    setShowBaseline(false);
  };

  useEffect(() => {
    if (!focusedTask) return;
    setTaskSearch("");
    setTaskFilter("all");
  }, [focusedTask]);

  useEffect(() => {
    if (!hasBaseline) {
      setShowBaseline(false);
    }
  }, [hasBaseline]);

  useEffect(() => {
    if (taskFilter === "localCritical" && !selectedSummaryTaskId) {
      setTaskFilter("all");
    }
  }, [selectedSummaryTaskId, taskFilter]);

  useEffect(() => {
    const root = ganttContainerRef.current;
    if (!root) return undefined;

    const updateWidth = () => {
      setGanttWidth(root.clientWidth);
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(root);

    return () => {
      resizeObserver.disconnect();
    };
  }, [displayTasks.length]);

  const ganttTasks = useMemo<GanttTask[]>(() => {
    const mappedTasks = displayTasks.map((task) => {
      const isSummary = task.hasChildren;
      const isMilestone = (task.type ?? "task") === "milestone";
      const isCritical = effectiveShowCriticalPath && task.isCritical && !isSummary;
      const isCriticalSummary = effectiveShowCriticalPath && task.isCritical && isSummary;
      const isCriticalMilestone = isMilestone && isCritical;
      return {
        id: task.id,
        name: isMilestone ? "" : task.name,
        start: getDisplayIntervalStart(task.start, task),
        end: getDisplayIntervalEnd(task.end),
        progress: task.progress,
        type: (isSummary ? "project" : task.type ?? "task") as GanttTask["type"],
        isDisabled: isSummary,
        styles: isSummary
          ? isCriticalSummary
            ? {
                backgroundColor: "#dcefdc",
                backgroundSelectedColor: "#c6e7c8",
                progressColor: "#6ea878",
                progressSelectedColor: "#5b9465",
              }
            : {
                backgroundColor: "#dcefdc",
                backgroundSelectedColor: "#c6e7c8",
                progressColor: "#6ea878",
                progressSelectedColor: "#5b9465",
              }
          : isMilestone
            ? {
                backgroundColor: "rgba(245, 158, 11, 0.12)",
                backgroundSelectedColor: "rgba(245, 158, 11, 0.18)",
                progressColor: isCriticalMilestone ? "rgba(245, 158, 11, 0.2)" : "rgba(245, 158, 11, 0.14)",
                progressSelectedColor: "rgba(245, 158, 11, 0.22)",
              }
          : isCritical
            ? {
                backgroundColor: "#fecaca",
                backgroundSelectedColor: "#fca5a5",
                progressColor: "#ef4444",
                progressSelectedColor: "#dc2626",
              }
            : {
                backgroundColor: "#dbeafe",
                backgroundSelectedColor: "#c7d2fe",
                progressColor: "#6366f1",
                progressSelectedColor: "#4f46e5",
              },
      };
    });

    const visibleTimelineWidth = Math.max(0, ganttWidth - TASK_LIST_WIDTH);

    if (!timelineStart || !timelineEnd || visibleTimelineWidth <= 0) {
      return mappedTasks;
    }

    const plannedTimelineStart = getEarliestStart(displayTasks, false, false);
    const plannedTimelineEnd = getLatestEnd(displayTasks, false, false);
    const rangeStart = getRangeStart(timelineStart, viewMode, viewConfig.preStepsCount);
    const generatedRangeEnd = getGeneratedRangeEnd(timelineEnd, viewMode);
    const requiredRangeEnd = getRequiredRangeEnd(
      rangeStart,
      visibleTimelineWidth,
      viewConfig.columnWidth,
      viewMode
    );
    const rangeEnd = generatedRangeEnd >= requiredRangeEnd ? timelineEnd : requiredRangeEnd;
    const needsRangeExtender =
      !isSameDay(timelineStart, plannedTimelineStart) ||
      !isSameDay(timelineEnd, plannedTimelineEnd) ||
      generatedRangeEnd < requiredRangeEnd;

    if (!needsRangeExtender) {
      return mappedTasks;
    }

    return [
      ...mappedTasks,
      {
        id: RANGE_EXTENDER_TASK_ID,
        name: "",
        start: timelineStart,
        end: rangeEnd,
        progress: 0,
        type: "task" as const,
        isDisabled: true,
        styles: {
          backgroundColor: "transparent",
          backgroundSelectedColor: "transparent",
          progressColor: "transparent",
          progressSelectedColor: "transparent",
        },
      },
    ];
  }, [
    displayTasks,
    ganttWidth,
    effectiveShowCriticalPath,
    timelineEnd,
    timelineStart,
    viewConfig.columnWidth,
    viewConfig.preStepsCount,
    viewMode,
  ]);

  const taskById = useMemo(() => new Map(displayTasks.map((task) => [task.id, task])), [displayTasks]);
  const allTaskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks]);

  const Tooltip = useMemo(() => {
    const WrappedTooltip: FC<TooltipContentProps> = (props) => {
      const originalTask = taskById.get(props.task.id);
      if (!originalTask) return <TooltipContent {...props} />;
      return (
        <TooltipContent
          {...props}
          task={{
            ...props.task,
            name: originalTask.name,
            start: originalTask.start,
            end: originalTask.end,
            baselineStart: originalTask.baselineStart,
            baselineEnd: originalTask.baselineEnd,
            actualStart: originalTask.actualStart,
            actualEnd: originalTask.actualEnd,
            milestoneStatus: originalTask.milestoneStatus,
            passedAt: originalTask.passedAt,
            progress: originalTask.progress,
            type: originalTask.hasChildren ? "project" : (originalTask.type ?? "task"),
          } as GanttTask & Partial<Pick<Task, "baselineStart" | "baselineEnd" | "actualStart" | "actualEnd" | "milestoneStatus" | "passedAt">>}
        />
      );
    };
    return WrappedTooltip;
  }, [taskById]);

  useEffect(() => {
    const root = ganttContainerRef.current;
    if (!root) return undefined;

    let frameId = 0;

    const updateOverlay = () => {
      const chartSvg = getChartSvg(root);
      if (!chartSvg) {
        setDependencyOverlay(null);
        return;
      }

      const chartViewport = getChartViewport(chartSvg, root);
      if (!chartViewport) {
        setDependencyOverlay(null);
        return;
      }

      const wrapperRect = root.getBoundingClientRect();
      const viewportRect = chartViewport.getBoundingClientRect();
      const barElements = Array.from(chartSvg.querySelectorAll<SVGGElement>("g[tabindex='0']"));
      const barRectById = new Map<string, OverlayRect>();
      const rawBarRectById = new Map<string, OverlayRect>();

      displayTasks.forEach((task, index) => {
        const element = barElements[index];
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const rawRect = {
          x: rect.left - viewportRect.left,
          y: rect.top - viewportRect.top,
          width: rect.width,
          height: rect.height,
        };
        rawBarRectById.set(task.id, rawRect);
        barRectById.set(
          task.id,
          (task.type ?? "task") === "milestone" ? getMilestoneOverlayRect(rawRect) : rawRect
        );
      });

      const summaryBars = displayTasks.flatMap<SummaryBarOverlay>((task) => {
        if (!task.hasChildren) return [];
        const rect = barRectById.get(task.id);
        if (!rect) return [];
        return [
          {
            id: task.id,
            name: task.name,
            rect,
            progressWidth: rect.width * Math.max(0, Math.min(100, task.progress)) / 100,
          },
        ];
      });

      const paths: DependencyPath[] = [];
      displayTasks.forEach((task) => {
        (task.dependencies ?? []).forEach((dependency, dependencyIndex) => {
          const predecessorRect = barRectById.get(dependency.taskId);
          const currentRect = barRectById.get(task.id);
          if (!predecessorRect || !currentRect) return;

          const predecessorTask = taskById.get(dependency.taskId);
          paths.push({
            key: `${task.id}-${dependency.taskId}-${dependency.type}-${dependencyIndex}`,
            taskId: task.id,
            predecessorId: dependency.taskId,
            d: buildDependencyPath(dependency, predecessorRect, currentRect),
            type: dependency.type,
            isCritical: Boolean(
              effectiveShowCriticalPath && dependency.isCritical && task.isCritical && predecessorTask?.isCritical
            ),
            isLocalCritical: Boolean(
              effectiveShowCriticalPath &&
                dependency.isLocalCritical &&
                task.isLocalCritical &&
                predecessorTask?.isLocalCritical
            ),
          });
        });
      });

      const globalCriticalRects = effectiveShowCriticalPath
        ? displayTasks.flatMap((task) => {
            if (!task.isCritical) return [];
            if ((task.type ?? "task") === "milestone") return [];
            const rect = barRectById.get(task.id);
            return rect ? [rect] : [];
          })
        : [];

      const localCriticalRects = effectiveShowCriticalPath
        ? displayTasks.flatMap((task) => {
            if (!task.isLocalCritical) return [];
            if ((task.type ?? "task") === "milestone") return [];
            const rect = barRectById.get(task.id);
            return rect ? [rect] : [];
          })
        : [];

      const overlayRangeStart = timelineStart
        ? getRangeStart(timelineStart, viewMode, viewConfig.preStepsCount)
        : null;
      const chartScrollLeft = chartViewport instanceof HTMLElement ? chartViewport.scrollLeft : 0;
      const baselineBars = effectiveShowBaseline && overlayRangeStart
        ? displayTasks.flatMap<BaselineBarOverlay>((task) => {
            const rawRect = rawBarRectById.get(task.id);
            if (!rawRect) return [];
            const baselineBar = getBaselineBarOverlayRect(
              task,
              overlayRangeStart,
              viewMode,
              viewConfig.columnWidth,
              rawRect,
              chartScrollLeft
            );
            return baselineBar ? [baselineBar] : [];
          })
        : [];
      const actualBars = effectiveShowActual && overlayRangeStart
        ? displayTasks.flatMap<ActualBarOverlay>((task) => {
            const rawRect = rawBarRectById.get(task.id);
            if (!rawRect) return [];
            const actualBar = getActualBarOverlayRect(
              task,
              overlayRangeStart,
              viewMode,
              viewConfig.columnWidth,
              rawRect,
              chartScrollLeft
            );
            return actualBar ? [actualBar] : [];
          })
        : [];

      const milestones = displayTasks.flatMap<MilestoneOverlay>((task) => {
        if ((task.type ?? "task") !== "milestone") return [];
        const rect = barRectById.get(task.id);
        if (!rect) return [];
        return [
          {
            id: task.id,
            name: task.name,
            rect,
            isCritical: Boolean(effectiveShowCriticalPath && task.isCritical),
            isLocalCritical: Boolean(effectiveShowCriticalPath && task.isLocalCritical),
          },
        ];
      });

      if (
        paths.length === 0 &&
        summaryBars.length === 0 &&
        baselineBars.length === 0 &&
        actualBars.length === 0 &&
        globalCriticalRects.length === 0 &&
        localCriticalRects.length === 0 &&
        milestones.length === 0
      ) {
        setDependencyOverlay(null);
        return;
      }

      setDependencyOverlay({
        left: viewportRect.left - wrapperRect.left,
        top: viewportRect.top - wrapperRect.top,
        width: viewportRect.width,
        height: viewportRect.height,
        summaryBars,
        paths,
        baselineBars,
        actualBars,
        globalCriticalRects,
        localCriticalRects,
        milestones,
      });
    };

    const scheduleOverlayUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateOverlay);
    };

    scheduleOverlayUpdate();

    const resizeObserver = new ResizeObserver(() => {
      scheduleOverlayUpdate();
    });
    resizeObserver.observe(root);

    const mutationObserver = new MutationObserver((mutations) => {
      const hasExternalMutation = mutations.some((mutation) => {
        if (!(mutation.target instanceof Element)) return true;
        return !mutation.target.closest(".dependency-overlay-host");
      });
      if (hasExternalMutation) {
        scheduleOverlayUpdate();
      }
    });
    mutationObserver.observe(root, { subtree: true, childList: true, attributes: true });

    const handleScroll = () => {
      scheduleOverlayUpdate();
    };

    root.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      root.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [
    displayTasks,
    taskById,
    viewMode,
    effectiveShowCriticalPath,
    effectiveShowActual,
    effectiveShowBaseline,
    timelineStart,
    viewConfig.columnWidth,
    viewConfig.preStepsCount,
  ]);

  const viewDate = useMemo(() => getViewDate(timelineStart, viewMode), [timelineStart, viewMode]);

  useEffect(() => {
    if (viewMode !== ViewMode.Day) return undefined;
    const root = ganttContainerRef.current;
    if (!root) return undefined;

    const frameIds: number[] = [];
    const timeoutIds: number[] = [];
    let isFormatting = false;

    const scheduleFormat = () => {
      if (isFormatting) return;
      isFormatting = true;
      const frameId = requestAnimationFrame(() => {
        formatDayCalendarHeader(root, viewConfig.columnWidth);
        isFormatting = false;
      });
      frameIds.push(frameId);
    };

    scheduleFormat();
    timeoutIds.push(window.setTimeout(scheduleFormat, 60));
    timeoutIds.push(window.setTimeout(scheduleFormat, 180));

    const mutationObserver = new MutationObserver((mutations) => {
      const hasCalendarMutation = mutations.some((mutation) => {
        if (!(mutation.target instanceof Element)) return true;
        return !mutation.target.closest(".dependency-overlay-host");
      });
      if (hasCalendarMutation) {
        scheduleFormat();
      }
    });
    mutationObserver.observe(root, { subtree: true, childList: true, characterData: true });

    return () => {
      frameIds.forEach((frameId) => cancelAnimationFrame(frameId));
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      mutationObserver.disconnect();
    };
  }, [displayTasks, viewMode, viewConfig.columnWidth]);

  const TaskListTable = useMemo(() => {
    const Table: FC<TaskListTableBaseProps> = (props) => (
      <TaskListTableContent
        {...props}
        taskById={taskById}
        dependencyTaskById={allTaskById}
        onEditTask={onEditTask}
        onDeleteTask={onDeleteTask}
        onToggleExpand={onToggleExpand}
        onMoveTask={onMoveTask}
        onToggleMilestonePassed={onToggleMilestonePassed}
        selectedSummaryTaskId={selectedSummaryTaskId}
        onSelectSummaryTask={onSelectSummaryTask}
        onHoverTask={setHoveredTaskId}
        focusedTask={focusedTask}
        onClearFocusedTask={onClearFocusedTask}
      />
    );
    return Table;
  }, [
    taskById,
    allTaskById,
    onEditTask,
    onDeleteTask,
    onToggleExpand,
    onMoveTask,
    onToggleMilestonePassed,
    selectedSummaryTaskId,
    onSelectSummaryTask,
    setHoveredTaskId,
    focusedTask,
    onClearFocusedTask,
  ]);

  const handleDateChange = (updatedTask: GanttTask) => {
    const originalTask = taskById.get(updatedTask.id);
    if (!originalTask) return false;
    if (originalTask.hasChildren) return false;
    const isMilestone = (originalTask.type ?? "task") === "milestone";
    const snappedDisplayStart = snapToNearestDayStart(updatedTask.start);
    const snappedDisplayEnd = snapToNearestDayStart(updatedTask.end);
    const nextStart = isMilestone ? snappedDisplayStart : addDays(snappedDisplayStart, 1);
    const nextEnd = isMilestone ? snappedDisplayStart : snappedDisplayEnd;

    return onUpdateTask(originalTask.id, {
      name: originalTask.name,
      start: nextStart,
      end: nextEnd,
      progress: originalTask.progress,
    });
  };

  const handleTaskClick = (clickedTask: GanttTask) => {
    onClearFocusedTask();
    const originalTask = taskById.get(clickedTask.id);
    if (!originalTask?.hasChildren) return;
    onSelectSummaryTask(originalTask.id);
  };

  const handleTaskDoubleClick = (clickedTask: GanttTask) => {
    onClearFocusedTask();
    const originalTask = taskById.get(clickedTask.id);
    if (!originalTask) return;
    onEditTask(originalTask);
  };

  const resolveHorizontalScroll = () => {
    if (horizontalScrollRef.current && horizontalScrollRef.current.isConnected) {
      return horizontalScrollRef.current;
    }

    const root = ganttContainerRef.current;
    if (!root) return null;

    const candidates = Array.from(root.querySelectorAll<HTMLDivElement>("div"));
    const found = candidates.find((element) => {
      const style = getComputedStyle(element);
      const overflowX = style.overflowX;
      return (
        (overflowX === "auto" || overflowX === "scroll") &&
        element.clientHeight > 0 &&
        element.clientHeight <= 24
      );
    });

    horizontalScrollRef.current = found ?? null;
    return horizontalScrollRef.current;
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const svgElement = target.closest("svg");
    if (!(svgElement instanceof SVGElement)) return;

    const svgHeight = getSvgHeight(svgElement);
    const isHeader = Math.abs(svgHeight - HEADER_HEIGHT) <= 2;

    if (isHeader) {
      if (event.deltaY === 0) return;
      event.preventDefault();
      setViewMode((current) => (event.deltaY < 0 ? zoomOut(current) : zoomIn(current)));
      return;
    }

    const scrollElement = resolveHorizontalScroll();
    if (!scrollElement) return;

    const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    if (delta === 0) return;

    const maxScrollLeft = scrollElement.scrollWidth - scrollElement.clientWidth;
    if (maxScrollLeft <= 0) return;

    const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, scrollElement.scrollLeft + delta));
    if (nextScrollLeft === scrollElement.scrollLeft) return;

    scrollElement.scrollLeft = nextScrollLeft;
    event.preventDefault();
  };

  const handleChartAreaClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".task-list-row")) return;
    if (target.closest("g[tabindex='0']")) return;
    if (target.closest("button, input, label, select, textarea")) return;
    onClearFocusedTask();
    onClearSelectedSummaryTask();
  };

  const handleChartAreaMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".task-list-row")) return;

    const barGroup = target.closest("g[tabindex='0']");
    const root = ganttContainerRef.current;
    if (!barGroup || !root) {
      if (hoveredTaskId) setHoveredTaskId(null);
      return;
    }

    const chartSvg = getChartSvg(root);
    if (!chartSvg) return;

    const barElements = Array.from(chartSvg.querySelectorAll<SVGGElement>("g[tabindex='0']"));
    const index = barElements.indexOf(barGroup as SVGGElement);
    const taskId = index >= 0 ? displayTasks[index]?.id ?? null : null;
    if (taskId !== hoveredTaskId) {
      setHoveredTaskId(taskId);
    }
  };

  const handleChartAreaMouseLeave = () => {
    setHoveredTaskId(null);
  };

  return (
    <div className="gantt-wrapper">
      <div className="gantt-toolbar">
        <div className="gantt-toolbar-filters">
          <input
            type="search"
            className="task-search-input"
            placeholder="搜索任务"
            value={taskSearch}
            onChange={(event) => setTaskSearch(event.target.value)}
            aria-label="搜索任务"
          />
          <select
            className="task-filter-select"
            value={taskFilter}
            onChange={(event) => setTaskFilter(event.target.value as TaskFilterValue)}
            aria-label="筛选任务"
          >
            {availableFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="gantt-toolbar-controls">
          <GanttToolbar
            viewMode={viewMode}
            displayMode={displayMode}
            onChange={setViewMode}
            onDisplayModeChange={handleDisplayModeChange}
          />
          <div className="gantt-toolbar-actions">
            {displayMode === "analysis" && (
              <div className="baseline-controls" aria-label="基线控制">
                <button type="button" className="secondary-button baseline-action-button" onClick={handleCaptureBaseline}>
                  设置基线
                </button>
                <button
                  type="button"
                  className="secondary-button baseline-action-button"
                  onClick={handleClearBaseline}
                  disabled={!hasBaseline}
                >
                  清除基线
                </button>
                <label className={hasBaseline ? "critical-path-toggle" : "critical-path-toggle critical-path-toggle--muted"}>
                  <input
                    type="checkbox"
                    checked={effectiveShowBaseline}
                    disabled={!hasBaseline}
                    onChange={(event) => setShowBaseline(event.target.checked)}
                  />
                  <span>显示基线</span>
                </label>
              </div>
            )}
            <label className={displayMode === "simple" ? "critical-path-toggle critical-path-toggle--muted" : "critical-path-toggle"}>
              <input
                type="checkbox"
                checked={effectiveShowActual}
                disabled={displayMode === "simple"}
                onChange={(event) => setShowActual(event.target.checked)}
              />
              <span>显示实际</span>
            </label>
            <label className="critical-path-toggle">
              <input
                type="checkbox"
                checked={showCriticalPath}
                onChange={(event) => setShowCriticalPath(event.target.checked)}
              />
              <span>关键路径</span>
            </label>
            <button type="button" className="primary-button" onClick={onCreateTask}>
              + 新建任务
            </button>
            <button type="button" className="secondary-button" onClick={onExportExcel}>
              导出 Excel
            </button>
          </div>
        </div>
      </div>
      <ProjectHealthBar stats={healthStats} onFilterChange={setTaskFilter} />
      {criticalPathError && showCriticalPath && (
        <div className="critical-path-warning" role="alert">
          {criticalPathError}
        </div>
      )}
      {localCriticalPathError && selectedSummaryTaskId && showCriticalPath && (
        <div className="critical-path-warning critical-path-warning--local" role="alert">
          {localCriticalPathError}
        </div>
      )}
      {displayTasks.length === 0 ? (
        <div className="gantt-empty">
          {isFilteringTasks ? "没有匹配的任务" : "暂无任务"}
        </div>
      ) : (
        <div
          className={`gantt-chart-area gantt-chart-area--${displayMode}`}
          onWheel={handleWheel}
          onClick={handleChartAreaClick}
          onMouseMove={handleChartAreaMouseMove}
          onMouseLeave={handleChartAreaMouseLeave}
          ref={ganttContainerRef}
        >
          <Gantt
            key={projectId ?? "no-active-project"}
            tasks={ganttTasks}
            viewMode={viewMode}
            viewDate={viewDate}
            locale="zh-CN"
            headerHeight={HEADER_HEIGHT}
            columnWidth={viewConfig.columnWidth}
            rowHeight={effectiveShowActual ? 54 : 46}
            barFill={effectiveShowActual ? DUAL_TRACK_PLAN_BAR_FILL : PLAN_BAR_FILL}
            preStepsCount={viewConfig.preStepsCount}
            TaskListHeader={TaskListHeader}
            TaskListTable={TaskListTable}
            TooltipContent={Tooltip}
            onClick={handleTaskClick}
            onDoubleClick={handleTaskDoubleClick}
            onDateChange={handleDateChange}
          />
          {dependencyOverlay && (
            <div
              className="dependency-overlay-host"
              style={{
                left: dependencyOverlay.left,
                top: dependencyOverlay.top,
                width: dependencyOverlay.width,
                height: dependencyOverlay.height,
              }}
            >
              <svg
                className="dependency-overlay-svg"
                width={dependencyOverlay.width}
                height={dependencyOverlay.height}
                viewBox={`0 0 ${dependencyOverlay.width} ${dependencyOverlay.height}`}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="dependency-arrow-head"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5.4"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(100, 116, 139, 0.62)" />
                  </marker>
                  <marker
                    id="dependency-critical-arrow-head"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5.4"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(220, 38, 38, 0.76)" />
                  </marker>
                  <marker
                    id="dependency-local-critical-arrow-head"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5.4"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(249, 115, 22, 0.76)" />
                  </marker>
                </defs>
                {dependencyOverlay.baselineBars.map((bar) => (
                  <rect
                    key={`baseline-bar-${bar.id}`}
                    x={bar.rect.x}
                    y={bar.rect.y}
                    width={bar.rect.width}
                    height={bar.rect.height}
                    rx={bar.isMilestone ? "1" : "2"}
                    className={bar.isMilestone ? "baseline-task-bar baseline-task-bar--milestone" : "baseline-task-bar"}
                  />
                ))}
                {dependencyOverlay.summaryBars.map((bar) => {
                  const labelX = bar.rect.x + Math.min(Math.max(12, bar.rect.width / 2), Math.max(12, bar.rect.width - 12));
                  const labelY = bar.rect.y + bar.rect.height / 2;
                  return (
                    <g key={`summary-bar-${bar.id}`} className="summary-bar-overlay">
                      <rect
                        x={bar.rect.x}
                        y={bar.rect.y}
                        width={bar.rect.width}
                        height={bar.rect.height}
                        rx="6"
                        className="summary-bar-overlay-bg"
                      />
                      {bar.progressWidth > 0 && (
                        <rect
                          x={bar.rect.x}
                          y={bar.rect.y}
                          width={bar.progressWidth}
                          height={bar.rect.height}
                          rx="6"
                          className="summary-bar-overlay-progress"
                        />
                      )}
                      <text
                        x={labelX}
                        y={labelY}
                        className="summary-bar-overlay-label"
                        dominantBaseline="middle"
                        textAnchor="middle"
                      >
                        {bar.name}
                      </text>
                    </g>
                  );
                })}
                {dependencyOverlay.actualBars.map((bar) => {
                  const bounds = getActualBarBounds(bar);
                  return (
                    <g
                      key={`actual-bar-${bar.id}`}
                      className="actual-task-bar-group"
                      onMouseEnter={() => {
                        if (!bounds) return;
                        setActualTooltip({
                          taskId: bar.id,
                          left: Math.min(bounds.x + bounds.width + 12, dependencyOverlay.width - 190),
                          top: Math.max(8, bounds.y - 10),
                        });
                      }}
                      onMouseMove={() => {
                        if (!bounds) return;
                        setActualTooltip({
                          taskId: bar.id,
                          left: Math.min(bounds.x + bounds.width + 12, dependencyOverlay.width - 190),
                          top: Math.max(8, bounds.y - 10),
                        });
                      }}
                      onMouseLeave={() => setActualTooltip(null)}
                    >
                      {bar.normalRect && (
                        <rect
                          x={bar.normalRect.x}
                          y={bar.normalRect.y}
                          width={bar.normalRect.width}
                          height={bar.normalRect.height}
                          rx="4"
                          className={bar.isOpen ? "actual-task-bar actual-task-bar--open" : "actual-task-bar"}
                        />
                      )}
                      {bar.overdueRect && (
                        <rect
                          x={bar.overdueRect.x}
                          y={bar.overdueRect.y}
                          width={bar.overdueRect.width}
                          height={bar.overdueRect.height}
                          rx="4"
                          className={bar.isOpen
                            ? "actual-task-bar-overdue actual-task-bar-overdue--open"
                            : "actual-task-bar-overdue"}
                        />
                      )}
                      {bar.milestoneRect && (
                        <polygon
                          points={buildDiamondPoints(
                            bar.milestoneRect.x + bar.milestoneRect.width / 2,
                            bar.milestoneRect.y + bar.milestoneRect.height / 2,
                            bar.milestoneRect.width
                          )}
                          className={bar.isOverdue
                            ? "actual-milestone-marker actual-milestone-marker--overdue"
                            : "actual-milestone-marker"}
                        />
                      )}
                    </g>
                  );
                })}
                {dependencyOverlay.globalCriticalRects.map((rect, index) => (
                  <rect
                    key={`global-critical-task-${index}`}
                    x={rect.x - 2}
                    y={rect.y - 2}
                    width={rect.width + 4}
                    height={rect.height + 4}
                    rx="7"
                    className="global-critical-task-outline"
                  />
                ))}
                {dependencyOverlay.localCriticalRects.map((rect, index) => (
                  <rect
                    key={`local-critical-task-${index}`}
                    x={rect.x - 5}
                    y={rect.y - 5}
                    width={rect.width + 10}
                    height={rect.height + 10}
                    rx="9"
                    className="local-critical-task-outline"
                  />
                ))}
                {dependencyOverlay.milestones.map((milestone) => {
                  const labelX = milestone.rect.x + milestone.rect.width + MILESTONE_LABEL_OFFSET;
                  const centerY = milestone.rect.y + milestone.rect.height / 2;
                  return (
                    <g
                      key={`milestone-overlay-${milestone.id}`}
                      className={[
                        "milestone-overlay",
                        milestone.isCritical ? "milestone-overlay--critical" : "",
                        milestone.isLocalCritical ? "milestone-overlay--local-critical" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <polygon
                        points={buildMilestoneShapePoints(milestone.rect)}
                        className="milestone-overlay-diamond"
                      />
                      {milestone.isLocalCritical && (
                        <polygon
                          points={buildMilestoneShapePoints({
                            x: milestone.rect.x - 4,
                            y: milestone.rect.y - 4,
                            width: milestone.rect.width + 8,
                            height: milestone.rect.height + 8,
                          })}
                          className="milestone-overlay-local-outline"
                        />
                      )}
                      <text
                        x={labelX}
                        y={centerY}
                        className="milestone-overlay-label"
                        dominantBaseline="middle"
                      >
                        {milestone.name}
                      </text>
                    </g>
                  );
                })}
                {dependencyOverlay.paths.map((path) => {
                  const isRelatedToHover =
                    Boolean(hoveredTaskId) &&
                    (path.taskId === hoveredTaskId || path.predecessorId === hoveredTaskId);
                  const isDimmedByHover = Boolean(hoveredTaskId) && !isRelatedToHover;
                  return (
                    <g key={path.key}>
                      <path
                        d={path.d}
                        className={[
                          "dependency-path",
                          `dependency-path--${path.type.toLowerCase()}`,
                          path.isCritical ? "dependency-path--critical" : "",
                          !path.isCritical && path.isLocalCritical ? "dependency-path--local-critical" : "",
                          isRelatedToHover ? "dependency-path--hover-related" : "",
                          isDimmedByHover ? "dependency-path--hover-dimmed" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        markerEnd={
                          path.isCritical
                            ? "url(#dependency-critical-arrow-head)"
                            : path.isLocalCritical
                              ? "url(#dependency-local-critical-arrow-head)"
                              : "url(#dependency-arrow-head)"
                        }
                      />
                      {path.isCritical && path.isLocalCritical && (
                        <path
                          d={path.d}
                          transform="translate(4 -4)"
                          className={[
                            "dependency-path",
                            "dependency-path--local-critical",
                            "dependency-path--local-critical-offset",
                            isRelatedToHover ? "dependency-path--hover-related" : "",
                            isDimmedByHover ? "dependency-path--hover-dimmed" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          markerEnd="url(#dependency-local-critical-arrow-head)"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
              {actualTooltip && (() => {
                const task = taskById.get(actualTooltip.taskId);
                if (!task) return null;
                return (
                  <div
                    className="actual-tooltip-host"
                    style={{ left: actualTooltip.left, top: actualTooltip.top }}
                    onMouseEnter={() => setActualTooltip(actualTooltip)}
                    onMouseLeave={() => setActualTooltip(null)}
                  >
                    <TooltipContent
                      task={{
                        id: task.id,
                        name: task.name,
                        start: task.start,
                        end: task.end,
                        baselineStart: task.baselineStart,
                        baselineEnd: task.baselineEnd,
                        actualStart: task.actualStart,
                        actualEnd: task.actualEnd,
                        milestoneStatus: task.milestoneStatus,
                        passedAt: task.passedAt,
                        progress: task.progress,
                        type: task.hasChildren ? "project" : (task.type ?? "task"),
                      } as GanttTask & Partial<Pick<Task, "baselineStart" | "baselineEnd" | "actualStart" | "actualEnd" | "milestoneStatus" | "passedAt">>}
                      fontSize="12px"
                      fontFamily="inherit"
                    />
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
