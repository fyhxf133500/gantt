import type { ProjectOverview as ProjectOverviewData, ProjectRiskCategory, ProjectRiskItem } from "../services/projectOverviewService";

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
  { key: "baselineDelayed", title: "偏离基线任务" },
  { key: "actualOverdue", title: "实际超期任务" },
  { key: "readyMilestone", title: "待确认节点" },
  { key: "dependencyIssue", title: "依赖异常任务" },
  { key: "globalCritical", title: "全局关键任务" },
];

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
  const metricCards: MetricCard[] = [
    { key: "totalTasks", label: "总任务数", value: overview.stats.totalTasks },
    { key: "completed", label: "已完成", value: overview.stats.completed, variant: "green" },
    { key: "inProgress", label: "进行中", value: overview.stats.inProgress, variant: "blue" },
    { key: "overdue", label: "已延期", value: overview.stats.overdue, variant: "red" },
    { key: "readyMilestones", label: "待确认节点", value: overview.stats.readyMilestones, variant: "amber" },
    { key: "passedMilestones", label: "已通过节点", value: overview.stats.passedMilestones, variant: "green" },
    { key: "globalCritical", label: "全局关键任务", value: overview.stats.globalCritical, variant: "critical" },
    { key: "baselineDelayed", label: "偏离基线任务", value: overview.stats.baselineDelayed, variant: "amber" },
    { key: "actualOverdue", label: "实际超期任务", value: overview.stats.actualOverdue, variant: "red" },
    { key: "dependencyIssues", label: "依赖异常任务", value: overview.stats.dependencyIssues, variant: "red" },
  ];

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
