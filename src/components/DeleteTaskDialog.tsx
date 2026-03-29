import type { Task } from "../types/task";

export type DeleteTaskDialogProps = {
  isOpen: boolean;
  task: Task | null;
  onDeleteAll: () => void;
  onPromote: () => void;
  onCancel: () => void;
};

export function DeleteTaskDialog({ isOpen, task, onDeleteAll, onPromote, onCancel }: DeleteTaskDialogProps) {
  if (!isOpen || !task) return null;

  return (
    <div className="delete-dialog-overlay" role="dialog" aria-modal="true">
      <div className="delete-dialog">
        <div className="delete-dialog-title">删除父任务</div>
        <div className="delete-dialog-body">
          删除“{task.name}”将影响其子任务，请选择处理方式：
        </div>
        <div className="delete-dialog-actions">
          <button type="button" className="delete-dialog-button delete-dialog-button--danger" onClick={onDeleteAll}>
            删除父任务及子任务
          </button>
          <button type="button" className="delete-dialog-button" onClick={onPromote}>
            仅删除父任务（子任务提升为顶级）
          </button>
          <button type="button" className="delete-dialog-button delete-dialog-button--ghost" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}