import type { Task } from "../types/task";

export const mockTasks: Task[] = [
  {
    id: "t1",
    name: "需求分析",
    start: new Date(2026, 2, 10),
    end: new Date(2026, 2, 12),
    progress: 100,
  },
  {
    id: "t2",
    name: "设计",
    start: new Date(2026, 2, 13),
    end: new Date(2026, 2, 15),
    progress: 60,
  },
  {
    id: "t3",
    name: "开发",
    start: new Date(2026, 2, 16),
    end: new Date(2026, 2, 24),
    progress: 30,
  },
];
