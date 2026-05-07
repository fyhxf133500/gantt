import { ViewMode } from "gantt-task-react";

export type GanttDisplayMode = "simple" | "analysis";

export type GanttToolbarProps = {
  viewMode: ViewMode;
  displayMode: GanttDisplayMode;
  onChange: (mode: ViewMode) => void;
  onDisplayModeChange: (mode: GanttDisplayMode) => void;
};

const options: Array<{ label: string; mode: ViewMode }> = [
  { label: "月", mode: ViewMode.Month },
  { label: "周", mode: ViewMode.Week },
  { label: "日", mode: ViewMode.Day },
];

const displayOptions: Array<{ label: string; mode: GanttDisplayMode }> = [
  { label: "简洁", mode: "simple" },
  { label: "分析", mode: "analysis" },
];

export function GanttToolbar({ viewMode, displayMode, onChange, onDisplayModeChange }: GanttToolbarProps) {
  return (
    <div className="gantt-toolbar-mode-group" aria-label="视图和时间尺度">
      <div className="view-mode-toggle" role="toolbar" aria-label="视图模式">
        {displayOptions.map((option) => {
          const isActive = option.mode === displayMode;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => onDisplayModeChange(option.mode)}
              aria-pressed={isActive}
              className={isActive ? "view-mode-button view-mode-button--active" : "view-mode-button"}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="view-mode-toggle view-mode-toggle--scale" role="toolbar" aria-label="时间尺度">
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
    </div>
  );
}
