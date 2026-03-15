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
    <div
      role="toolbar"
      aria-label="时间尺度"
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      {options.map((option) => {
        const isActive = option.mode === viewMode;
        return (
          <button
            key={option.mode}
            type="button"
            onClick={() => onChange(option.mode)}
            aria-pressed={isActive}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: isActive ? "1px solid #2563eb" : "1px solid #cbd5f5",
              background: isActive ? "#dbeafe" : "#ffffff",
              color: "#0f172a",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
