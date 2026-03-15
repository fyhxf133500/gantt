import { useMemo, useRef, useState } from "react";
import type { CSSProperties, WheelEvent, FC } from "react";
import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import type { Task } from "../types/task";
import { GanttToolbar } from "./GanttToolbar";

export type GanttChartProps = {
  tasks: Task[];
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
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
  taskById: Map<string, Task>;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
};

const HEADER_HEIGHT = 50;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HEADER_COLUMNS = ["任务名称", "开始时间", "结束时间", "操作"];
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

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
  onExpanderClick,
  taskById,
  onEditTask,
  onDeleteTask,
}: TaskListTableContentProps) {
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, DATE_FORMAT_OPTIONS), [locale]);

  return (
    <div className="task-list-table" style={{ fontFamily, fontSize }}>
      {tasks.map((task) => {
        let expanderSymbol = "";
        if (task.hideChildren === false) {
          expanderSymbol = "▼";
        } else if (task.hideChildren === true) {
          expanderSymbol = "▶";
        }

        const originalTask = taskById.get(task.id);
        const isSelected = selectedTaskId === task.id;
        const rowClassName = isSelected ? "task-list-row task-list-row--active" : "task-list-row";
        const cellStyle: CSSProperties = {
          minWidth: rowWidth,
          maxWidth: rowWidth,
        };

        return (
          <div
            key={`${task.id}-row`}
            className={rowClassName}
            style={{ height: rowHeight }}
            onClick={() => setSelectedTask(task.id)}
          >
            <div className="task-list-cell" style={cellStyle} title={task.name}>
              <div className="task-list-name-wrapper">
                <button
                  type="button"
                  className={expanderSymbol ? "task-list-expander" : "task-list-expander task-list-expander--empty"}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (expanderSymbol) {
                      onExpanderClick(task);
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

export function GanttChart({ tasks, onCreateTask, onEditTask, onDeleteTask }: GanttChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const ganttContainerRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);

  const ganttTasks = useMemo<GanttTask[]>(() => {
    return tasks.map((task) => ({
      id: task.id,
      name: task.name,
      start: task.start,
      end: task.end,
      progress: task.progress,
      type: "task",
    }));
  }, [tasks]);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

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
      />
    );
    return Table;
  }, [taskById, onEditTask, onDeleteTask]);

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
        <div style={{ marginTop: 12 }} onWheel={handleWheel} ref={ganttContainerRef}>
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
          />
        </div>
      )}
    </div>
  );
}
