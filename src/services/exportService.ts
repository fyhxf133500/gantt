import type { Cell, Row, Workbook, Worksheet } from "exceljs";
import type { Task, TaskDependency } from "../types/task";

export type ExportTaskRow = Task & {
  level: number;
  hasChildren: boolean;
};

type ExportOptions = {
  projectName: string;
  tasks: ExportTaskRow[];
  statusDate?: Date;
};

type TimelineConfig = {
  start: Date;
  end: Date;
  dates: Date[];
};

type WeekTimelineConfig = {
  start: Date;
  end: Date;
  weeks: Date[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COMPACT_ROW_HEIGHT = 15;
const COLORS = {
  header: "FFEFF4FA",
  headerStrong: "FFD8E2EF",
  weekend: "FFF4F6F8",
  today: "FFFFF4CC",
  baseline: "FFB8C2CC",
  plan: "FF6366F1",
  summary: "FF6EA878",
  actual: "FF8B98A8",
  actualOverdue: "FFF2A3B3",
  milestone: "FFF59E0B",
  critical: "FFDC2626",
  white: "FFFFFFFF",
  border: "FFD9E2EC",
  taskOutline: "FF94A3B8",
  textMuted: "FF64748B",
};

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function utcDayStamp(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(startOfLocalDay(date), mondayOffset);
}

function getIsoWeekNumber(date: Date) {
  const target = startOfLocalDay(date);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
}

function isSameDay(a: Date, b: Date) {
  return utcDayStamp(a) === utcDayStamp(b);
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function formatDateYMD(date?: Date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonth(date: Date) {
  return `${date.getMonth() + 1}月`;
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "项目";
}

function getTaskTypeLabel(task: ExportTaskRow) {
  if (task.hasChildren) return "父任务";
  if ((task.type ?? "task") === "milestone") return "里程碑";
  return "普通任务";
}

function getStatusLabel(task: ExportTaskRow, statusDate = new Date()) {
  if ((task.type ?? "task") === "milestone") {
    if (task.milestoneStatus === "passed") return "已通过";
    return task.milestoneStatus === "ready" || utcDayStamp(statusDate) >= utcDayStamp(task.end)
      ? "待确认"
      : "未开始";
  }

  const status = task.scheduleStatus ?? "notStarted";
  if (status === "completed") return "已完成";
  if (status === "inProgress") return "进行中";
  if (status === "overdue") return "已延期";
  if (status === "atRisk") return "有风险";
  return "未开始";
}

function getMilestoneActualDate(task: ExportTaskRow) {
  if ((task.type ?? "task") !== "milestone" || task.milestoneStatus !== "passed") return undefined;
  if (task.actualEnd) return task.actualEnd;
  if (task.passedAt) return new Date(task.passedAt);
  return task.actualStart;
}

function getTaskActualStart(task: ExportTaskRow) {
  if ((task.type ?? "task") === "milestone") return getMilestoneActualDate(task);
  return task.actualStart;
}

function getTaskActualEnd(task: ExportTaskRow) {
  if ((task.type ?? "task") === "milestone") return getMilestoneActualDate(task);
  if (task.hasChildren && task.progress < 100) return undefined;
  return task.actualEnd;
}

function getActualDisplayEnd(task: ExportTaskRow, statusDate = new Date()) {
  const actualStart = getTaskActualStart(task);
  if (!actualStart) return undefined;
  const actualEnd = getTaskActualEnd(task);
  if (actualEnd) return actualEnd;
  if ((task.type ?? "task") === "milestone") return undefined;
  if (task.progress > 0 || task.hasChildren) return startOfLocalDay(statusDate);
  return undefined;
}

function isOverdue(task: ExportTaskRow, statusDate = new Date()) {
  if ((task.type ?? "task") !== "task") return false;
  return task.scheduleStatus === "overdue" || (task.progress < 100 && utcDayStamp(statusDate) > utcDayStamp(task.end));
}

function isBaselineDelayed(task: ExportTaskRow) {
  if (!task.baselineStart || !task.baselineEnd) return false;
  return utcDayStamp(task.start) > utcDayStamp(task.baselineStart) ||
    utcDayStamp(task.end) > utcDayStamp(task.baselineEnd);
}

function isActualOverdue(task: ExportTaskRow, statusDate = new Date()) {
  const actualStart = getTaskActualStart(task);
  const actualEnd = getTaskActualEnd(task);
  if (actualEnd) return utcDayStamp(actualEnd) > utcDayStamp(task.end);
  if (!actualStart) return false;
  return utcDayStamp(statusDate) > utcDayStamp(task.end);
}

function hasDependencyIssue(task: ExportTaskRow) {
  return Boolean(
    task.dependencyBlocked ||
      task.dependencyViolation ||
      task.dependencyActualViolation ||
      task.dependencyMissing
  );
}

function getIndentedTaskName(task: ExportTaskRow) {
  return `${"  ".repeat(Math.max(0, task.level))}${task.name}`;
}

function buildTaskMap(tasks: ExportTaskRow[]) {
  return new Map(tasks.map((task) => [task.id, task]));
}

function formatDependencies(task: ExportTaskRow, taskMap: Map<string, ExportTaskRow>) {
  return (task.dependencies ?? [])
    .map((dependency: TaskDependency) => {
      const predecessor = taskMap.get(dependency.taskId);
      const name = predecessor ? predecessor.name : `ID ${dependency.taskId}`;
      const lag = Number.isFinite(dependency.lag) ? `+${dependency.lag}天` : "";
      return `${dependency.type}:${name}${lag}`;
    })
    .join("；");
}

function collectTimelineDates(tasks: ExportTaskRow[], mode: "baseline" | "plan" | "combined", statusDate = new Date()) {
  const dates: Date[] = [];
  tasks.forEach((task) => {
    if (mode === "baseline" || mode === "combined") {
      if (task.baselineStart) dates.push(task.baselineStart);
      if (task.baselineEnd) dates.push(task.baselineEnd);
    }
    if (mode === "plan" || mode === "combined") {
      dates.push(task.start, task.end);
    }
    if (mode === "combined") {
      const actualStart = getTaskActualStart(task);
      const actualEnd = getActualDisplayEnd(task, statusDate);
      if (actualStart) dates.push(actualStart);
      if (actualEnd) dates.push(actualEnd);
    }
  });

  if (dates.length === 0) dates.push(statusDate);

  const minStamp = Math.min(...dates.map((date) => utcDayStamp(date)));
  const maxStamp = Math.max(...dates.map((date) => utcDayStamp(date)));
  const start = addDays(startOfLocalDay(new Date(minStamp)), -1);
  const end = addDays(startOfLocalDay(new Date(maxStamp)), 1);
  const result: Date[] = [];
  for (let cursor = start; utcDayStamp(cursor) <= utcDayStamp(end); cursor = addDays(cursor, 1)) {
    result.push(cursor);
  }
  return { start, end, dates: result };
}

function collectWeekTimeline(tasks: ExportTaskRow[], statusDate = new Date()) {
  const dates: Date[] = [];
  tasks.forEach((task) => {
    if (task.baselineStart) dates.push(task.baselineStart);
    if (task.baselineEnd) dates.push(task.baselineEnd);
    dates.push(task.start, task.end);
    const actualStart = getTaskActualStart(task);
    const actualEnd = getActualDisplayEnd(task, statusDate);
    if (actualStart) dates.push(actualStart);
    if (actualEnd) dates.push(actualEnd);
  });

  if (dates.length === 0) dates.push(statusDate);

  const minStamp = Math.min(...dates.map((date) => utcDayStamp(date)));
  const maxStamp = Math.max(...dates.map((date) => utcDayStamp(date)));
  const start = startOfLocalWeek(new Date(minStamp));
  const end = startOfLocalWeek(new Date(maxStamp));
  const weeks: Date[] = [];
  for (let cursor = start; utcDayStamp(cursor) <= utcDayStamp(end); cursor = addDays(cursor, 7)) {
    weeks.push(cursor);
  }
  return { start, end, weeks };
}

function getTimelineColumn(timeline: TimelineConfig, date: Date, leftColumnCount: number) {
  const offset = Math.round((utcDayStamp(date) - utcDayStamp(timeline.start)) / MS_PER_DAY);
  return leftColumnCount + 1 + offset;
}

function getWeekColumn(timeline: WeekTimelineConfig, date: Date, leftColumnCount: number) {
  const weekStart = startOfLocalWeek(date);
  const offset = Math.round((utcDayStamp(weekStart) - utcDayStamp(timeline.start)) / (7 * MS_PER_DAY));
  return leftColumnCount + 1 + offset;
}

function getBarColumns(timeline: TimelineConfig, start: Date, end: Date, leftColumnCount: number) {
  const startColumn = getTimelineColumn(timeline, start, leftColumnCount);
  const endColumn = getTimelineColumn(timeline, end, leftColumnCount);
  return {
    startColumn: Math.min(startColumn, endColumn),
    endColumn: Math.max(startColumn, endColumn),
  };
}

function setCellFill(cell: Cell, color: string) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: color },
  };
}

function setThinBorder(cell: Cell, color = COLORS.border) {
  cell.border = {
    top: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
  };
}

function setCriticalBorder(cell: Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.critical } },
    left: { style: "thin", color: { argb: COLORS.critical } },
    bottom: { style: "thin", color: { argb: COLORS.critical } },
    right: { style: "thin", color: { argb: COLORS.critical } },
  };
}

