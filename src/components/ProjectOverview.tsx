import { useEffect, useState } from "react";
import type {
  PlanExecutionCategory,
  ProjectOverview as ProjectOverviewData,
  ProjectRiskCategory,
  ProjectRiskItem,
  TaskStatusCategory,
} from "../services/projectOverviewService";

type ProjectOverviewProps = {
  overview: ProjectOverviewData;
  onSelectTask: (taskId: string) => void;
};

type MetricCard = {
  key: string;
  label: string;
  value: number;
  variant?: "neutral" | "blue" | "green" | "red" | "amber" | "critical";
};

type RiskSectionDefinition = {
  key: ProjectRiskCategory;
  title: string;
};

const RISK_SECTIONS: RiskSectionDefinition[] = [
  { key: "overdue", title: "已延期任务" },
  { key: "dependencyIssue", title: "依赖异常任务" },
  { key: "readyMilestone", title: "待确认节点" },
  { key: "globalCritical", title: "全局关键任务" },
];

type ChartDatum = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type ChartSelection = {
  chart: "status" | "execution";
  key: TaskStatusCategory | PlanExecutionCategory;
} | null;

function getPercentLabel(value: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function ChartTaskDetails({
  title,
  items,
  onSelectTask,
}: {
  title: string;
  items: ProjectRiskItem[];
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <div className="overview-chart-details">
      <div className="overview-chart-details-header">
        <span>{title}</span>
        <strong>{items.length}</strong>
      </div>
      {items.length === 0 ? (
        <div className="overview-chart-empty">暂无任务</div>
      ) : (
        <div className="overview-chart-task-list">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="overview-chart-task-item"
              onClick={() => onSelectTask(item.taskId)}
            >
              <div className="overview-risk-item-main">
                <span className="overview-risk-item-name">{item.taskName}</span>
                <span className="overview-risk-item-type">{item.taskTypeLabel}</span>
                {item.isSummary && <span className="overview-risk-item-type">汇总</span>}
              </div>
              <div className="overview-risk-item-meta">
                <span>计划结束 {item.plannedEnd}</span>
                <span>{item.actualStatus}</span>
              </div>
              <div className="overview-risk-item-reason">{item.reason}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OverviewDonutChart({
  title,
  data,
  selectedKey,
  detailItems,
  onToggleCategory,
  onSelectTask,
}: {
  title: string;
  data: ChartDatum[];
  selectedKey: string | null;
  detailItems: ProjectRiskItem[];
  onToggleCategory: (key: string) => void;
  onSelectTask: (taskId: string) => void;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const selectedItem = selectedKey ? data.find((item) => item.key === selectedKey) : null;
  const radius = 43;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;
  let segmentOffset = 0;

  return (
    <section className={`overview-chart-card${selectedItem ? " overview-chart-card--open" : ""}`}>
      <div className="overview-chart-header">
        <h3>{title}</h3>
        <span>{total}</span>
      </div>
      <div className="overview-chart-body">
        <div className="overview-donut" aria-label={`${title}，共 ${total} 项`}>
          <svg className="overview-donut-svg" viewBox="0 0 120 120" role="img" aria-label={title}>
            <circle
              className="overview-donut-track"
              cx="60"
              cy="60"
              r={radius}
              strokeWidth={strokeWidth}
            />
            {total === 0 ? (
              <circle
                className="overview-donut-empty"
                cx="60"
                cy="60"
                r={radius}
                strokeWidth={strokeWidth}
              />
            ) : (
              data
                .filter((item) => item.value > 0)
                .map((item) => {
                  const segmentLength = (item.value / total) * circumference;
                  const dashOffset = -segmentOffset;
                  segmentOffset += segmentLength;

                  return (
                    <circle
                      key={item.key}
                      className={`overview-donut-segment${selectedKey === item.key ? " overview-donut-segment--active" : ""}`}
                      cx="60"
                      cy="60"
                      r={radius}
                      stroke={item.color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                      strokeDashoffset={dashOffset}
                      transform="rotate(-90 60 60)"
                      role="button"
                      tabIndex={0}
                      aria-label={`${item.label} ${item.value} 项，占比 ${getPercentLabel(item.value, total)}`}
                      onClick={() => onToggleCategory(item.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onToggleCategory(item.key);
                        }
                      }}
                    >
                      <title>{`${item.label}：${item.value} 项，占比 ${getPercentLabel(item.value, total)}`}</title>
                    </circle>
                  );
                })
            )}
          </svg>
          <div className="overview-donut-center">
            <strong>{total}</strong>
            <span>总计</span>
          </div>
        </div>
        <div className="overview-chart-legend">
          {data.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`overview-chart-legend-item${selectedKey === item.key ? " overview-chart-legend-item--active" : ""}`}
              onClick={() => onToggleCategory(item.key)}
            >
              <span className="overview-chart-dot" style={{ background: item.color }} />
              <span className="overview-chart-label">{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
        </div>
      </div>
      {selectedItem && (
        <ChartTaskDetails
          title={selectedItem.label}
          items={detailItems}
          onSelectTask={onSelectTask}
        />
      )}
    </section>
  );
}

function RiskSection({
  title,
  items,
  onSelectTask,
}: {
  title: string;
  items: ProjectRiskItem[];
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <section className="overview-risk-section">
      <div className="overview-risk-section-header">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="overview-empty">暂无</div>
      ) : (
        <div className="overview-risk-list">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="overview-risk-item"
              onClick={() => onSelectTask(item.taskId)}
            >
              <div className="overview-risk-item-main">
                <span className="overview-risk-item-name">{item.taskName}</span>
                <span className="overview-risk-item-type">{item.taskTypeLabel}</span>
                {item.isSummary && <span className="overview-risk-item-type">汇总</span>}
              </div>
              <div className="overview-risk-item-meta">
                <span>计划结束 {item.plannedEnd}</span>
                <span>{item.actualStatus}</span>
              </div>
              <div className="overview-risk-item-reason">{item.reason}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProjectOverview({ overview, onSelectTask }: ProjectOverviewProps) {
  const [chartSelection, setChartSelection] = useState<ChartSelection>(null);
  const metricCards: MetricCard[] = [
    { key: "totalTasks", label: "总任务", value: overview.coreStats.totalTasks },
    { key: "completed", label: "已完成", value: overview.coreStats.completed, variant: "green" },
    { key: "inProgress", label: "进行中", value: overview.coreStats.inProgress, variant: "blue" },
    { key: "overdue", label: "已延期", value: overview.coreStats.overdue, variant: "red" },
    { key: "dependencyIssues", label: "依赖异常", value: overview.coreStats.dependencyIssues, variant: "red" },
    { key: "globalCritical", label: "全局关键", value: overview.coreStats.globalCritical, variant: "critical" },
  ];

  const statusChartData: ChartDatum[] = [
    { key: "notStarted", label: "未开始", value: overview.statusDistribution.notStarted, color: "#94a3b8" },
    { key: "inProgress", label: "进行中", value: overview.statusDistribution.inProgress, color: "#3b82f6" },
    { key: "completed", label: "已完成", value: overview.statusDistribution.completed, color: "#22c55e" },
    { key: "overdue", label: "已延期", value: overview.statusDistribution.overdue, color: "#ef4444" },
  ];

  const executionChartData: ChartDatum[] = [
    { key: "onPlan", label: "按计划任务", value: overview.executionDistribution.onPlan, color: "#38bdf8" },
    { key: "earlyCompleted", label: "提前完成任务", value: overview.executionDistribution.earlyCompleted, color: "#34d399" },
    { key: "overdue", label: "延期任务", value: overview.executionDistribution.overdue, color: "#f59e0b" },
    { key: "actualLate", label: "实际晚于计划任务", value: overview.executionDistribution.actualLate, color: "#fb7185" },
  ];
  const selectedStatusKey = chartSelection?.chart === "status" ? chartSelection.key as TaskStatusCategory : null;
  const selectedExecutionKey = chartSelection?.chart === "execution" ? chartSelection.key as PlanExecutionCategory : null;

  useEffect(() => {
    setChartSelection(null);
  }, [overview]);

  useEffect(() => {
    if (!chartSelection) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".overview-chart-card")) return;
      setChartSelection(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [chartSelection]);

  const toggleChartCategory = (chart: "status" | "execution", key: string) => {
    setChartSelection((current) => {
      if (current?.chart === chart && current.key === key) return null;
      return {
        chart,
        key: key as TaskStatusCategory | PlanExecutionCategory,
      };
    });
  };

  return (
    <div className="project-overview">
      <div className="overview-header">
        <div>
          <h2>项目概览</h2>
          <p>当前项目健康状态与主要风险项</p>
        </div>
      </div>

      <div className="overview-metrics" aria-label="项目概览指标">
        {metricCards.map((card) => (
          <div key={card.key} className={`overview-metric-card overview-metric-card--${card.variant ?? "neutral"}`}>
            <span className="overview-metric-label">{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </div>

      <div className="overview-charts" aria-label="项目概览图表">
        <OverviewDonutChart
          title="任务状态分布"
          data={statusChartData}
          selectedKey={selectedStatusKey}
          detailItems={selectedStatusKey ? overview.chartItems.status[selectedStatusKey] : []}
          onToggleCategory={(key) => toggleChartCategory("status", key)}
          onSelectTask={onSelectTask}
        />
        <OverviewDonutChart
          title="计划执行情况"
          data={executionChartData}
          selectedKey={selectedExecutionKey}
          detailItems={selectedExecutionKey ? overview.chartItems.execution[selectedExecutionKey] : []}
          onToggleCategory={(key) => toggleChartCategory("execution", key)}
          onSelectTask={onSelectTask}
        />
      </div>

      <div className="overview-section-title">
        <h3>重点风险</h3>
      </div>

      <div className="overview-risk-board" aria-label="项目风险列表">
        {RISK_SECTIONS.map((section) => (
          <RiskSection
            key={section.key}
            title={section.title}
            items={overview.risks[section.key]}
            onSelectTask={onSelectTask}
          />
        ))}
      </div>
    </div>
  );
}
