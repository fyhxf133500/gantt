import { useState } from "react";
import type { Task } from "../types/task";
import { mockTasks } from "../data/mockTasks";

export function useTasks() {
  const [tasks] = useState<Task[]>(() => mockTasks);

  return { tasks };
}