function setCriticalRangeOutline(
  worksheet: Worksheet,
  rowNumber: number,
  startColumn: number,
  endColumn: number
) {
  const criticalSide = { style: "thin" as const, color: { argb: COLORS.critical } };
  for (let column = startColumn; column <= endColumn; column += 1) {
    const cell = worksheet.getCell(rowNumber, column);
    const currentBorder = cell.border ?? {};
    cell.border = {
      ...currentBorder,
      top: criticalSide,
      bottom: criticalSide,
      left: column === startColumn ? criticalSide : currentBorder.left,
      right: column === endColumn ? criticalSide : currentBorder.right,
    };
  }
}

function shouldPreserveCriticalBorder(side?: Cell["border"]["top"]) {
  return side?.color && "argb" in side.color && side.color.argb === COLORS.critical;
}

function setTaskBlockOutline(
  worksheet: Worksheet,
  startRow: number,
  endRow: number,
  startColumn: number,
  endColumn: number
) {
  const outlineSide = { style: "thin" as const, color: { argb: COLORS.taskOutline } };
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const cell = worksheet.getCell(rowNumber, column);
      const currentBorder = cell.border ?? {};
      cell.border = {
        ...currentBorder,
        top: rowNumber === startRow && !shouldPreserveCriticalBorder(currentBorder.top)
          ? outlineSide
          : currentBorder.top,
        bottom: rowNumber === endRow && !shouldPreserveCriticalBorder(currentBorder.bottom)
          ? outlineSide
          : currentBorder.bottom,
        left: column === startColumn && !shouldPreserveCriticalBorder(currentBorder.left)
          ? outlineSide
          : currentBorder.left,
        right: column === endColumn && !shouldPreserveCriticalBorder(currentBorder.right)
          ? outlineSide
          : currentBorder.right,
      };
    }
  }
}

