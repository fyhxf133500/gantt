import { useCallback, useEffect, useState } from "react";
import type { Task } from "../types/task";
import { mockTasks } from "../data/mockTasks";
import { loadTasks, saveTasks } from "../services/taskService";

export type TaskInput = Omit<Task, "id">;

function createTaskId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const storedTasks = loadTasks();
    return storedTasks ?? mockTasks;
  });

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  const addTask = useCallback((input: TaskInput) => {
    setTasks((prev) => [
      ...prev,
      {
        ...input,
        id: createTaskId(),
      },
    ]);
  }, []);

  const updateTask = useCallback((id: string, input: TaskInput) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...input } : task)));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  return { tasks, addTask, updateTask, deleteTask };
}
