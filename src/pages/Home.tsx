import { useState } from "react";
import { GanttChart } from "../components/GanttChart";
import { TaskFormModal } from "../components/TaskFormModal";
import type { TaskFormData } from "../components/TaskFormModal";
import { DeleteTaskDialog } from "../components/DeleteTaskDialog";
import { useTasks } from "../hooks/useTasks";
import type { Task } from "../types/task";

export function Home() {
  const { tasks, visibleTasks, addTask, updateTask, moveTask, deleteTask, toggleTaskExpanded } = useTasks();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteDialogTask, setDeleteDialogTask] = useState<Task | null>(null);

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
    if (editingTask) {
      updateTask(editingTask.id, data);
    } else {
      addTask(data);
    }
    handleCloseModal();
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

  return (
    <div className="page">
      <h1 className="page-title">项目甘特图</h1>
      <GanttChart
        tasks={visibleTasks}
        onCreateTask={handleCreateTask}
        onEditTask={handleEditTask}
        onDeleteTask={handleDeleteTask}
        onUpdateTask={updateTask}
        onToggleExpand={toggleTaskExpanded}
        onMoveTask={moveTask}
      />
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
    </div>
  );
}