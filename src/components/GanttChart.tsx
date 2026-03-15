import { Gantt, Task as GanttTask, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import type { Task } from "../types/task";

export type GanttChartProps = {
  tasks: Task[];
};

export function GanttChart({ tasks }: GanttChartProps) {
  if (tasks.length === 0) {
    return <div className="gantt-empty">ÔÝÎÞÈÎÎñ</div>;
  }

  const ganttTasks: GanttTask[] = tasks.map((task) => ({
    id: task.id,
    name: task.name,
    start: task.start,
    end: task.end,
    progress: task.progress,
    type: "task",
  }));

  return (
    <div className="gantt-wrapper">
      <Gantt tasks={ganttTasks} viewMode={ViewMode.Day} />
    </div>
  );
}
