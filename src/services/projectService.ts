import { mockTasks } from "../data/mockTasks";
import type { Project } from "../types/project";
import type { DependencyType, MilestoneStatus, Task, TaskDependency } from "../types/task";

const PROJECTS_STORAGE_KEY = "gantt_projects";
const ACTIVE_PROJECT_STORAGE_KEY = "gantt_active_project_id";
const LEGACY_TASKS_STORAGE_KEY = "gantt_tasks";
const DEFAULT_PROJECT_NAME = "默认项目";

type StoredTask = Omit<Task, "start" | "end"> & {
  start: string;
  end: string;
};

type StoredProject = Omit<Project, "tasks"> & {
  tasks: StoredTask[];
};

type LegacyStoredTask = Omit<StoredTask, "dependencies"> & {
  dependencies?: Array<string | TaskDependency>;
};

export type ProjectUpdates = Partial<Pick<Project, "name" | "tasks" | "isTemplate">>;

function isStorageAvailable() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isDependencyType(value: unknown): value is DependencyType {
  return value === "FS" || value === "SS" || value === "FF";
}

function isMilestoneStatus(value: unknown): value is MilestoneStatus {
  return value === "pending" || value === "ready" || value === "passed";
}

function normalizeStoredDependencies(dependencies: LegacyStoredTask["dependencies"]): TaskDependency[] {
  if (!Array.isArray(dependencies)) return [];

  return dependencies.flatMap<TaskDependency>((dependency) => {
    if (typeof dependency === "string") {
      return [{ taskId: dependency, type: "FS" }];
    }

    if (
      dependency &&
      typeof dependency === "object" &&
      typeof dependency.taskId === "string" &&
      isDependencyType(dependency.type)
    ) {
      return [
        {
          taskId: dependency.taskId,
          type: dependency.type,
          lag: Number.isFinite(dependency.lag) ? dependency.lag : undefined,
        },
      ];
    }

    return [];
  });
}

function toStoredTask(task: Task): StoredTask {
  return {
    id: task.id,
    name: task.name,
    progress: task.progress,
    start: formatDate(task.start),
    end: formatDate(task.end),
    parentId: task.parentId ?? null,
    dependencies: (task.dependencies ?? []).map((dependency) => ({
      taskId: dependency.taskId,
      type: dependency.type,
      lag: Number.isFinite(dependency.lag) ? dependency.lag : undefined,
    })),
    type: task.type ?? "task",
    milestoneStatus: task.type === "milestone" ? task.milestoneStatus ?? "pending" : undefined,
    passedAt: task.type === "milestone" && task.passedAt ? task.passedAt : undefined,
    isExpanded: task.isExpanded ?? true,
  };
}

function fromStoredTask(task: LegacyStoredTask): Task | null {
  if (!task || typeof task !== "object") return null;
  if (typeof task.id !== "string" || typeof task.name !== "string") return null;
  if (typeof task.start !== "string" || typeof task.end !== "string") return null;

  const parsedStart = parseDate(task.start);
  const parsedEnd = parseDate(task.end);
  if (!parsedStart || !parsedEnd) return null;

  const progress = Number.isFinite(task.progress) ? Number(task.progress) : 0;
  const parentId = typeof task.parentId === "string" ? task.parentId : null;

  return {
    id: task.id,
    name: task.name,
    start: parsedStart,
    end: task.type === "milestone" ? parsedStart : parsedEnd,
    progress: Math.max(0, Math.min(100, progress)),
    parentId,
    dependencies: normalizeStoredDependencies(task.dependencies),
    type: task.type === "milestone" ? "milestone" : "task",
    milestoneStatus: task.type === "milestone" && isMilestoneStatus(task.milestoneStatus)
      ? task.milestoneStatus
      : task.type === "milestone"
        ? "pending"
        : undefined,
    passedAt: task.type === "milestone" && typeof task.passedAt === "string" ? task.passedAt : undefined,
    isExpanded: typeof task.isExpanded === "boolean" ? task.isExpanded : true,
  };
}

function cloneTask(task: Task): Task {
  return {
    ...task,
    start: new Date(task.start),
    end: new Date(task.end),
    parentId: task.parentId ?? null,
    dependencies: (task.dependencies ?? []).map((dependency) => ({ ...dependency })),
    type: task.type ?? "task",
    milestoneStatus: task.type === "milestone" ? task.milestoneStatus ?? "pending" : undefined,
    passedAt: task.type === "milestone" ? task.passedAt : undefined,
    isExpanded: task.isExpanded ?? true,
  };
}

