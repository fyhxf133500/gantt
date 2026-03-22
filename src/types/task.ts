export interface Task {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  parentId?: string | null;
  dependencies?: string[];
  type?: "task" | "milestone";
  isExpanded?: boolean;
}
