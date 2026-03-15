import { useState } from "react";
import { GanttChart } from "../components/GanttChart";
import { TaskFormModal } from "../components/TaskFormModal";
import type { TaskFormData } from "../components/TaskFormModal";
import { useTasks } from "../hooks/useTasks";
import type { Task } from "../types/task";

export function Home() {
  const { tasks, addTask, updateTask, deleteTask } = useTasks();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleCreateTask = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDeleteTask = (task: Task) => {
    const confirmed = window.confirm(`确认删除任务“${task.name}”吗？`);
    if (!confirmed) return;
    deleteTask(task.id);
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

  return (
    <div className="page">
      <h1 className="page-title">项目甘特图</h1>
      <GanttChart
        tasks={tasks}
        onCreateTask={handleCreateTask}
        onEditTask={handleEditTask}
        onDeleteTask={handleDeleteTask}
      />
      <TaskFormModal
        isOpen={isModalOpen}
        mode={editingTask ? "edit" : "create"}
        initialTask={editingTask}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