function cloneProject(project: Project): Project {
  return {
    ...project,
    isTemplate: project.isTemplate === true ? true : undefined,
    tasks: project.tasks.map(cloneTask),
  };
}

function getUniqueProjectName(projects: Project[], baseName: string) {
  const names = new Set(projects.map((project) => project.name));

  if (!names.has(baseName)) return baseName;

  let index = 2;
  while (names.has(`${baseName} ${index}`)) {
    index += 1;
  }

  return `${baseName} ${index}`;
}

function getUniqueDuplicateProjectName(projects: Project[], sourceName: string) {
  return getUniqueProjectName(projects, `${sourceName} 副本`);
}

function getUniqueTemplateName(projects: Project[], sourceName: string) {
  return getUniqueProjectName(projects, `${sourceName} 模板`);
}

function getProjectNameFromTemplate(projects: Project[], templateName: string) {
  const baseName = templateName.replace(/\s*模板\s*$/, "").trim() || templateName;
  return getUniqueProjectName(projects, `${baseName} 新项目`);
}

function cloneTasksWithNewIds(tasks: Task[]) {
  const idMap = new Map(tasks.map((task) => [task.id, createId("task")]));

  return tasks.map((task) => {
    const nextTaskId = idMap.get(task.id) ?? createId("task");
    const nextParentId = task.parentId ? idMap.get(task.parentId) ?? null : null;
    const nextDependencies = (task.dependencies ?? []).flatMap<TaskDependency>((dependency) => {
      const nextDependencyTaskId = idMap.get(dependency.taskId);
      if (!nextDependencyTaskId) return [];

      return [
        {
          taskId: nextDependencyTaskId,
          type: dependency.type,
          lag: Number.isFinite(dependency.lag) ? dependency.lag : undefined,
        },
      ];
    });

    return {
      id: nextTaskId,
      name: task.name,
      start: new Date(task.start),
      end: new Date(task.end),
      progress: task.progress,
      parentId: nextParentId,
      dependencies: nextDependencies,
      type: task.type ?? "task",
      milestoneStatus: task.type === "milestone" ? task.milestoneStatus ?? "pending" : undefined,
      passedAt: task.type === "milestone" ? task.passedAt : undefined,
      isExpanded: task.isExpanded ?? true,
    };
  });
}

function toStoredProject(project: Project): StoredProject {
  return {
    id: project.id,
    name: project.name,
    isTemplate: project.isTemplate === true ? true : undefined,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    tasks: project.tasks.map(toStoredTask),
  };
}

function fromStoredProject(project: StoredProject): Project | null {
  if (!project || typeof project !== "object") return null;
  if (typeof project.id !== "string" || typeof project.name !== "string") return null;
  if (!Array.isArray(project.tasks)) return null;

  const tasks = project.tasks.map((task) => fromStoredTask(task)).filter((task): task is Task => Boolean(task));

  return {
    id: project.id,
    name: project.name,
    tasks,
    isTemplate: project.isTemplate === true ? true : undefined,
    createdAt: typeof project.createdAt === "string" ? project.createdAt : undefined,
    updatedAt: typeof project.updatedAt === "string" ? project.updatedAt : undefined,
  };
}

function createDefaultProject(tasks: Task[] = mockTasks): Project {
  const now = new Date().toISOString();
  return {
    id: createId("project"),
    name: DEFAULT_PROJECT_NAME,
    tasks: tasks.map(cloneTask),
    isTemplate: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function loadStoredProjects() {
  if (!isStorageAvailable()) return null;
  const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredProject[];
    if (!Array.isArray(parsed)) return null;
    const projects = parsed
      .map((item) => fromStoredProject(item))
      .filter((item): item is Project => Boolean(item));
    return projects.length > 0 ? projects : null;
  } catch {
    return null;
  }
}

function loadLegacyTasks() {
  if (!isStorageAvailable()) return null;
  const raw = window.localStorage.getItem(LEGACY_TASKS_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LegacyStoredTask[];
    if (!Array.isArray(parsed)) return null;
    const tasks = parsed.map((item) => fromStoredTask(item)).filter((item): item is Task => Boolean(item));
    return tasks.length > 0 ? tasks : null;
  } catch {
    return null;
  }
}

function ensureActiveProject(projects: Project[]) {
  const activeProjectId = getActiveProjectId();
  const nextActiveProjectId = projects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : projects.find((project) => !project.isTemplate)?.id ?? projects[0]?.id ?? null;

  if (nextActiveProjectId) {
    setActiveProjectId(nextActiveProjectId);
  }

  return nextActiveProjectId;
}

export function getProjects(): Project[] {
  const storedProjects = loadStoredProjects();
  if (storedProjects) {
    ensureActiveProject(storedProjects);
    return storedProjects.map(cloneProject);
  }

  const legacyTasks = loadLegacyTasks();
  const migratedProject = createDefaultProject(legacyTasks ?? mockTasks);
  saveProjects([migratedProject]);
  setActiveProjectId(migratedProject.id);
  return [cloneProject(migratedProject)];
}

export function saveProjects(projects: Project[]) {
  if (!isStorageAvailable()) return;
  const payload = projects.map((project) => toStoredProject(project));
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(payload));
}

