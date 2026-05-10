import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import {
  addDays,
  buildMonthCalendarDays,
  buildProjectCalendarEvents,
  buildWeekCalendarDays,
  endOfMonth,
  endOfWeek,
  formatCalendarDate,
  getLocalDayKey,
  groupCalendarEventsByDay,
  sortCalendarEvents,
  startOfMonth,
  startOfWeek,
  summarizeCalendarEvents,
  type CalendarEvent,
  type CalendarEventType,
  type CalendarTask,
} from "../services/calendarService";

export type ProjectCalendarProps = {
  tasks: CalendarTask[];
  onSelectTask: (taskId: string) => void;
};

type CalendarViewMode = "month" | "week";

type MorePopoverState = {
  dayKey: string;
  left: number;
  top: number;
};

type EventTooltipState = {
  event: CalendarEvent;
  left: number;
  top: number;
};

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const MONTH_VISIBLE_EVENT_COUNT = 3;
const CALENDAR_EVENT_FILTERS: Array<{ type: CalendarEventType; label: string }> = [
  { type: "plannedStart", label: "计划开始" },
  { type: "plannedEnd", label: "计划结束" },
  { type: "actualComplete", label: "实际完成" },
  { type: "milestone", label: "节点" },
];
const DEFAULT_VISIBLE_EVENT_TYPES: Record<CalendarEventType, boolean> = {
  plannedStart: false,
  plannedEnd: true,
  actualComplete: true,
  milestone: true,
};

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function getCalendarTitle(date: Date, mode: CalendarViewMode) {
  if (mode === "month") {
    return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
  }

  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);
  return `${formatCalendarDate(weekStart)} - ${formatCalendarDate(weekEnd)}`;
}

function getEventTypeLabel(event: CalendarEvent) {
  switch (event.type) {
    case "plannedStart":
      return "计划开始";
    case "plannedEnd":
      return "计划结束";
    case "actualComplete":
      return "实际完成";
    case "milestone":
      return "里程碑";
    default:
      return "事件";
  }
}

function CalendarEventButton({
  event,
  density = "compact",
  onSelectTask,
  onShowTooltip,
  onHideTooltip,
}: {
  event: CalendarEvent;
  density?: "compact" | "comfortable";
  onSelectTask: (taskId: string) => void;
  onShowTooltip: (event: CalendarEvent, left: number, top: number) => void;
  onHideTooltip: () => void;
}) {
  const shouldShowOverdue = event.isOverdue && event.type !== "plannedStart";
  const className = [
    "calendar-event",
    `calendar-event--${event.type}`,
    density === "comfortable" ? "calendar-event--comfortable" : "",
    shouldShowOverdue ? "calendar-event--overdue" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={() => onSelectTask(event.taskId)}
      onMouseEnter={(mouseEvent) => onShowTooltip(event, mouseEvent.clientX, mouseEvent.clientY)}
      onMouseMove={(mouseEvent) => onShowTooltip(event, mouseEvent.clientX, mouseEvent.clientY)}
      onMouseLeave={onHideTooltip}
      onFocus={(focusEvent) => {
        const rect = focusEvent.currentTarget.getBoundingClientRect();
        onShowTooltip(event, rect.left + rect.width / 2, rect.top);
      }}
      onBlur={onHideTooltip}
    >
      {event.type === "milestone" && <span className="calendar-event-diamond" aria-hidden="true" />}
      <span className="calendar-event-label">{event.label}</span>
      {event.isCritical && (
        <span className="calendar-event-critical" title="全局关键路径" aria-label="全局关键路径" />
      )}
    </button>
  );
}

