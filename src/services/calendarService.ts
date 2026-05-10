import type { Task } from "../types/task";

export type CalendarTask = Task & {
  hasChildren?: boolean;
  level?: number;
};

export type CalendarEventType = "plannedStart" | "plannedEnd" | "actualComplete" | "milestone";

export type CalendarEvent = {
  id: string;
  taskId: string;
  taskName: string;
  taskTypeLabel: string;
  date: Date;
  type: CalendarEventType;
  label: string;
  isCritical: boolean;
  isOverdue: boolean;
  level: number;
};

export type CalendarEventSummary = {
  plannedStart: number;
  plannedEnd: number;
  actualComplete: number;
  milestone: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getLocalDayKey(date: Date) {
  const localDate = startOfLocalDay(date);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const day = String(localDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatCalendarDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export function addDays(date: Date, days: number) {
  const nextDate = startOfLocalDay(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function startOfWeek(date: Date) {
  const localDate = startOfLocalDay(date);
  const day = localDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(localDate, mondayOffset);
}

export function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function buildMonthCalendarDays(date: Date) {
  const firstGridDay = startOfWeek(startOfMonth(date));
  const lastGridDay = endOfWeek(endOfMonth(date));
  const dayCount = Math.round((lastGridDay.getTime() - firstGridDay.getTime()) / MS_PER_DAY) + 1;

  return Array.from({ length: dayCount }, (_, index) => addDays(firstGridDay, index));
}

export function buildWeekCalendarDays(date: Date) {
  const firstDay = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(firstDay, index));
}

function getTaskTypeLabel(task: CalendarTask) {
  if (task.hasChildren) return "父任务";
  if ((task.type ?? "task") === "milestone") return "节点";
  return "任务";
}

function getMilestoneActualDate(task: CalendarTask) {
  if ((task.type ?? "task") !== "milestone" || task.milestoneStatus !== "passed") return undefined;
  if (task.actualEnd) return task.actualEnd;
  if (task.passedAt) return new Date(task.passedAt);
  return task.actualStart;
}

function isTaskOverdue(task: CalendarTask, date = new Date()) {
  if ((task.type ?? "task") === "milestone") return task.isMilestoneOverdue === true;
  if (task.scheduleStatus === "completed") return false;
  return task.scheduleStatus === "overdue" || startOfLocalDay(date).getTime() > startOfLocalDay(task.end).getTime();
}

function makeEvent(task: CalendarTask, type: CalendarEventType, date: Date, labelPrefix: string): CalendarEvent {
  return {
    id: `${task.id}-${type}-${getLocalDayKey(date)}`,
    taskId: task.id,
    taskName: task.name,
    taskTypeLabel: getTaskTypeLabel(task),
    date: startOfLocalDay(date),
    type,
    label: `${labelPrefix}：${task.name}`,
    isCritical: task.isCritical === true,
    isOverdue: isTaskOverdue(task),
    level: task.level ?? 0,
  };
}

export function buildProjectCalendarEvents(tasks: CalendarTask[]) {
  return tasks.flatMap<CalendarEvent>((task) => {
    const taskType = task.type ?? "task";
    const events: CalendarEvent[] = [];

    if (taskType === "milestone") {
      events.push(makeEvent(task, "milestone", task.start, "节点"));
    } else {
      events.push(makeEvent(task, "plannedStart", task.start, "开始"));
      events.push(makeEvent(task, "plannedEnd", task.end, "结束"));
    }

    const actualCompleteDate = taskType === "milestone" ? getMilestoneActualDate(task) : task.actualEnd;
    if (actualCompleteDate) {
      events.push(makeEvent(task, "actualComplete", actualCompleteDate, "完成"));
    }

    return events;
  });
}

export function groupCalendarEventsByDay(events: CalendarEvent[]) {
  return events.reduce<Record<string, CalendarEvent[]>>((groups, event) => {
    const key = getLocalDayKey(event.date);
    const dayEvents = groups[key] ?? [];
    dayEvents.push(event);
    groups[key] = dayEvents;
    return groups;
  }, {});
}

export function sortCalendarEvents(events: CalendarEvent[]) {
  const order: Record<CalendarEventType, number> = {
    milestone: 0,
    plannedStart: 1,
    plannedEnd: 2,
    actualComplete: 3,
  };

  return [...events].sort((a, b) => {
    if (a.date.getTime() !== b.date.getTime()) return a.date.getTime() - b.date.getTime();
    if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
    return a.taskName.localeCompare(b.taskName, "zh-CN");
  });
}

export function summarizeCalendarEvents(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): CalendarEventSummary {
  const startTime = startOfLocalDay(rangeStart).getTime();
  const endTime = startOfLocalDay(rangeEnd).getTime();

  return events.reduce<CalendarEventSummary>(
    (summary, event) => {
      const eventTime = startOfLocalDay(event.date).getTime();
      if (eventTime < startTime || eventTime > endTime) return summary;
      summary[event.type] += 1;
      return summary;
    },
    {
      plannedStart: 0,
      plannedEnd: 0,
      actualComplete: 0,
      milestone: 0,
    }
  );
}