export function createProject(name: string) {
  const projects = getProjects();
  const now = new Date().toISOString();
  const project: Project = {
    id: createId("project"),
    name: name.trim() || "新项目",
    tasks: [],
    isTemplate: undefined,
    createdAt: now,
    updatedAt: now,
  };

  saveProjects([...projects, project]);
  setActiveProjectId(project.id);
  return cloneProject(project);
}

function createProjectCopy(
  projects: Project[],
  sourceProject: Project,
  name: string,
  options: { isTemplate?: boolean; activate?: boolean }
) {
  const now = new Date().toISOString();
  const project: Project = {
    id: createId("project"),
    name,
    tasks: cloneTasksWithNewIds(sourceProject.tasks),
    isTemplate: options.isTemplate === true ? true : undefined,
    createdAt: now,
    updatedAt: now,
  };

  saveProjects([...projects, project]);
  if (options.activate) {
    setActiveProjectId(project.id);
  }
  return cloneProject(project);
}

export function duplicateProject(projectId: string) {
  const projects = getProjects();
  const sourceProject = projects.find((project) => project.id === projectId);
  if (!sourceProject) return null;

  return createProjectCopy(projects, sourceProject, getUniqueDuplicateProjectName(projects, sourceProject.name), {
    isTemplate: sourceProject.isTemplate === true,
    activate: sourceProject.isTemplate !== true,
  });
}

export function saveProjectAsTemplate(projectId: string) {
  const projects = getProjects();
  const sourceProject = projects.find((project) => project.id === projectId);
  if (!sourceProject) return null;

  return createProjectCopy(projects, sourceProject, getUniqueTemplateName(projects, sourceProject.name), {
    isTemplate: true,
    activate: false,
  });
}

export function createProjectFromTemplate(templateId: string) {
  const projects = getProjects();
  const sourceTemplate = projects.find((project) => project.id === templateId);
  if (!sourceTemplate) return null;

  return createProjectCopy(projects, sourceTemplate, getProjectNameFromTemplate(projects, sourceTemplate.name), {
    isTemplate: false,
    activate: true,
  });
}

export function updateProject(projectId: string, updates: ProjectUpdates) {
  const projects = getProjects();
  const now = new Date().toISOString();
  let updatedProject: Project | null = null;
  const nextProjects = projects.map((project) => {
    if (project.id !== projectId) return project;

    updatedProject = {
      ...project,
      ...updates,
      name: updates.name?.trim() || project.name,
      tasks: updates.tasks ? updates.tasks.map(cloneTask) : project.tasks.map(cloneTask),
      isTemplate: updates.isTemplate ?? project.isTemplate,
      updatedAt: now,
    };
    return updatedProject;
  });

  saveProjects(nextProjects);
  return updatedProject ? cloneProject(updatedProject) : null;
}

export function deleteProject(projectId: string) {
  const projects = getProjects();
  if (projects.length <= 1) {
    ensureActiveProject(projects);
    return projects.map(cloneProject);
  }

  const nextProjects = projects.filter((project) => project.id !== projectId);
  saveProjects(nextProjects);
  ensureActiveProject(nextProjects);
  return nextProjects.map(cloneProject);
}

export function getActiveProjectId() {
  if (!isStorageAvailable()) return null;
  return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
}

export function setActiveProjectId(projectId: string) {
  if (!isStorageAvailable()) return;
  window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
}
