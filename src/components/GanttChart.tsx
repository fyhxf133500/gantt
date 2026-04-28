import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, WheelEvent, FC } from "react";
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import type { Task, TaskDependency } from "../types/task";
import { GanttToolbar } from "./GanttToolbar";

export type GanttChartProps = {
  projectId: string | null;
  tasks: TaskRow[];
  allTasks: TaskRow[];
  criticalPathError?: string | null;
  selectedSummaryTaskId: string | null;
  localCriticalPathError?: string | null;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onUpdateTask: (id: string, input: TaskUpdateInput) => boolean;
  onToggleExpand: (id: string) => void;
  onMoveTask: (id: string, parentId: string | null, options?: MoveTaskOptions) => void;
  onToggleMilestonePassed: (id: string, options?: { force?: boolean }) => void;
  onSelectSummaryTask: (id: string) => void;
  onClearSelectedSummaryTask: () => void;
};

type TaskUpdateInput = Pick<Task, "name" | "start" | "end" | "progress">;

type TaskRow = Task & {
  level: number;
  hasChildren: boolean;
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
};

type TooltipContentProps = {
  task: GanttTask;
  fontSize: string;
  fontFamily: string;
};

type DependencyPath = {
  key: string;
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
  paths: DependencyPath[];
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

type ProjectHealthStats = {
  totalTasks: number;
  inProgress: number;
  completed: number;
  overdue: number;
  readyMilestones: number;
  passedMilestones: number;
  globalCritical: number;
};

type DependencyIssue = {
  key: string;
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

type PendingMilestonePass = {
  task: TaskRow;
  issues: DependencyIssue[];
};

const HEADER_HEIGHT = 64;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HEADER_COLUMNS = ["任务名称", "开始时间", "结束时间", "状态", "操作"];
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

function getDependencyIssues(
  task: Task,
  taskById: Map<string, TaskRow>,
  options?: { assumeProgress?: number }
): DependencyIssue[] {
  const taskProgress = options?.assumeProgress ?? task.progress;
  const shouldEvaluate = options?.assumeProgress !== undefined || task.dependencyViolation;
  if (!shouldEvaluate) return [];

  return (task.dependencies ?? []).flatMap<DependencyIssue>((dependency, index) => {
    const predecessor = taskById.get(dependency.taskId);
    if (!predecessor) return [];

    if (dependency.type === "FS" && predecessor.progress < 100 && taskProgress > 0) {
      return [
        {
          key: `${task.id}-${dependency.taskId}-${dependency.type}-${index}`,
          predecessorName: predecessor.name,
          dependencyType: dependency.type,
          description: `前置任务尚未完成，但当前任务已经${taskProgress >= 100 ? "完成" : "开始"}`,
        },
      ];
    }

    if (dependency.type === "SS" && predecessor.progress <= 0 && taskProgress > 0) {
      return [
        {
          key: `${task.id}-${dependency.taskId}-${dependency.type}-${index}`,
          predecessorName: predecessor.name,
          dependencyType: dependency.type,
          description: "前置任务尚未开始，但当前任务已经开始",
        },
      ];
    }

    if (dependency.type === "FF" && predecessor.progress < 100 && taskProgress >= 100) {
      return [
        {
          key: `${task.id}-${dependency.taskId}-${dependency.type}-${index}`,
          predecessorName: predecessor.name,
          dependencyType: dependency.type,
          description: "前置任务尚未完成，但当前任务已经完成",
        },
      ];
    }

    return [];
  });
}

function isMilestoneAwaitingConfirmation(task: Task) {
  if ((task.type ?? "task") !== "milestone") return false;
  if (task.milestoneStatus === "passed") return false;
  return task.milestoneStatus === "ready" || utcDayStamp(new Date()) >= utcDayStamp(task.end);
}

function isCountableTask(task: TaskRow) {
  return !task.hasChildren && (task.type ?? "task") === "task";
}

function isCountableMilestone(task: TaskRow) {
  return !task.hasChildren && (task.type ?? "task") === "milestone";
}

function calculateProjectHealthStats(tasks: TaskRow[]): ProjectHealthStats {
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
        if (isMilestoneAwaitingConfirmation(task)) stats.readyMilestones += 1;
        if (task.milestoneStatus === "passed") stats.passedMilestones += 1;
      }

      if (!task.hasChildren && task.isCritical) {
        stats.globalCritical += 1;
      }

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
    }
  );
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

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
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
}: TaskListTableContentProps) {
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, DATE_FORMAT_OPTIONS), [locale]);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "inside" | null>(null);
  const [dependencyPopover, setDependencyPopover] = useState<DependencyPopoverState | null>(null);
  const [pendingMilestonePass, setPendingMilestonePass] = useState<PendingMilestonePass | null>(null);
  const displayTasks = useMemo(
    () => tasks.filter((task) => task.id !== RANGE_EXTENDER_TASK_ID),
    [tasks]
  );

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
        const isSelectedSummary = hasChildren && selectedSummaryTaskId === task.id;
        const isDropTarget = Boolean(draggingTaskId && dropTargetId === task.id);
        const isDropInside = isDropTarget && dropPosition === "inside";
        const isDropBefore = isDropTarget && dropPosition === "before";
        const isDropAfter = isDropTarget && dropPosition === "after";
        const isDraggingRow = draggingTaskId === task.id;
        const rowClassName = [
          "task-list-row",
          isSelected ? "task-list-row--active" : "",
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
        const dependencyIssues = originalTask ? getDependencyIssues(originalTask, dependencyTaskById) : [];
        const milestonePassIssues =
          originalTask && displayStatus.actionLabel === "确认通过"
            ? getDependencyIssues(originalTask, dependencyTaskById, { assumeProgress: 100 })
            : [];
        const isDependencyPopoverOpen = Boolean(originalTask && dependencyPopover?.taskId === originalTask.id);
        const nameIndentStyle: CSSProperties = {
          paddingLeft: `${level * 16}px`,
        };

        return (
          <div
            key={`${task.id}-row`}
            className={rowClassName}
            style={{ height: rowHeight }}
            onClick={(event) => {
              event.stopPropagation();
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
                <span className={`milestone-status-badge milestone-status-badge--${displayStatus.variant}`}>
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
                  与“{issue.predecessorName}”存在 {issue.dependencyType} 依赖
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
                  <span>与“{issue.predecessorName}”存在依赖，{issue.description}。</span>
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

  return (
    <div style={containerStyle}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{task.name}</div>
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

function getLatestEnd(tasks: TaskRow[]) {
  if (tasks.length === 0) return null;
  return tasks.reduce<Date>((latest, task) => (task.end > latest ? task.end : latest), tasks[0].end);
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
  criticalPathError,
  selectedSummaryTaskId,
  localCriticalPathError,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onUpdateTask,
  onToggleExpand,
  onMoveTask,
  onToggleMilestonePassed,
  onSelectSummaryTask,
  onClearSelectedSummaryTask,
}: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const [showCriticalPath, setShowCriticalPath] = useState(true);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilterValue>("all");
  const [dependencyOverlay, setDependencyOverlay] = useState<DependencyOverlayLayout | null>(null);
  const [ganttWidth, setGanttWidth] = useState(0);
  const ganttContainerRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const viewConfig = useMemo(() => getViewConfig(viewMode), [viewMode]);
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
      const isCritical = showCriticalPath && task.isCritical && !isSummary;
      const isCriticalSummary = showCriticalPath && task.isCritical && isSummary;
      const isCriticalMilestone = isMilestone && isCritical;
      return {
        id: task.id,
        name: isMilestone ? "" : task.name,
        start: task.start,
        end: task.end,
        progress: task.progress,
        type: (isSummary ? "project" : task.type ?? "task") as GanttTask["type"],
        isDisabled: isSummary,
        styles: isSummary
          ? isCriticalSummary
            ? {
                backgroundColor: "#fee2e2",
                backgroundSelectedColor: "#fecaca",
                progressColor: "#f97316",
                progressSelectedColor: "#ea580c",
              }
            : {
                backgroundColor: "#d1fae5",
                backgroundSelectedColor: "#a7f3d0",
                progressColor: "#34d399",
                progressSelectedColor: "#10b981",
              }
          : isMilestone
            ? {
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                backgroundSelectedColor: "rgba(245, 158, 11, 0.12)",
                progressColor: isCriticalMilestone ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.08)",
                progressSelectedColor: isCriticalMilestone
                  ? "rgba(239, 68, 68, 0.12)"
                  : "rgba(245, 158, 11, 0.12)",
              }
          : isCritical
            ? {
                backgroundColor: "#fecaca",
                backgroundSelectedColor: "#fca5a5",
                progressColor: "#ef4444",
                progressSelectedColor: "#dc2626",
              }
            : undefined,
      };
    });

    const earliestStart = displayTasks.length > 0
      ? displayTasks.reduce<Date>((earliest, task) => (task.start < earliest ? task.start : earliest), displayTasks[0].start)
      : null;
    const latestEnd = getLatestEnd(displayTasks);
    const visibleTimelineWidth = Math.max(0, ganttWidth - TASK_LIST_WIDTH);

    if (!earliestStart || !latestEnd || visibleTimelineWidth <= 0) {
      return mappedTasks;
    }

    const rangeStart = getRangeStart(earliestStart, viewMode, viewConfig.preStepsCount);
    const generatedRangeEnd = getGeneratedRangeEnd(latestEnd, viewMode);
    const requiredRangeEnd = getRequiredRangeEnd(
      rangeStart,
      visibleTimelineWidth,
      viewConfig.columnWidth,
      viewMode
    );

    if (generatedRangeEnd >= requiredRangeEnd) {
      return mappedTasks;
    }

    return [
      ...mappedTasks,
      {
        id: RANGE_EXTENDER_TASK_ID,
        name: "",
        start: requiredRangeEnd,
        end: requiredRangeEnd,
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
  }, [displayTasks, ganttWidth, showCriticalPath, viewConfig.columnWidth, viewConfig.preStepsCount, viewMode]);

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
            progress: originalTask.progress,
            type: originalTask.hasChildren ? "project" : (originalTask.type ?? "task"),
          }}
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
        barRectById.set(
          task.id,
          (task.type ?? "task") === "milestone" ? getMilestoneOverlayRect(rawRect) : rawRect
        );
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
            d: buildDependencyPath(dependency, predecessorRect, currentRect),
            type: dependency.type,
            isCritical: Boolean(
              showCriticalPath && dependency.isCritical && task.isCritical && predecessorTask?.isCritical
            ),
            isLocalCritical: Boolean(
              showCriticalPath &&
                dependency.isLocalCritical &&
                task.isLocalCritical &&
                predecessorTask?.isLocalCritical
            ),
          });
        });
      });

      const localCriticalRects = showCriticalPath
        ? displayTasks.flatMap((task) => {
            if (!task.isLocalCritical) return [];
            if ((task.type ?? "task") === "milestone") return [];
            const rect = barRectById.get(task.id);
            return rect ? [rect] : [];
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
            isCritical: Boolean(showCriticalPath && task.isCritical),
            isLocalCritical: Boolean(showCriticalPath && task.isLocalCritical),
          },
        ];
      });

      if (paths.length === 0 && localCriticalRects.length === 0 && milestones.length === 0) {
        setDependencyOverlay(null);
        return;
      }

      setDependencyOverlay({
        left: viewportRect.left - wrapperRect.left,
        top: viewportRect.top - wrapperRect.top,
        width: viewportRect.width,
        height: viewportRect.height,
        paths,
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
  }, [displayTasks, taskById, viewMode, showCriticalPath]);

  const earliestStart = useMemo(() => {
    if (displayTasks.length === 0) return null;
    return displayTasks.reduce<Date>((earliest, task) => (task.start < earliest ? task.start : earliest), displayTasks[0].start);
  }, [displayTasks]);

  const viewDate = useMemo(() => getViewDate(earliestStart, viewMode), [earliestStart, viewMode]);

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
  ]);

  const handleDateChange = (updatedTask: GanttTask) => {
    const originalTask = taskById.get(updatedTask.id);
    if (!originalTask) return false;
    if (originalTask.hasChildren) return false;
    const isMilestone = (originalTask.type ?? "task") === "milestone";
    const nextStart = updatedTask.start;
    const nextEnd = isMilestone ? updatedTask.start : updatedTask.end;

    return onUpdateTask(originalTask.id, {
      name: originalTask.name,
      start: nextStart,
      end: nextEnd,
      progress: originalTask.progress,
    });
  };

  const handleTaskClick = (clickedTask: GanttTask) => {
    const originalTask = taskById.get(clickedTask.id);
    if (!originalTask?.hasChildren) return;
    onSelectSummaryTask(originalTask.id);
  };

  const handleTaskDoubleClick = (clickedTask: GanttTask) => {
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
    onClearSelectedSummaryTask();
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
          <GanttToolbar viewMode={viewMode} onChange={setViewMode} />
          <div className="gantt-toolbar-actions">
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
          className="gantt-chart-area"
          onWheel={handleWheel}
          onClick={handleChartAreaClick}
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
                    <path d="M 0 0 L 6 3 L 0 6 z" fill="#2563eb" />
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
                    <path d="M 0 0 L 6 3 L 0 6 z" fill="#dc2626" />
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
                    <path d="M 0 0 L 6 3 L 0 6 z" fill="#f97316" />
                  </marker>
                </defs>
                {dependencyOverlay.localCriticalRects.map((rect, index) => (
                  <rect
                    key={`local-critical-task-${index}`}
                    x={rect.x + 1}
                    y={rect.y + 1}
                    width={Math.max(0, rect.width - 2)}
                    height={Math.max(0, rect.height - 2)}
                    rx="6"
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
                {dependencyOverlay.paths.map((path) => (
                  <g key={path.key}>
                    <path
                      d={path.d}
                      className={[
                        "dependency-path",
                        `dependency-path--${path.type.toLowerCase()}`,
                        path.isCritical ? "dependency-path--critical" : "",
                        !path.isCritical && path.isLocalCritical ? "dependency-path--local-critical" : "",
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
                        className="dependency-path dependency-path--local-critical dependency-path--local-critical-offset"
                        markerEnd="url(#dependency-local-critical-arrow-head)"
                      />
                    )}
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
