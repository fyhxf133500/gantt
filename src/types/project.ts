import type { Task } from "./task";

export interface Project {
  id: string;
  name: string;
  tasks: Task[];
  createdAt?: string;
  updatedAt?: string;
}
