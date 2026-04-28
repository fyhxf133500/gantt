export type DependencyType = "FS" | "SS" | "FF";
export type MilestoneStatus = "pending" | "ready" | "passed";
export type ScheduleStatus = "notStarted" | "inProgress" | "completed" | "overdue" | "atRisk";

export interface TaskDependency {
  taskId: string;
  type: DependencyType;
  lag?: number;
  isCritical?: boolean;
  isLocalCritical?: boolean;
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
  milestoneStatus?: MilestoneStatus;
  passedAt?: string;
  isExpanded?: boolean;
  isCritical?: boolean;
  isLocalCritical?: boolean;
  scheduleStatus?: ScheduleStatus;
  dependencyBlocked?: boolean;
  dependencyViolation?: boolean;
  isMilestoneOverdue?: boolean;
}
