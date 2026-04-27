import type { Task } from "./task";

export interface Project {
  id: string;
  name: string;
  tasks: Task[];
  isTemplate?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