function styleHeaderRow(row: Row) {
  row.eachCell((cell) => {
    setCellFill(cell, COLORS.header);
    setThinBorder(cell);
    cell.font = { bold: true, color: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

function setupTimelineHeader(
  worksheet: Worksheet,
  timeline: TimelineConfig,
  leftHeaders: string[],
  leftColumnWidths: number[],
  statusDate = new Date()
) {
  const yearRow = worksheet.getRow(1);
  const monthRow = worksheet.getRow(2);
  const dayRow = worksheet.getRow(3);
  const leftColumnCount = leftHeaders.length;

  leftHeaders.forEach((header, index) => {
    const column = index + 1;
    worksheet.mergeCells(1, column, 3, column);
    const cell = worksheet.getCell(1, column);
    cell.value = header;
    worksheet.getColumn(column).width = leftColumnWidths[index] ?? 14;
  });

  const mergeSameValueRanges = (rowNumber: number, values: string[]) => {
    let rangeStartIndex = 0;
    while (rangeStartIndex < values.length) {
      let rangeEndIndex = rangeStartIndex;
      while (rangeEndIndex + 1 < values.length && values[rangeEndIndex + 1] === values[rangeStartIndex]) {
        rangeEndIndex += 1;
      }

      const startColumn = leftColumnCount + rangeStartIndex + 1;
      const endColumn = leftColumnCount + rangeEndIndex + 1;
      if (endColumn > startColumn) {
        worksheet.mergeCells(rowNumber, startColumn, rowNumber, endColumn);
      }
      worksheet.getCell(rowNumber, startColumn).value = values[rangeStartIndex];
      rangeStartIndex = rangeEndIndex + 1;
    }
  };

  mergeSameValueRanges(1, timeline.dates.map((date) => String(date.getFullYear())));
  mergeSameValueRanges(2, timeline.dates.map(formatMonth));

  timeline.dates.forEach((date, index) => {
    const column = leftColumnCount + index + 1;
    const yearCell = worksheet.getCell(1, column);
    const monthCell = worksheet.getCell(2, column);
    const dayCell = worksheet.getCell(3, column);
    dayCell.value = String(date.getDate());
    worksheet.getColumn(column).width = 4;
    if (isWeekend(date)) {
      setCellFill(yearCell, COLORS.weekend);
      setCellFill(monthCell, COLORS.weekend);
      setCellFill(dayCell, COLORS.weekend);
    }
    if (isSameDay(date, statusDate)) {
      setCellFill(yearCell, COLORS.today);
      setCellFill(monthCell, COLORS.today);
      setCellFill(dayCell, COLORS.today);
    }
  });

  styleHeaderRow(yearRow);
  styleHeaderRow(monthRow);
  styleHeaderRow(dayRow);
  worksheet.views = [{ state: "frozen", ySplit: 3, xSplit: leftColumnCount }];
}

function setupPptReportHeader(
  worksheet: Worksheet,
  timeline: WeekTimelineConfig,
  leftHeaders: string[],
  leftColumnWidths: number[],
  statusDate = new Date()
) {
  const monthRow = worksheet.getRow(1);
  const weekRow = worksheet.getRow(2);
  const leftColumnCount = leftHeaders.length;

  leftHeaders.forEach((header, index) => {
    const column = index + 1;
    worksheet.mergeCells(1, column, 2, column);
    monthRow.getCell(column).value = header;
    worksheet.getColumn(column).width = leftColumnWidths[index] ?? 14;
  });

  let monthStartIndex = 0;
  while (monthStartIndex < timeline.weeks.length) {
    const month = formatMonth(addDays(timeline.weeks[monthStartIndex], 3));
    let monthEndIndex = monthStartIndex;
    while (
      monthEndIndex + 1 < timeline.weeks.length &&
      formatMonth(addDays(timeline.weeks[monthEndIndex + 1], 3)) === month
    ) {
      monthEndIndex += 1;
    }

    const startColumn = leftColumnCount + monthStartIndex + 1;
    const endColumn = leftColumnCount + monthEndIndex + 1;
    if (endColumn > startColumn) {
      worksheet.mergeCells(1, startColumn, 1, endColumn);
    }
    worksheet.getCell(1, startColumn).value = month;
    monthStartIndex = monthEndIndex + 1;
  }

  timeline.weeks.forEach((weekStart, index) => {
    const column = leftColumnCount + index + 1;
    weekRow.getCell(column).value = `W${getIsoWeekNumber(weekStart)}`;
    worksheet.getColumn(column).width = 8;
  });

  styleHeaderRow(monthRow);
  styleHeaderRow(weekRow);
  timeline.weeks.forEach((weekStart, index) => {
    if (isSameDay(startOfLocalWeek(statusDate), weekStart)) {
      setCellFill(monthRow.getCell(leftColumnCount + index + 1), COLORS.today);
      setCellFill(weekRow.getCell(leftColumnCount + index + 1), COLORS.today);
    }
  });
  worksheet.views = [{ state: "frozen", ySplit: 2, xSplit: leftColumnCount }];
}

function styleWorksheetGrid(worksheet: Worksheet) {
  worksheet.eachRow((row) => {
    row.height = row.number <= 3 ? 22 : 24;
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (!cell.border) setThinBorder(cell);
      cell.alignment = { ...cell.alignment, vertical: "middle" };
    });
  });
}

function addTimelineBackground(
  worksheet: Worksheet,
  rowNumber: number,
  timeline: TimelineConfig,
  leftColumnCount: number,
  statusDate = new Date()
) {
  timeline.dates.forEach((date, index) => {
    const cell = worksheet.getCell(rowNumber, leftColumnCount + index + 1);
    if (isWeekend(date)) setCellFill(cell, COLORS.weekend);
    if (isSameDay(date, statusDate)) setCellFill(cell, COLORS.today);
  });
}

function addWeekTimelineBackground(
  worksheet: Worksheet,
  rowNumber: number,
  timeline: WeekTimelineConfig,
  leftColumnCount: number,
  statusDate = new Date()
) {
  const statusWeekStart = startOfLocalWeek(statusDate);
  timeline.weeks.forEach((weekStart, index) => {
    if (isSameDay(weekStart, statusWeekStart)) {
      setCellFill(worksheet.getCell(rowNumber, leftColumnCount + index + 1), COLORS.today);
    }
  });
}

function fillDateBar(
  worksheet: Worksheet,
  rowNumber: number,
  timeline: TimelineConfig,
  leftColumnCount: number,
  start: Date,
  end: Date,
  color: string,
  options?: { critical?: boolean; label?: string }
) {
  const { startColumn, endColumn } = getBarColumns(timeline, start, end, leftColumnCount);
  for (let column = startColumn; column <= endColumn; column += 1) {
    const cell = worksheet.getCell(rowNumber, column);
    setCellFill(cell, color);
  }
  if (options?.critical) setCriticalRangeOutline(worksheet, rowNumber, startColumn, endColumn);
  if (options?.label) {
    const cell = worksheet.getCell(rowNumber, startColumn);
    cell.value = options.label;
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
}

function fillWeekBar(
  worksheet: Worksheet,
  rowNumber: number,
  timeline: WeekTimelineConfig,
  leftColumnCount: number,
  start: Date,
  end: Date,
  color: string,
  options?: { critical?: boolean }
) {
  const rangeStart = utcDayStamp(start);
  const rangeEnd = utcDayStamp(end);
  const filledColumns: number[] = [];
  timeline.weeks.forEach((weekStart, index) => {
    const weekEnd = addDays(weekStart, 6);
    const intersects = rangeStart <= utcDayStamp(weekEnd) && rangeEnd >= utcDayStamp(weekStart);
    if (!intersects) return;
    const column = leftColumnCount + index + 1;
    const cell = worksheet.getCell(rowNumber, column);
    setCellFill(cell, color);
    filledColumns.push(column);
  });
  if (options?.critical && filledColumns.length > 0) {
    setCriticalRangeOutline(
      worksheet,
      rowNumber,
      Math.min(...filledColumns),
      Math.max(...filledColumns)
    );
  }
}

function addWeekBaselineMarker(
  worksheet: Worksheet,
  rowNumber: number,
  timeline: WeekTimelineConfig,
  leftColumnCount: number,
  start: Date,
  end: Date
) {
  const rangeStart = utcDayStamp(start);
  const rangeEnd = utcDayStamp(end);
  timeline.weeks.forEach((weekStart, index) => {
    const weekEnd = addDays(weekStart, 6);
    const intersects = rangeStart <= utcDayStamp(weekEnd) && rangeEnd >= utcDayStamp(weekStart);
    if (!intersects) return;
    const cell = worksheet.getCell(rowNumber, leftColumnCount + index + 1);
    cell.border = {
      ...cell.border,
      top: { style: "dashed", color: { argb: COLORS.baseline } },
    };
  });
}

function addTaskDataSheet(workbook: Workbook, tasks: ExportTaskRow[], statusDate = new Date()) {
  const worksheet = workbook.addWorksheet("任务数据");
  const taskMap = buildTaskMap(tasks);
  const headers = [
    "任务名称",
    "任务类型",
    "父任务",
    "层级",
    "计划开始",
    "计划结束",
    "基线开始",
    "基线结束",
    "实际开始",
    "实际完成",
    "进度",
    "状态",
    "是否里程碑",
    "是否全局关键路径",
    "依赖关系",
    "是否延期",
    "是否偏离基线",
    "是否实际超期",
    "是否依赖异常",
  ];
  worksheet.addRow(headers);
  styleHeaderRow(worksheet.getRow(1));

  tasks.forEach((task) => {
    const parent = task.parentId ? taskMap.get(task.parentId) : null;
    worksheet.addRow([
      getIndentedTaskName(task),
      getTaskTypeLabel(task),
      parent?.name ?? "",
      task.level,
      formatDateYMD(task.start),
      formatDateYMD(task.end),
      formatDateYMD(task.baselineStart),
      formatDateYMD(task.baselineEnd),
      formatDateYMD(getTaskActualStart(task)),
      formatDateYMD(getTaskActualEnd(task)),
      `${Math.round(task.progress)}%`,
      getStatusLabel(task, statusDate),
      (task.type ?? "task") === "milestone" ? "是" : "否",
      task.isCritical ? "是" : "否",
      formatDependencies(task, taskMap),
      isOverdue(task, statusDate) ? "是" : "否",
      isBaselineDelayed(task) ? "是" : "否",
      isActualOverdue(task, statusDate) ? "是" : "否",
      hasDependencyIssue(task) ? "是" : "否",
    ]);
  });

  const widths = [28, 12, 20, 8, 13, 13, 13, 13, 13, 13, 10, 12, 12, 16, 34, 10, 12, 12, 12];
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  worksheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  styleWorksheetGrid(worksheet);
}

function addBaselineSheet(workbook: Workbook, tasks: ExportTaskRow[], statusDate = new Date()) {
  const worksheet = workbook.addWorksheet("基线视图");
  const leftHeaders = ["任务名称", "基线开始", "基线结束", "状态"];
  const timeline = collectTimelineDates(tasks, "baseline", statusDate);
  setupTimelineHeader(worksheet, timeline, leftHeaders, [28, 13, 13, 12], statusDate);
  const leftColumnCount = leftHeaders.length;

  tasks.forEach((task, index) => {
    const rowNumber = index + 4;
    const row = worksheet.getRow(rowNumber);
    row.getCell(1).value = getIndentedTaskName(task);
    row.getCell(2).value = formatDateYMD(task.baselineStart);
    row.getCell(3).value = formatDateYMD(task.baselineEnd);
    row.getCell(4).value = task.baselineStart && task.baselineEnd ? getStatusLabel(task, statusDate) : "未纳入基线";
    addTimelineBackground(worksheet, rowNumber, timeline, leftColumnCount, statusDate);
    if (task.baselineStart && task.baselineEnd) {
      fillDateBar(worksheet, rowNumber, timeline, leftColumnCount, task.baselineStart, task.baselineEnd, COLORS.baseline);
    }
  });

  styleWorksheetGrid(worksheet);
  const endColumn = leftColumnCount + timeline.dates.length;
  tasks.forEach((_, index) => {
    const rowNumber = index + 4;
    setTaskBlockOutline(worksheet, rowNumber, rowNumber, 1, endColumn);
  });
}

function addPlanSheet(workbook: Workbook, tasks: ExportTaskRow[], statusDate = new Date()) {
  const worksheet = workbook.addWorksheet("计划视图");
  const leftHeaders = ["任务名称", "计划开始", "计划结束", "进度", "状态"];
  const timeline = collectTimelineDates(tasks, "plan", statusDate);
  setupTimelineHeader(worksheet, timeline, leftHeaders, [28, 13, 13, 10, 12], statusDate);
  const leftColumnCount = leftHeaders.length;

  tasks.forEach((task, index) => {
    const rowNumber = index + 4;
    const row = worksheet.getRow(rowNumber);
    row.getCell(1).value = getIndentedTaskName(task);
    row.getCell(2).value = formatDateYMD(task.start);
    row.getCell(3).value = formatDateYMD(task.end);
    row.getCell(4).value = `${Math.round(task.progress)}%`;
    row.getCell(5).value = getStatusLabel(task, statusDate);
    addTimelineBackground(worksheet, rowNumber, timeline, leftColumnCount, statusDate);

    if ((task.type ?? "task") === "milestone") {
      const column = getTimelineColumn(timeline, task.start, leftColumnCount);
      const cell = worksheet.getCell(rowNumber, column);
      cell.value = "◆";
      cell.font = { bold: true, color: { argb: task.isCritical ? COLORS.critical : COLORS.milestone } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      if (task.isCritical) setCriticalBorder(cell);
      return;
    }

    fillDateBar(
      worksheet,
      rowNumber,
      timeline,
      leftColumnCount,
      task.start,
      task.end,
      task.hasChildren ? COLORS.summary : COLORS.plan,
      { critical: task.isCritical, label: task.hasChildren ? "" : undefined }
    );
  });

  styleWorksheetGrid(worksheet);
  const endColumn = leftColumnCount + timeline.dates.length;
  tasks.forEach((_, index) => {
    const rowNumber = index + 4;
    setTaskBlockOutline(worksheet, rowNumber, rowNumber, 1, endColumn);
  });
}

function addCombinedSheet(workbook: Workbook, tasks: ExportTaskRow[], statusDate = new Date()) {
  const worksheet = workbook.addWorksheet("综合视图");
  const leftHeaders = ["任务名称", "基线", "计划", "实际", "进度", "状态"];
  const timeline = collectTimelineDates(tasks, "combined", statusDate);
  setupTimelineHeader(worksheet, timeline, leftHeaders, [28, 23, 23, 23, 10, 12], statusDate);
  const leftColumnCount = leftHeaders.length;

  tasks.forEach((task, taskIndex) => {
    const startRow = taskIndex * 3 + 4;
    const baselineRow = worksheet.getRow(startRow);
    const planRow = worksheet.getRow(startRow + 1);
    const actualRow = worksheet.getRow(startRow + 2);
    const rows = [baselineRow, planRow, actualRow];

    rows.forEach((row, index) => {
      row.getCell(1).value = index === 0 ? getIndentedTaskName(task) : "";
      row.getCell(2).value = index === 0 ? `${formatDateYMD(task.baselineStart)} ${task.baselineEnd ? `→ ${formatDateYMD(task.baselineEnd)}` : ""}`.trim() : "";
      row.getCell(3).value = index === 1 ? `${formatDateYMD(task.start)} → ${formatDateYMD(task.end)}` : "";
      const actualStart = getTaskActualStart(task);
      const actualEnd = getTaskActualEnd(task);
      row.getCell(4).value = index === 2
        ? actualStart
          ? `${formatDateYMD(actualStart)}${actualEnd ? ` → ${formatDateYMD(actualEnd)}` : " → 进行中"}`
          : "未记录"
        : "";
      row.getCell(5).value = index === 1 ? `${Math.round(task.progress)}%` : "";
      row.getCell(6).value = index === 1 ? getStatusLabel(task, statusDate) : "";
      addTimelineBackground(worksheet, row.number, timeline, leftColumnCount, statusDate);
    });

    if (task.baselineStart && task.baselineEnd) {
      fillDateBar(worksheet, baselineRow.number, timeline, leftColumnCount, task.baselineStart, task.baselineEnd, COLORS.baseline);
    }

    if ((task.type ?? "task") === "milestone") {
      const column = getTimelineColumn(timeline, task.start, leftColumnCount);
      const cell = worksheet.getCell(planRow.number, column);
      cell.value = "◆";
      cell.font = { bold: true, color: { argb: task.isCritical ? COLORS.critical : COLORS.milestone } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      if (task.isCritical) setCriticalBorder(cell);
    } else {
      fillDateBar(
        worksheet,
        planRow.number,
        timeline,
        leftColumnCount,
        task.start,
        task.end,
        task.hasChildren ? COLORS.summary : COLORS.plan,
        { critical: task.isCritical }
      );
    }

    const actualStart = getTaskActualStart(task);
    const actualEnd = getActualDisplayEnd(task, statusDate);
    if (actualStart && actualEnd) {
      const plannedEnd = task.end;
      const normalEnd = utcDayStamp(actualEnd) > utcDayStamp(plannedEnd) ? plannedEnd : actualEnd;
      fillDateBar(worksheet, actualRow.number, timeline, leftColumnCount, actualStart, normalEnd, COLORS.actual);
      if (utcDayStamp(actualEnd) > utcDayStamp(plannedEnd)) {
        fillDateBar(worksheet, actualRow.number, timeline, leftColumnCount, addDays(plannedEnd, 1), actualEnd, COLORS.actualOverdue);
      }
    }
  });

  styleWorksheetGrid(worksheet);
  for (let rowNumber = 4; rowNumber <= tasks.length * 3 + 3; rowNumber += 1) {
    worksheet.getRow(rowNumber).height = COMPACT_ROW_HEIGHT;
  }
  const endColumn = leftColumnCount + timeline.dates.length;
  tasks.forEach((_, taskIndex) => {
    const startRow = taskIndex * 3 + 4;
    setTaskBlockOutline(worksheet, startRow, startRow + 2, 1, endColumn);
  });
}

function addPptReportSheet(workbook: Workbook, tasks: ExportTaskRow[], statusDate = new Date()) {
  const worksheet = workbook.addWorksheet("PPT汇报视图");
  const leftHeaders = ["任务名称", "计划周期", "实际周期", "进度", "状态"];
  const timeline = collectWeekTimeline(tasks, statusDate);
  setupPptReportHeader(worksheet, timeline, leftHeaders, [28, 22, 22, 10, 12], statusDate);
  const leftColumnCount = leftHeaders.length;

  tasks.forEach((task, taskIndex) => {
    const startRow = taskIndex * 2 + 3;
    const planRow = worksheet.getRow(startRow);
    const actualRow = worksheet.getRow(startRow + 1);
    const actualStart = getTaskActualStart(task);
    const actualEnd = getTaskActualEnd(task);

    leftHeaders.forEach((_, index) => {
      worksheet.mergeCells(startRow, index + 1, startRow + 1, index + 1);
    });

    planRow.getCell(1).value = getIndentedTaskName(task);
    planRow.getCell(2).value = `${formatDateYMD(task.start)} → ${formatDateYMD(task.end)}`;
    planRow.getCell(3).value = actualStart
      ? `${formatDateYMD(actualStart)}${actualEnd ? ` → ${formatDateYMD(actualEnd)}` : " → 进行中"}`
      : "未记录";
    planRow.getCell(4).value = `${Math.round(task.progress)}%`;
    planRow.getCell(5).value = getStatusLabel(task, statusDate);

    if (task.hasChildren) {
      for (let column = 1; column <= leftColumnCount; column += 1) {
        planRow.getCell(column).font = { bold: true, color: { argb: "FF0F172A" } };
      }
    }

    addWeekTimelineBackground(worksheet, planRow.number, timeline, leftColumnCount, statusDate);
    addWeekTimelineBackground(worksheet, actualRow.number, timeline, leftColumnCount, statusDate);
  });

  styleWorksheetGrid(worksheet);
  worksheet.getRow(1).height = 24;
  worksheet.getRow(2).height = 22;
  for (let rowNumber = 3; rowNumber <= tasks.length * 2 + 2; rowNumber += 1) {
    worksheet.getRow(rowNumber).height = COMPACT_ROW_HEIGHT;
  }

  tasks.forEach((task, taskIndex) => {
    const planRowNumber = taskIndex * 2 + 3;
    const actualRowNumber = planRowNumber + 1;

    if (task.baselineStart && task.baselineEnd) {
      addWeekBaselineMarker(
        worksheet,
        planRowNumber,
        timeline,
        leftColumnCount,
        task.baselineStart,
        task.baselineEnd
      );
    }

    if ((task.type ?? "task") === "milestone") {
      const column = getWeekColumn(timeline, task.start, leftColumnCount);
      const cell = worksheet.getCell(planRowNumber, column);
      cell.value = "◆";
      cell.font = { bold: true, color: { argb: task.isCritical ? COLORS.critical : COLORS.milestone } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      if (task.isCritical) setCriticalBorder(cell);
    } else {
      fillWeekBar(
        worksheet,
        planRowNumber,
        timeline,
        leftColumnCount,
        task.start,
        task.end,
        task.hasChildren ? COLORS.summary : COLORS.plan,
        { critical: task.isCritical }
      );
    }

    const actualStart = getTaskActualStart(task);
    const actualEnd = getActualDisplayEnd(task, statusDate);
    if (!actualStart || !actualEnd) return;

    if ((task.type ?? "task") === "milestone") {
      const column = getWeekColumn(timeline, actualStart, leftColumnCount);
      const cell = worksheet.getCell(actualRowNumber, column);
      cell.value = "◆";
      cell.font = { bold: true, color: { argb: COLORS.actual } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      return;
    }

    const normalEnd = utcDayStamp(actualEnd) > utcDayStamp(task.end) ? task.end : actualEnd;
    fillWeekBar(worksheet, actualRowNumber, timeline, leftColumnCount, actualStart, normalEnd, COLORS.actual);
    if (utcDayStamp(actualEnd) > utcDayStamp(task.end)) {
      fillWeekBar(
        worksheet,
        actualRowNumber,
        timeline,
        leftColumnCount,
        addDays(task.end, 1),
        actualEnd,
        COLORS.actualOverdue
      );
    }
  });

  const endColumn = leftColumnCount + timeline.weeks.length;
  tasks.forEach((_, taskIndex) => {
    const startRow = taskIndex * 2 + 3;
    setTaskBlockOutline(worksheet, startRow, startRow + 1, 1, endColumn);
  });
}

export async function exportProjectGanttExcel({ projectName, tasks, statusDate = new Date() }: ExportOptions) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gantt Project Tool";
  workbook.created = new Date();
  workbook.modified = new Date();

  addTaskDataSheet(workbook, tasks, statusDate);
  addBaselineSheet(workbook, tasks, statusDate);
  addPlanSheet(workbook, tasks, statusDate);
  addCombinedSheet(workbook, tasks, statusDate);
  addPptReportSheet(workbook, tasks, statusDate);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${sanitizeFileName(projectName)}_甘特图_${formatDateYMD(statusDate).replace(/-/g, "")}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
