import { ViewMode } from "gantt-task-react";

export type GanttToolbarProps = {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

const options: Array<{ label: string; mode: ViewMode }> = [
  { label: "月", mode: ViewMode.Month },
  { label: "周", mode: ViewMode.Week },
  { label: "日", mode: ViewMode.Day },
];

export function GanttToolbar({ viewMode, onChange }: GanttToolbarProps) {
  return (
    <div className="view-mode-toggle" role="toolbar" aria-label="时间尺度">
      {options.map((option) => {
        const isActive = option.mode === viewMode;
        return (
          <button
            key={option.mode}
            type="button"
            onClick={() => onChange(option.mode)}
            aria-pressed={isActive}
            className={isActive ? "view-mode-button view-mode-button--active" : "view-mode-button"}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
