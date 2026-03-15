import { useEffect, useMemo, useState } from "react";
import type { Task } from "../types/task";

export type TaskFormData = {
  name: string;
  start: Date;
  end: Date;
  progress: number;
};

type TaskFormModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  initialTask?: Task | null;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => void;
};

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseInputDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getDefaultDates() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function TaskFormModal({ isOpen, mode, initialTask, onClose, onSubmit }: TaskFormModalProps) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    if (initialTask) {
      setName(initialTask.name);
      setStart(toInputDate(initialTask.start));
      setEnd(toInputDate(initialTask.end));
      setProgress(initialTask.progress);
      return;
    }

    const defaults = getDefaultDates();
    setName("");
    setStart(toInputDate(defaults.start));
    setEnd(toInputDate(defaults.end));
    setProgress(0);
  }, [isOpen, initialTask]);

  const parsedStart = useMemo(() => parseInputDate(start), [start]);
  const parsedEnd = useMemo(() => parseInputDate(end), [end]);
  const trimmedName = name.trim();
  const isDateRangeInvalid = !!(parsedStart && parsedEnd && parsedStart > parsedEnd);
  const isSubmitDisabled = trimmedName.length === 0 || !parsedStart || !parsedEnd || isDateRangeInvalid;

  if (!isOpen) return null;

  const title = mode === "edit" ? "编辑任务" : "新建任务";
  const submitLabel = mode === "edit" ? "保存修改" : "创建任务";

  return (
    <div className="task-form-overlay" onClick={onClose}>
      <div
        className="task-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="task-form-header">
          <h2 className="task-form-title">{title}</h2>
          <button type="button" className="task-action-button" onClick={onClose}>
            关闭
          </button>
        </header>
        <form
          className="task-form-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (!parsedStart || !parsedEnd || isSubmitDisabled) return;
            onSubmit({
              name: trimmedName,
              start: parsedStart,
              end: parsedEnd,
              progress,
            });
          }}
        >
          <label className="task-form-field">
            <span>任务名称</span>
            <input
              className="task-form-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="请输入任务名称"
              required
            />
          </label>
          <div className="task-form-row">
            <label className="task-form-field">
              <span>开始时间</span>
              <input
                className="task-form-input"
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </label>
            <label className="task-form-field">
              <span>结束时间</span>
              <input
                className="task-form-input"
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </label>
          </div>
          <label className="task-form-field">
            <span>当前进度 (%)</span>
            <input
              className="task-form-input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={progress}
              onChange={(event) => setProgress(Number(event.target.value))}
            />
          </label>
          {isDateRangeInvalid && <p className="task-form-error">结束时间不能早于开始时间。</p>}
          <div className="task-form-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitDisabled}>
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
