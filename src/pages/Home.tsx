import { GanttChart } from "../components/GanttChart";
import { useTasks } from "../hooks/useTasks";

export function Home() {
  const { tasks } = useTasks();

  return (
    <div className="page">
      <h1 className="page-title">Gantt Task Manager</h1>
      <GanttChart tasks={tasks} />
    </div>
  );
}
