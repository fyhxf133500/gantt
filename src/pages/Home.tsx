import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import type { ProjectView } from "../components/AppShell";
import { GanttChart } from "../components/GanttChart";
import { ProjectCalendar } from "../components/ProjectCalendar";
import { ProjectOverview } from "../components/ProjectOverview";
import { TaskFormModal } from "../components/TaskFormModal";
import type { TaskFormData } from "../components/TaskFormModal";
import { DeleteTaskDialog } from "../components/DeleteTaskDialog";
import { TimeConflictDialog } from "../components/TimeConflictDialog";
import {
  applyAutoScheduling,
  buildCreatedTasks,
  buildUpdatedTasks,
  calculateParentSummary,
  checkDependencyConflicts,
  type DependencyConflict,
  useTasks,
} from "../hooks/useTasks";
import { exportProjectGanttExcel } from "../services/exportService";
import { buildProjectOverview } from "../services/projectOverviewService";
import type { Task } from "../types/task";

type PendingConflictState = {
  nextTasks: Task[];
  conflicts: DependencyConflict[];
};

type FocusedTaskState = {
  taskId: string;
  requestId: number;
};

export function Home() {
  const {
    tasks,
    taskRows,
    visibleTasks,
    criticalPathError,
    selectedSummaryTaskId,
    localCriticalPathError,
    hasBaseline,
    projects,
    activeProject,
    activeProjectId,
    createProject,
    duplicateProject,
    saveProjectAsTemplate,
    createProjectFromTemplate,
    selectProject,
    renameProject,
    deleteProject: deleteProjectRecord,
    moveTask,
    deleteTask,
    revealTask,
    toggleTaskExpanded,
    toggleMilestonePassed,
    replaceTasks,
    captureBaseline,
    clearBaseline,
    selectSummaryTask,
    clearSelectedSummaryTask,
  } = useTasks();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteDialogTask, setDeleteDialogTask] = useState<Task | null>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingConflictState | null>(null);
  const [currentProjectView, setCurrentProjectView] = useState<ProjectView>("overview");
  const [focusedTask, setFocusedTask] = useState<FocusedTaskState | null>(null);
  const projectOverview = useMemo(() => buildProjectOverview(taskRows), [taskRows]);
  const isActiveTemplate = activeProject?.isTemplate === true;

  useEffect(() => {
    if (isActiveTemplate && currentProjectView !== "gantt") {
      setCurrentProjectView("gantt");
    }
  }, [currentProjectView, isActiveTemplate]);

  useEffect(() => {
    setFocusedTask(null);
  }, [activeProjectId]);

  useEffect(() => {
    if (currentProjectView !== "gantt") {
      setFocusedTask(null);
    }
  }, [currentProjectView]);

  useEffect(() => {
    if (!focusedTask) return;
    if (!taskRows.some((task) => task.id === focusedTask.taskId)) {
      setFocusedTask(null);
    }
  }, [focusedTask, taskRows]);

  const evaluateCandidateTasks = (nextTasks: Task[]) => {
    const summarizedTasks = calculateParentSummary(nextTasks);
    const conflicts = checkDependencyConflicts(summarizedTasks);
    return { summarizedTasks, conflicts };
  };

  const handleCreateTask = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDeleteTask = (task: Task) => {
    const hasChildren = tasks.some((item) => item.parentId === task.id);
    if (!hasChildren) {
      const confirmed = window.confirm(`确认删除任务“${task.name}”吗？`);
      if (!confirmed) return;
      deleteTask(task.id);
      return;
    }

    setDeleteDialogTask(task);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  const handleSubmit = (data: TaskFormData) => {
    const nextTasks = editingTask ? buildUpdatedTasks(tasks, editingTask.id, data) : buildCreatedTasks(tasks, data);
    if (!nextTasks) return;

    const { summarizedTasks, conflicts } = evaluateCandidateTasks(nextTasks);
    if (conflicts.length > 0) {
      setPendingConflict({ nextTasks: summarizedTasks, conflicts });
      handleCloseModal();
      return;
    }

    replaceTasks(summarizedTasks);
    handleCloseModal();
  };

  const handleUpdateTask = (id: string, input: Pick<Task, "name" | "start" | "end" | "progress">) => {
    const currentTask = tasks.find((task) => task.id === id);
    if (!currentTask) return false;

    const nextTasks = buildUpdatedTasks(tasks, id, {
      ...currentTask,
      ...input,
      parentId: currentTask.parentId ?? null,
      dependencies: currentTask.dependencies ?? [],
      type: currentTask.type ?? "task",
    });
    if (!nextTasks) return false;

    const { summarizedTasks, conflicts } = evaluateCandidateTasks(nextTasks);
    if (conflicts.length > 0) {
      setPendingConflict({ nextTasks: summarizedTasks, conflicts });
      return false;
    }

    replaceTasks(summarizedTasks);
    return true;
  };

  const handleDeleteCancel = () => {
    setDeleteDialogTask(null);
  };

  const handleDeleteAll = () => {
    if (!deleteDialogTask) return;
    deleteTask(deleteDialogTask.id, { mode: "delete" });
    setDeleteDialogTask(null);
  };

  const handlePromoteChildren = () => {
    if (!deleteDialogTask) return;
    deleteTask(deleteDialogTask.id, { mode: "promote" });
    setDeleteDialogTask(null);
  };

  const handleTimeConflictCancel = () => {
    setPendingConflict(null);
  };

  const handleTimeConflictAutoSchedule = () => {
    if (!pendingConflict) return;
    const scheduledTasks = applyAutoScheduling(pendingConflict.nextTasks);
    const summarizedTasks = calculateParentSummary(scheduledTasks);
    replaceTasks(summarizedTasks);
    setPendingConflict(null);
  };

  const handleOverviewTaskSelect = (taskId: string) => {
    const targetTask = taskRows.find((task) => task.id === taskId);
    if (!targetTask) {
      setFocusedTask(null);
      setCurrentProjectView("gantt");
      return;
    }

    revealTask(taskId);
    if (targetTask?.hasChildren) {
      selectSummaryTask(taskId);
    } else {
      clearSelectedSummaryTask();
    }
    setFocusedTask((current) => ({
      taskId,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    setCurrentProjectView("gantt");
  };

  const handleExportExcel = () => {
    void exportProjectGanttExcel({
      projectName: activeProject?.name ?? "默认项目",
      tasks: taskRows,
    }).catch((error) => {
      console.error(error);
      window.alert("导出 Excel 失败，请稍后重试。");
    });
  };

  return (
    <AppShell
      projectName={activeProject?.name ?? "默认项目"}
      projects={projects}
      activeProjectId={activeProjectId}
      activeProjectView={currentProjectView}
      onSelectProject={selectProject}
      onSelectProjectView={setCurrentProjectView}
      onCreateProject={createProject}
      onDuplicateProject={duplicateProject}
      onSaveProjectAsTemplate={saveProjectAsTemplate}
      onCreateProjectFromTemplate={createProjectFromTemplate}
      onRenameProject={renameProject}
      onDeleteProject={deleteProjectRecord}
    >
      <div
        className="page"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            clearSelectedSummaryTask();
            setFocusedTask(null);
          }
        }}
      >
        {currentProjectView === "overview" && !isActiveTemplate ? (
          <ProjectOverview
            overview={projectOverview}
            onSelectTask={handleOverviewTaskSelect}
          />
        ) : currentProjectView === "calendar" && !isActiveTemplate ? (
          <ProjectCalendar
            tasks={taskRows}
            onSelectTask={handleOverviewTaskSelect}
          />
        ) : (
          <GanttChart
            projectId={activeProjectId}
            tasks={visibleTasks}
            allTasks={taskRows}
            focusedTask={focusedTask}
            criticalPathError={criticalPathError}
            selectedSummaryTaskId={selectedSummaryTaskId}
            localCriticalPathError={localCriticalPathError}
            hasBaseline={hasBaseline}
            onCreateTask={handleCreateTask}
            onEditTask={handleEditTask}
            onDeleteTask={handleDeleteTask}
            onUpdateTask={handleUpdateTask}
            onCaptureBaseline={captureBaseline}
            onClearBaseline={clearBaseline}
            onExportExcel={handleExportExcel}
            onToggleExpand={toggleTaskExpanded}
            onMoveTask={moveTask}
            onToggleMilestonePassed={toggleMilestonePassed}
            onSelectSummaryTask={selectSummaryTask}
            onClearSelectedSummaryTask={clearSelectedSummaryTask}
            onClearFocusedTask={() => setFocusedTask(null)}
          />
        )}
      </div>
      <TaskFormModal
        isOpen={isModalOpen}
        mode={editingTask ? "edit" : "create"}
        initialTask={editingTask}
        tasks={tasks}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
      <DeleteTaskDialog
        isOpen={Boolean(deleteDialogTask)}
        task={deleteDialogTask}
        onDeleteAll={handleDeleteAll}
        onPromote={handlePromoteChildren}
        onCancel={handleDeleteCancel}
      />
      <TimeConflictDialog
        isOpen={Boolean(pendingConflict)}
        conflict={pendingConflict?.conflicts[0] ?? null}
        conflictCount={pendingConflict?.conflicts.length ?? 0}
        onAutoSchedule={handleTimeConflictAutoSchedule}
        onCancel={handleTimeConflictCancel}
      />
    </AppShell>
  );
}
