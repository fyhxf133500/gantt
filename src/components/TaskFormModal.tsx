import { useEffect, useMemo, useState } from "react";
import { hasInvalidDependencies } from "../hooks/useTasks";
import type { DependencyType, Task, TaskDependency } from "../types/task";

export type TaskFormData = {
  name: string;
  start: Date;
  end: Date;
  progress: number;
  parentId: string | null;
  type: NonNullable<Task["type"]>;
  dependencies: TaskDependency[];
};

type TaskFormModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  initialTask?: Task | null;
  tasks: Task[];
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

function buildChildrenMap(tasks: Task[]) {
  const map = new Map<string, string[]>();
  tasks.forEach((task) => {
    if (!task.parentId) return;
    const list = map.get(task.parentId) ?? [];
    list.push(task.id);
    map.set(task.parentId, list);
  });
  return map;
}

function collectDescendants(childrenMap: Map<string, string[]>, rootId: string) {
  const result = new Set<string>();
  const stack = [...(childrenMap.get(rootId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || result.has(current)) continue;
    result.add(current);
    const children = childrenMap.get(current) ?? [];
    stack.push(...children);
  }

  return result;
}

type DependencyDraft = {
  taskId: string;
  type: DependencyType;
};

const DEFAULT_DEPENDENCY_TYPE: DependencyType = "FS";
const DEPENDENCY_TYPE_OPTIONS: Array<{ value: DependencyType; label: string }> = [
  { value: "FS", label: "FS（完成→开始）" },
  { value: "SS", label: "SS（开始→开始）" },
  { value: "FF", label: "FF（完成→完成）" },
];

export function TaskFormModal({ isOpen, mode, initialTask, tasks, onClose, onSubmit }: TaskFormModalProps) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [progress, setProgress] = useState(0);
  const [parentId, setParentId] = useState("");
  const [taskType, setTaskType] = useState<NonNullable<Task["type"]>>("task");
  const [dependencyDrafts, setDependencyDrafts] = useState<DependencyDraft[]>([]);

  useEffect(() => {
    if (taskType === "milestone" && start && end !== start) {
      setEnd(start);
    }
  }, [end, start, taskType]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialTask) {
      setName(initialTask.name);
      setStart(toInputDate(initialTask.start));
      setEnd(toInputDate(initialTask.end));
      setProgress(initialTask.progress);
      setParentId(initialTask.parentId ?? "");
      setTaskType(initialTask.type ?? "task");
      setDependencyDrafts(
        (initialTask.dependencies ?? []).map((dependency) => ({
          taskId: dependency.taskId,
          type: dependency.type,
        }))
      );
      return;
    }

    const defaults = getDefaultDates();
    setName("");
    setStart(toInputDate(defaults.start));
    setEnd(toInputDate(defaults.end));
    setProgress(0);
    setParentId("");
    setTaskType("task");
    setDependencyDrafts([]);
  }, [isOpen, initialTask]);

  const disallowedParentIds = useMemo(() => {
    if (!initialTask) return new Set<string>();
    const childrenMap = buildChildrenMap(tasks);
    const descendants = collectDescendants(childrenMap, initialTask.id);
    return new Set([initialTask.id, ...descendants]);
  }, [tasks, initialTask]);

  const parentOptions = useMemo(
    () => tasks.filter((task) => !disallowedParentIds.has(task.id)),
    [tasks, disallowedParentIds]
  );

  const isParentWithChildren = useMemo(() => {
    if (!initialTask) return false;
    return tasks.some((task) => task.parentId === initialTask.id);
  }, [tasks, initialTask]);

  const parsedStart = useMemo(() => parseInputDate(start), [start]);
  const parsedEnd = useMemo(() => parseInputDate(end), [end]);
  const trimmedName = name.trim();
  const isMilestone = taskType === "milestone";
  const isDateRangeInvalid = !isMilestone && !!(parsedStart && parsedEnd && parsedStart > parsedEnd);
  const dependencyOptions = useMemo(
    () => tasks.filter((task) => task.id !== initialTask?.id),
    [tasks, initialTask]
  );
  const dependencies = useMemo(
    () =>
      dependencyDrafts
        .filter((dependency) => dependency.taskId)
        .map((dependency) => ({
          taskId: dependency.taskId,
          type: dependency.type,
        })),
    [dependencyDrafts]
  );
  const hasDuplicateDependencies = new Set(dependencies.map((dependency) => dependency.taskId)).size !== dependencies.length;
  const hasDependencyCycle = !!initialTask && hasInvalidDependencies(tasks, initialTask.id, dependencies);
  const dependencyError = hasDuplicateDependencies
    ? "同一个前置任务不能重复添加。"
    : hasDependencyCycle
      ? "当前依赖关系会形成循环依赖，请重新选择。"
      : null;
  const isSubmitDisabled =
    trimmedName.length === 0 || !parsedStart || !parsedEnd || isDateRangeInvalid || Boolean(dependencyError);

  if (!isOpen) return null;

  const title = mode === "edit" ? "编辑任务" : "新建任务";
  const submitLabel = mode === "edit" ? "保存修改" : "创建任务";
  const progressDisplay = Number.isFinite(progress) ? `${progress.toFixed(1)}%` : "0%";

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
              end: isMilestone ? parsedStart : parsedEnd,
              progress,
              parentId: parentId ? parentId : null,
              type: taskType,
              dependencies,
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
                onChange={(event) => {
                  setStart(event.target.value);
                  if (taskType === "milestone") {
                    setEnd(event.target.value);
                  }
                }}
                required
                disabled={isParentWithChildren}
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
                disabled={isParentWithChildren || isMilestone}
              />
            </label>
          </div>
          <label className="task-form-field">
            <span>当前进度 (%)</span>
            {isParentWithChildren ? (
              <div className="task-form-static">
                <span>{progressDisplay}</span>
                <span className="task-form-hint">由子任务自动计算</span>
              </div>
            ) : (
              <input
                className="task-form-input"
                type="number"
                min={0}
                max={100}
                step={1}
                value={progress}
                onChange={(event) => setProgress(Number(event.target.value))}
              />
            )}
          </label>
          <div className="task-form-row">
            <label className="task-form-field">
              <span>父任务</span>
              <select
                className="task-form-input"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">无</option>
                {parentOptions.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="task-form-field">
              <span>任务类型</span>
              <select
                className="task-form-input"
                value={taskType}
                onChange={(event) => {
                  const nextType = event.target.value as NonNullable<Task["type"]>;
                  setTaskType(nextType);
                  if (nextType === "milestone") {
                    setEnd(start);
                  }
                }}
              >
                <option value="task">普通任务</option>
                <option value="milestone">里程碑</option>
              </select>
            </label>
          </div>
          <div className="task-form-field">
            <div className="task-form-section-header">
              <span>依赖关系</span>
              <button
                type="button"
                className="secondary-button task-form-add-button"
                onClick={() =>
                  setDependencyDrafts((prev) => [...prev, { taskId: "", type: DEFAULT_DEPENDENCY_TYPE }])
                }
              >
                添加依赖
              </button>
            </div>
            {dependencyDrafts.length === 0 ? (
              <div className="task-form-empty">暂无依赖，任务将独立执行。</div>
            ) : (
              <div className="task-form-dependencies">
                {dependencyDrafts.map((dependency, index) => (
                  <div key={`${dependency.taskId}-${index}`} className="task-form-dependency-row">
                    <select
                      className="task-form-input"
                      value={dependency.taskId}
                      onChange={(event) =>
                        setDependencyDrafts((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, taskId: event.target.value } : item
                          )
                        )
                      }
                    >
                      <option value="">选择前置任务</option>
                      {dependencyOptions.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="task-form-input"
                      value={dependency.type}
                      onChange={(event) =>
                        setDependencyDrafts((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, type: event.target.value as DependencyType }
                              : item
                          )
                        )
                      }
                    >
                      {DEPENDENCY_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="task-action-button task-action-button--danger"
                      onClick={() => setDependencyDrafts((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {isParentWithChildren && (
            <p className="task-form-hint">父任务的起止时间由子任务自动汇总。</p>
          )}
          {isMilestone && (
            <p className="task-form-hint">里程碑为 0 工期节点，结束时间会自动同步为开始时间。</p>
          )}
          {isDateRangeInvalid && <p className="task-form-error">结束时间不能早于开始时间。</p>}
          {dependencyError && <p className="task-form-error">{dependencyError}</p>}
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
