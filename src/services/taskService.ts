import type { Task } from "../types/task";
import { mockTasks } from "../data/mockTasks";

export async function getTasks(): Promise<Task[]> {
  return Promise.resolve(mockTasks);
}
