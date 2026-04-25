export type DependencyType = "FS" | "SS" | "FF";

export interface TaskDependency {
  taskId: string;
  type: DependencyType;
}

export interface Task {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  parentId?: string | null;
  dependencies?: TaskDependency[];
  type?: "task" | "milestone";
  isExpanded?: boolean;
}
