import type { DependencyConflict } from "../hooks/useTasks";

type TimeConflictDialogProps = {
  isOpen: boolean;
  conflict: DependencyConflict | null;
  conflictCount: number;
  onAutoSchedule: () => void;
  onCancel: () => void;
};

function formatDateYMD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTypeLabel(type: DependencyConflict["type"]) {
  if (type === "FS") return "完成→开始";
  if (type === "SS") return "开始→开始";
  return "完成→完成";
}

function getFieldLabel(field: DependencyConflict["field"]) {
  return field === "start" ? "开始时间" : "结束时间";
}

export function TimeConflictDialog({
  isOpen,
  conflict,
  conflictCount,
  onAutoSchedule,
  onCancel,
}: TimeConflictDialogProps) {
  if (!isOpen || !conflict) return null;

  return (
    <div className="time-conflict-overlay" role="dialog" aria-modal="true">
      <div className="time-conflict-dialog">
        <div className="time-conflict-title">检测到依赖冲突</div>
        <div className="time-conflict-body">
          任务“{conflict.taskName}”与前置任务“{conflict.dependencyTaskName}”的
          {getTypeLabel(conflict.type)}依赖不满足。
          <br />
          当前{getFieldLabel(conflict.field)}：{formatDateYMD(conflict.currentValue)}
          <br />
          依赖要求至少为：{formatDateYMD(conflict.requiredValue)}
          {conflictCount > 1 && <><br />当前共检测到 {conflictCount} 处依赖冲突。</>}
        </div>
        <div className="time-conflict-actions">
          <button type="button" className="time-conflict-button" onClick={onAutoSchedule}>
            自动调整后续任务（Auto Schedule）
          </button>
          <button
            type="button"
            className="time-conflict-button time-conflict-button--ghost"
            onClick={onCancel}
            autoFocus
          >
            取消本次修改（Cancel）
          </button>
        </div>
      </div>
    </div>
  );
}