export function ProjectCalendar({ tasks, onSelectTask }: ProjectCalendarProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [morePopover, setMorePopover] = useState<MorePopoverState | null>(null);
  const [eventTooltip, setEventTooltip] = useState<EventTooltipState | null>(null);
  const [visibleEventTypes, setVisibleEventTypes] = useState(DEFAULT_VISIBLE_EVENT_TYPES);
  const todayKey = getLocalDayKey(new Date());
  const allEvents = useMemo(() => sortCalendarEvents(buildProjectCalendarEvents(tasks)), [tasks]);
  const events = useMemo(
    () => allEvents.filter((event) => visibleEventTypes[event.type]),
    [allEvents, visibleEventTypes]
  );
  const eventsByDay = useMemo(() => groupCalendarEventsByDay(events), [events]);
  const days = useMemo(
    () => (viewMode === "month" ? buildMonthCalendarDays(cursorDate) : buildWeekCalendarDays(cursorDate)),
    [cursorDate, viewMode]
  );
  const rangeStart = viewMode === "month" ? startOfMonth(cursorDate) : startOfWeek(cursorDate);
  const rangeEnd = viewMode === "month" ? endOfMonth(cursorDate) : endOfWeek(cursorDate);
  const summary = useMemo(() => summarizeCalendarEvents(events, rangeStart, rangeEnd), [events, rangeEnd, rangeStart]);
  const periodLabel = viewMode === "month" ? "本月" : "本周";
  const popoverEvents = morePopover ? eventsByDay[morePopover.dayKey] ?? [] : [];

  useEffect(() => {
    setMorePopover(null);
    setEventTooltip(null);
  }, [tasks, viewMode, cursorDate]);

  useEffect(() => {
    if (!morePopover) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".calendar-more-popover") || target.closest(".calendar-more-button")) return;
      setMorePopover(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [morePopover]);

  const handlePrevious = () => {
    setCursorDate((current) => {
      if (viewMode === "month") {
        return new Date(current.getFullYear(), current.getMonth() - 1, 1);
      }
      return addDays(current, -7);
    });
  };

  const handleNext = () => {
    setCursorDate((current) => {
      if (viewMode === "month") {
        return new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }
      return addDays(current, 7);
    });
  };

  const handleToday = () => {
    setCursorDate(new Date());
  };

  const handleToggleEventType = (type: CalendarEventType) => {
    setVisibleEventTypes((current) => ({
      ...current,
      [type]: !current[type],
    }));
  };

  const handleShowEventTooltip = (event: CalendarEvent, left: number, top: number) => {
    setEventTooltip({
      event,
      left: Math.max(12, Math.min(left + 12, window.innerWidth - 284)),
      top: Math.max(12, Math.min(top + 14, window.innerHeight - 168)),
    });
  };

  const handleHideEventTooltip = () => {
    setEventTooltip(null);
  };

  const handleMoreClick = (event: MouseEvent<HTMLButtonElement>, dayKey: string) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMorePopover((current) =>
      current?.dayKey === dayKey
        ? null
        : {
            dayKey,
            left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)),
            top: Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 372)),
          }
    );
  };

  const renderMonthCell = (day: Date) => {
    const dayKey = getLocalDayKey(day);
    const dayEvents = eventsByDay[dayKey] ?? [];
    const visibleEvents = dayEvents.slice(0, MONTH_VISIBLE_EVENT_COUNT);
    const hiddenCount = Math.max(0, dayEvents.length - MONTH_VISIBLE_EVENT_COUNT);
    const isToday = dayKey === todayKey;
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const className = [
      "calendar-month-cell",
      !isSameMonth(day, cursorDate) ? "calendar-month-cell--muted" : "",
      isToday ? "calendar-month-cell--today" : "",
      isWeekend ? "calendar-month-cell--weekend" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={className} key={dayKey}>
        <div className="calendar-day-number">{day.getDate()}</div>
        <div className="calendar-event-list">
          {visibleEvents.map((event) => (
            <CalendarEventButton
              key={event.id}
              event={event}
              onSelectTask={onSelectTask}
              onShowTooltip={handleShowEventTooltip}
              onHideTooltip={handleHideEventTooltip}
            />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="calendar-more-button"
              onClick={(event) => handleMoreClick(event, dayKey)}
            >
              +{hiddenCount} 更多
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderWeekDay = (day: Date, index: number) => {
    const dayKey = getLocalDayKey(day);
    const dayEvents = eventsByDay[dayKey] ?? [];
    const isToday = dayKey === todayKey;
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const className = [
      "calendar-week-day",
      isToday ? "calendar-week-day--today" : "",
      isWeekend ? "calendar-week-day--weekend" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <section className={className} key={dayKey}>
        <div className="calendar-week-day-header">
          <span>{WEEKDAY_LABELS[index]}</span>
          <strong>{day.getMonth() + 1}/{day.getDate()}</strong>
        </div>
        <div className="calendar-week-events">
          {dayEvents.length > 0 ? (
            dayEvents.map((event) => (
              <CalendarEventButton
                key={event.id}
                event={event}
                density="comfortable"
                onSelectTask={onSelectTask}
                onShowTooltip={handleShowEventTooltip}
                onHideTooltip={handleHideEventTooltip}
              />
            ))
          ) : (
            <div className="calendar-empty-day">暂无</div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="project-calendar">
      <div className="calendar-page-header">
        <div>
          <h2>项目日历</h2>
          <p>按日期查看计划开始、计划结束、实际完成和里程碑节点。</p>
        </div>
        <div className="calendar-toolbar" aria-label="日历视图控制">
          <button type="button" className="calendar-nav-button" onClick={handlePrevious}>
            {viewMode === "month" ? "上一月" : "上一周"}
          </button>
          <button type="button" className="calendar-nav-button" onClick={handleToday}>
            今天
          </button>
          <button type="button" className="calendar-nav-button" onClick={handleNext}>
            {viewMode === "month" ? "下一月" : "下一周"}
          </button>
          <div className="calendar-view-switch" aria-label="日历模式">
            <button
              type="button"
              className={viewMode === "month" ? "calendar-view-button calendar-view-button--active" : "calendar-view-button"}
              onClick={() => setViewMode("month")}
            >
              月视图
            </button>
            <button
              type="button"
              className={viewMode === "week" ? "calendar-view-button calendar-view-button--active" : "calendar-view-button"}
              onClick={() => setViewMode("week")}
            >
              周视图
            </button>
          </div>
        </div>
      </div>

      <div className="calendar-summary-row">
        <div className="calendar-summary-card">
          <span>{periodLabel}计划开始</span>
          <strong>{summary.plannedStart}</strong>
        </div>
        <div className="calendar-summary-card">
          <span>{periodLabel}计划结束</span>
          <strong>{summary.plannedEnd}</strong>
        </div>
        <div className="calendar-summary-card">
          <span>{periodLabel}实际完成</span>
          <strong>{summary.actualComplete}</strong>
        </div>
        <div className="calendar-summary-card">
          <span>{periodLabel}节点</span>
          <strong>{summary.milestone}</strong>
        </div>
      </div>

      <section className="calendar-board">
        <div className="calendar-board-header">
          <h3>{getCalendarTitle(cursorDate, viewMode)}</h3>
          <div className="calendar-event-filter" aria-label="事件筛选">
            <span className="calendar-event-filter-title">事件筛选</span>
            {CALENDAR_EVENT_FILTERS.map((filter) => (
              <label className="calendar-event-filter-option" key={filter.type}>
                <input
                  type="checkbox"
                  checked={visibleEventTypes[filter.type]}
                  onChange={() => handleToggleEventType(filter.type)}
                />
                <i className={`calendar-legend-dot calendar-legend-dot--${filter.type}`} aria-hidden="true" />
                <span>{filter.label}</span>
              </label>
            ))}
          </div>
        </div>

        {viewMode === "month" ? (
          <div className="calendar-month-grid">
            {WEEKDAY_LABELS.map((label) => (
              <div className="calendar-weekday-header" key={label}>
                周{label}
              </div>
            ))}
            {days.map(renderMonthCell)}
          </div>
        ) : (
          <div className="calendar-week-grid">
            {days.map(renderWeekDay)}
          </div>
        )}
      </section>

      {morePopover && (
        <div
          className="calendar-more-popover"
          style={{ left: morePopover.left, top: morePopover.top }}
        >
          <div className="calendar-more-popover-header">
            <strong>{formatCalendarDate(popoverEvents[0]?.date ?? new Date())}</strong>
            <span>{popoverEvents.length} 条事件</span>
          </div>
          <div className="calendar-more-popover-list">
            {popoverEvents.map((event) => (
              <CalendarEventButton
                key={event.id}
                event={event}
                density="comfortable"
                onSelectTask={onSelectTask}
                onShowTooltip={handleShowEventTooltip}
                onHideTooltip={handleHideEventTooltip}
              />
            ))}
          </div>
        </div>
      )}

      {eventTooltip && (
        <div
          className="calendar-event-tooltip"
          style={{ left: eventTooltip.left, top: eventTooltip.top }}
          role="tooltip"
        >
          <div className="calendar-event-tooltip-title">{eventTooltip.event.taskName}</div>
          <div className="calendar-event-tooltip-meta">
            {getEventTypeLabel(eventTooltip.event)} · {formatCalendarDate(eventTooltip.event.date)}
          </div>
          <div className="calendar-event-tooltip-rules">
            {eventTooltip.event.isCritical && (
              <div className="calendar-event-tooltip-rule">
                <span className="calendar-event-tooltip-dot" aria-hidden="true" />
                <span>全局关键路径：该任务影响项目完成时间。</span>
              </div>
            )}
            {eventTooltip.event.isOverdue && eventTooltip.event.type !== "plannedStart" && (
              <div className="calendar-event-tooltip-rule">
                <span className="calendar-event-tooltip-rect" aria-hidden="true" />
                <span>任务延期：该任务已超过计划结束时间。</span>
              </div>
            )}
            {!eventTooltip.event.isCritical &&
              (!eventTooltip.event.isOverdue || eventTooltip.event.type === "plannedStart") && (
              <div className="calendar-event-tooltip-rule">
                <span>暂无风险标记。</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
