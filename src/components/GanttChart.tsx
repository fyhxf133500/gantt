import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, WheelEvent, FC } from "react";
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import type { Task, TaskDependency } from "../types/task";
import { GanttToolbar } from "./GanttToolbar";

export type GanttChartProps = {
  tasks: TaskRow[];
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onUpdateTask: (id: string, input: TaskUpdateInput) => boolean;
  onToggleExpand: (id: string) => void;
  onMoveTask: (id: string, parentId: string | null, options?: MoveTaskOptions) => void;
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
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onToggleExpand: (id: string) => void;
  onMoveTask: (id: string, parentId: string | null, options?: MoveTaskOptions) => void;
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
};

type DependencyOverlayLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  paths: DependencyPath[];
};

type OverlayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const HEADER_HEIGHT = 50;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HEADER_COLUMNS = ["任务名称", "开始时间", "结束时间", "操作"];
const DEPENDENCY_INDENT = 18;
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

function formatDateYMD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDurationDays(start: Date, end: Date) {
  const diff = Math.floor((utcDayStamp(end) - utcDayStamp(start)) / MS_PER_DAY);
  return Math.max(0, diff + 1);
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
  const cellStyle: CSSProperties = {
    minWidth: rowWidth,
    padding: "0 8px",
    display: "flex",
    alignItems: "center",
    height: "100%",
  };
  const separatorStyle: CSSProperties = {
    width: 1,
    height: headerHeight * 0.5,
    marginTop: headerHeight * 0.2,
    background: "#e2e8f0",
  };

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
            <div style={cellStyle}>{label}</div>
            {index < HEADER_COLUMNS.length - 1 && <div style={separatorStyle} />}
          </div>
        ))}
      </div>
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
  onExpanderClick: _onExpanderClick,
  taskById,
  onEditTask,
  onDeleteTask,
  onToggleExpand,
  onMoveTask,
}: TaskListTableContentProps) {
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, DATE_FORMAT_OPTIONS), [locale]);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "inside" | null>(null);

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
      {tasks.map((task) => {
        const originalTask = taskById.get(task.id);
        const level = originalTask?.level ?? 0;
        const hasChildren = originalTask?.hasChildren ?? false;
        const isExpanded = originalTask?.isExpanded !== false;
        const expanderSymbol = hasChildren ? (isExpanded ? "▼" : "▶") : "";

        const isSelected = selectedTaskId === task.id;
        const isDropTarget = Boolean(draggingTaskId && dropTargetId === task.id);
        const isDropInside = isDropTarget && dropPosition === "inside";
        const isDropBefore = isDropTarget && dropPosition === "before";
        const isDropAfter = isDropTarget && dropPosition === "after";
        const isDraggingRow = draggingTaskId === task.id;
        const rowClassName = [
          "task-list-row",
          isSelected ? "task-list-row--active" : "",
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
        const nameIndentStyle: CSSProperties = {
          paddingLeft: `${level * 16}px`,
        };

        return (
          <div
            key={`${task.id}-row`}
            className={rowClassName}
            style={{ height: rowHeight }}
            onClick={() => setSelectedTask(task.id)}
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
            <div className="task-list-cell" style={cellStyle} title={task.name}>
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
                <span className="task-list-name">{task.name}</span>
              </div>
            </div>
            <div className="task-list-cell" style={cellStyle}>
              {dateFormatter.format(task.start)}
            </div>
            <div className="task-list-cell" style={cellStyle}>
              {dateFormatter.format(task.end)}
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
  const durationDays = getDurationDays(task.start, task.end);
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

function utcDayStamp(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function mondayStamp(date: Date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + diff);
}

function getViewConfig(mode: ViewMode, earliestStart: Date | null) {
  if (!earliestStart) {
    if (mode === ViewMode.Month) return { columnWidth: 160, preStepsCount: 0 };
    if (mode === ViewMode.Week) return { columnWidth: 120, preStepsCount: 0 };
    return { columnWidth: 70, preStepsCount: 0 };
  }

  const yearStart = new Date(earliestStart.getFullYear(), 0, 1);
  const dayDiff = Math.max(0, Math.floor((utcDayStamp(earliestStart) - utcDayStamp(yearStart)) / MS_PER_DAY));
  const weekDiff = Math.max(0, Math.floor((mondayStamp(earliestStart) - mondayStamp(yearStart)) / (7 * MS_PER_DAY)));

  if (mode === ViewMode.Month) {
    return { columnWidth: 160, preStepsCount: earliestStart.getMonth() };
  }
  if (mode === ViewMode.Week) {
    return { columnWidth: 120, preStepsCount: weekDiff };
  }
  return { columnWidth: 70, preStepsCount: dayDiff };
}

function getViewDate(earliestStart: Date | null, mode: ViewMode) {
  if (!earliestStart) return undefined;
  const offset = mode === ViewMode.Month ? 0 : mode === ViewMode.Week ? 1 : 2;
  return new Date(earliestStart.getTime() + offset);
}

export function GanttChart({
  tasks,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onUpdateTask,
  onToggleExpand,
  onMoveTask,
}: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const [dependencyOverlay, setDependencyOverlay] = useState<DependencyOverlayLayout | null>(null);
  const ganttContainerRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);

  const ganttTasks = useMemo<GanttTask[]>(() => {
    return tasks.map((task) => {
      const isSummary = task.hasChildren;
      return {
        id: task.id,
        name: task.name,
        start: task.start,
        end: task.end,
        progress: task.progress,
        type: isSummary ? "project" : task.type ?? "task",
        isDisabled: isSummary,
        styles: isSummary
          ? {
              backgroundColor: "#d1fae5",
              backgroundSelectedColor: "#a7f3d0",
              progressColor: "#34d399",
              progressSelectedColor: "#10b981",
            }
          : undefined,
      };
    });
  }, [tasks]);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

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

      tasks.forEach((task, index) => {
        const element = barElements[index];
        if (!element) return;
        const rect = element.getBoundingClientRect();
        barRectById.set(task.id, {
          x: rect.left - viewportRect.left,
          y: rect.top - viewportRect.top,
          width: rect.width,
          height: rect.height,
        });
      });

      const paths: DependencyPath[] = [];
      tasks.forEach((task) => {
        (task.dependencies ?? []).forEach((dependency, dependencyIndex) => {
          const predecessorRect = barRectById.get(dependency.taskId);
          const currentRect = barRectById.get(task.id);
          if (!predecessorRect || !currentRect) return;

          paths.push({
            key: `${task.id}-${dependency.taskId}-${dependency.type}-${dependencyIndex}`,
            d: buildDependencyPath(dependency, predecessorRect, currentRect),
            type: dependency.type,
          });
        });
      });

      if (paths.length === 0) {
        setDependencyOverlay(null);
        return;
      }

      setDependencyOverlay({
        left: viewportRect.left - wrapperRect.left,
        top: viewportRect.top - wrapperRect.top,
        width: viewportRect.width,
        height: viewportRect.height,
        paths,
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
  }, [tasks, viewMode]);

  const earliestStart = useMemo(() => {
    if (tasks.length === 0) return null;
    return tasks.reduce<Date>((earliest, task) => (task.start < earliest ? task.start : earliest), tasks[0].start);
  }, [tasks]);

  const viewConfig = useMemo(() => getViewConfig(viewMode, earliestStart), [viewMode, earliestStart]);
  const viewDate = useMemo(() => getViewDate(earliestStart, viewMode), [earliestStart, viewMode]);

  const TaskListTable = useMemo(() => {
    const Table: FC<TaskListTableBaseProps> = (props) => (
      <TaskListTableContent
        {...props}
        taskById={taskById}
        onEditTask={onEditTask}
        onDeleteTask={onDeleteTask}
        onToggleExpand={onToggleExpand}
        onMoveTask={onMoveTask}
      />
    );
    return Table;
  }, [taskById, onEditTask, onDeleteTask, onToggleExpand, onMoveTask]);

  const handleDateChange = (updatedTask: GanttTask) => {
    const originalTask = taskById.get(updatedTask.id);
    if (!originalTask) return false;
    if (originalTask.hasChildren) return false;

    return onUpdateTask(originalTask.id, {
      name: originalTask.name,
      start: updatedTask.start,
      end: updatedTask.end,
      progress: originalTask.progress,
    });
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

  return (
    <div className="gantt-wrapper">
      <div className="gantt-toolbar">
        <GanttToolbar viewMode={viewMode} onChange={setViewMode} />
        <button type="button" className="primary-button" onClick={onCreateTask}>
          + 新建任务
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="gantt-empty" style={{ marginTop: 12 }}>
          暂无任务
        </div>
      ) : (
        <div className="gantt-chart-area" style={{ marginTop: 12 }} onWheel={handleWheel} ref={ganttContainerRef}>
          <Gantt
            tasks={ganttTasks}
            viewMode={viewMode}
            viewDate={viewDate}
            locale="zh-CN"
            headerHeight={HEADER_HEIGHT}
            columnWidth={viewConfig.columnWidth}
            preStepsCount={viewConfig.preStepsCount}
            TaskListHeader={TaskListHeader}
            TaskListTable={TaskListTable}
            TooltipContent={TooltipContent}
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
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb" />
                  </marker>
                </defs>
                {dependencyOverlay.paths.map((path) => (
                  <path
                    key={path.key}
                    d={path.d}
                    className={`dependency-path dependency-path--${path.type.toLowerCase()}`}
                    markerEnd="url(#dependency-arrow-head)"
                  />
                ))}
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
