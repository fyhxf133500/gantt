import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import type { Project } from "../types/project";

export type ProjectView = "overview" | "gantt" | "calendar";

export type AppShellProps = {
  projectName: string;
  projects: Project[];
  activeProjectId: string | null;
  activeProjectView: ProjectView;
  onSelectProject: (projectId: string) => void;
  onSelectProjectView: (view: ProjectView) => void;
  onCreateProject: (name: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onSaveProjectAsTemplate: (projectId: string) => void;
  onCreateProjectFromTemplate: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onDeleteProject: (projectId: string) => void;
  children: ReactNode;
};

type ProjectMenuState = {
  projectId: string;
  top: number;
  left: number;
};

type EditingProjectState = {
  projectId: string;
  value: string;
};

const PROJECT_MENU_WIDTH = 132;
const PROJECT_MENU_HEIGHT = 168;

function getNextProjectName(projects: Project[]) {
  return `新项目 ${projects.length + 1}`;
}

export function AppShell({
  projectName,
  projects,
  activeProjectId,
  activeProjectView,
  onSelectProject,
  onSelectProjectView,
  onCreateProject,
  onDuplicateProject,
  onSaveProjectAsTemplate,
  onCreateProjectFromTemplate,
  onRenameProject,
  onDeleteProject,
  children,
}: AppShellProps) {
  const [projectMenu, setProjectMenu] = useState<ProjectMenuState | null>(null);
  const [editingProject, setEditingProject] = useState<EditingProjectState | null>(null);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const editingInputRef = useRef<HTMLInputElement | null>(null);
  const editingProjectRef = useRef<EditingProjectState | null>(null);
  const selectProjectTimerRef = useRef<number | null>(null);
  const canDeleteProject = projects.length > 1;
  const openMenuProjectId = projectMenu?.projectId ?? null;
  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(projectSearchQuery.trim().toLowerCase())
  );
  const regularProjects = filteredProjects.filter((project) => !project.isTemplate);
  const templateProjects = filteredProjects.filter((project) => project.isTemplate);
  const hasProjectSearchResults = regularProjects.length > 0 || templateProjects.length > 0;
  const editingProjectId = editingProject?.projectId ?? null;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const isActiveTemplate = activeProject?.isTemplate === true;

  useEffect(() => {
    editingProjectRef.current = editingProject;
  }, [editingProject]);

  useEffect(() => {
    if (!editingProjectId) return;
    editingInputRef.current?.focus();
    editingInputRef.current?.select();
  }, [editingProjectId]);

  useEffect(() => {
    return () => {
      if (selectProjectTimerRef.current) {
        window.clearTimeout(selectProjectTimerRef.current);
      }
    };
  }, []);

  const handleCreateProject = () => {
    const fallbackName = getNextProjectName(projects);
    const name = window.prompt("请输入项目名称", fallbackName);
    if (name === null) return;
    const normalizedName = name.trim();
    onCreateProject(normalizedName || fallbackName);
    onSelectProjectView("overview");
  };

  const startRenameProject = (project: Project) => {
    if (selectProjectTimerRef.current) {
      window.clearTimeout(selectProjectTimerRef.current);
      selectProjectTimerRef.current = null;
    }
    setProjectMenu(null);
    const nextEditingProject = { projectId: project.id, value: project.name };
    editingProjectRef.current = nextEditingProject;
    setEditingProject(nextEditingProject);
  };

  const finishRenameProject = () => {
    const currentEditingProject = editingProjectRef.current;
    if (!currentEditingProject) return;

    const project = projects.find((item) => item.id === currentEditingProject.projectId);
    const normalizedName = currentEditingProject.value.trim();
    editingProjectRef.current = null;
    setEditingProject(null);

    if (!project || !normalizedName || normalizedName === project.name) return;
    onRenameProject(project.id, normalizedName);
  };

  const cancelRenameProject = () => {
    editingProjectRef.current = null;
    setEditingProject(null);
  };

  const updateEditingProjectValue = (projectId: string, value: string) => {
    setEditingProject((current) => {
      if (current?.projectId !== projectId) return current;
      const nextEditingProject = { ...current, value };
      editingProjectRef.current = nextEditingProject;
      return nextEditingProject;
    });
  };

  const handleDeleteProject = (project: Project) => {
    setProjectMenu(null);
    if (!canDeleteProject) return;

    const confirmed = window.confirm(`确认删除项目“${project.name}”吗？该项目下的任务也会被删除。`);
    if (!confirmed) return;
    onDeleteProject(project.id);
  };

  const handleDuplicateProject = (project: Project) => {
    setProjectMenu(null);
    onDuplicateProject(project.id);
    if (!project.isTemplate) {
      onSelectProjectView("overview");
    }
  };

  const handleSaveProjectAsTemplate = (project: Project) => {
    setProjectMenu(null);
    onSaveProjectAsTemplate(project.id);
  };

  const handleCreateProjectFromTemplate = (project: Project) => {
    setProjectMenu(null);
    onCreateProjectFromTemplate(project.id);
    onSelectProjectView("overview");
  };

  const handleMenuButtonClick = (event: MouseEvent<HTMLButtonElement>, projectId: string) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - PROJECT_MENU_WIDTH - 8, rect.right - PROJECT_MENU_WIDTH));
    const top = Math.min(window.innerHeight - PROJECT_MENU_HEIGHT - 8, rect.bottom + 4);
    setProjectMenu((current) => (current?.projectId === projectId ? null : { projectId, top, left }));
  };

  const handleProjectContextMenu = (event: MouseEvent<HTMLDivElement>, projectId: string) => {
    event.preventDefault();
    const left = Math.max(8, Math.min(window.innerWidth - PROJECT_MENU_WIDTH - 8, event.clientX));
    const top = Math.min(window.innerHeight - PROJECT_MENU_HEIGHT - 8, event.clientY);
    setProjectMenu({ projectId, top, left });
  };

  const handleProjectNameDoubleClick = (event: MouseEvent<HTMLButtonElement>, project: Project) => {
    event.preventDefault();
    event.stopPropagation();
    startRenameProject(project);
  };

  const handleProjectNameClick = (project: Project) => {
    if (selectProjectTimerRef.current) {
      window.clearTimeout(selectProjectTimerRef.current);
    }

    selectProjectTimerRef.current = window.setTimeout(() => {
      onSelectProject(project.id);
      onSelectProjectView(project.isTemplate ? "gantt" : "overview");
      selectProjectTimerRef.current = null;
    }, 180);
  };

  const handleRenameInputClick = (event: MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };

  const handleRenameInputBlur = () => {
    finishRenameProject();
  };

  const handleRenameInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Enter") {
      event.preventDefault();
      finishRenameProject();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelRenameProject();
    }
  };

  const renderProjectItem = (project: Project) => {
    const isTemplate = project.isTemplate === true;
    const isActiveProject = project.id === activeProjectId;

    return (
      <div
        key={project.id}
        className={isActiveProject ? "project-list-item project-list-item--active" : "project-list-item"}
        onContextMenu={(event) => handleProjectContextMenu(event, project.id)}
      >
        <div className="project-list-main-row">
          {editingProject?.projectId === project.id ? (
            <div className="project-rename-row" onClick={(event) => event.stopPropagation()}>
              <span className="project-list-dot" aria-hidden="true" />
              <input
                ref={editingInputRef}
                className="project-rename-input"
                value={editingProject.value}
                onChange={(event) => updateEditingProjectValue(project.id, event.target.value)}
                onClick={handleRenameInputClick}
                onBlur={handleRenameInputBlur}
                onKeyDown={handleRenameInputKeyDown}
                aria-label="项目名称"
              />
            </div>
          ) : (
            <button
              type="button"
              className="project-select-button"
              onClick={() => handleProjectNameClick(project)}
              onDoubleClick={(event) => handleProjectNameDoubleClick(event, project)}
            >
              <span className={isTemplate ? "project-list-dot project-list-dot--template" : "project-list-dot"} aria-hidden="true" />
              <span className="project-list-name">{project.name}</span>
            </button>
          )}

          <button
            type="button"
            className={
              openMenuProjectId === project.id
                ? "project-more-button project-more-button--open"
                : "project-more-button"
            }
            aria-label={`打开${project.name}项目菜单`}
            aria-haspopup="menu"
            aria-expanded={openMenuProjectId === project.id}
            onClick={(event) => handleMenuButtonClick(event, project.id)}
          >
            ...
          </button>
        </div>
        {projectMenu?.projectId === project.id && (
          <div
            className="project-menu"
            role="menu"
            style={{ top: projectMenu.top, left: projectMenu.left }}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="project-menu-item" role="menuitem" onClick={() => startRenameProject(project)}>
              重命名
            </button>
            {isTemplate ? (
              <>
                <button
                  type="button"
                  className="project-menu-item"
                  role="menuitem"
                  onClick={() => handleCreateProjectFromTemplate(project)}
                >
                  从模板创建项目
                </button>
                <button type="button" className="project-menu-item" role="menuitem" onClick={() => handleDuplicateProject(project)}>
                  复制模板
                </button>
              </>
            ) : (
              <>
                <button type="button" className="project-menu-item" role="menuitem" onClick={() => handleDuplicateProject(project)}>
                  复制项目
                </button>
                <button
                  type="button"
                  className="project-menu-item"
                  role="menuitem"
                  onClick={() => handleSaveProjectAsTemplate(project)}
                >
                  保存为模板
                </button>
              </>
            )}
            <button
              type="button"
              className="project-menu-item project-menu-item--danger"
              role="menuitem"
              disabled={!canDeleteProject}
              onClick={() => handleDeleteProject(project)}
            >
              {isTemplate ? "删除模板" : "删除项目"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-shell" onClick={() => setProjectMenu(null)}>
      <header className="global-header">
        <div className="global-header-brand">项目甘特图</div>
        <div className="global-header-spacer" />
      </header>

      <div className="app-body">
        <aside className="app-sidebar" aria-label="项目导航">
          <nav className="project-nav" aria-label="项目列表">
            <div className="project-nav-header">
              <span className="project-nav-title">项目列表</span>
              <input
                type="search"
                className="project-search-input"
                placeholder="搜索项目"
                value={projectSearchQuery}
                onChange={(event) => setProjectSearchQuery(event.target.value)}
                aria-label="搜索项目"
              />
              <button type="button" className="new-project-button" onClick={handleCreateProject}>
                + 新建项目
              </button>
            </div>

            <div className="project-list">
              {!hasProjectSearchResults ? (
                <div className="project-list-empty">未找到项目</div>
              ) : (
                <>
                  {regularProjects.length > 0 && (
                    <div className="project-list-section">
                      {regularProjects.map((project) => renderProjectItem(project))}
                    </div>
                  )}
                  {templateProjects.length > 0 && (
                    <div className="project-list-section">
                      <div className="project-list-section-title">模板</div>
                      {templateProjects.map((project) => renderProjectItem(project))}
                    </div>
                  )}
                </>
              )}
            </div>
          </nav>
        </aside>

        <main className="app-main">
          <header className="project-header">
            <div>
              <div className="project-header-label">项目</div>
              <h1 className="project-title">{projectName}</h1>
              <div className="project-view-tabs" aria-label={`${projectName}页面切换`}>
                {!isActiveTemplate && (
                  <button
                    type="button"
                    className={
                      activeProjectView === "overview"
                        ? "project-view-tab project-view-tab--active"
                        : "project-view-tab"
                    }
                    onClick={() => onSelectProjectView("overview")}
                  >
                    概览
                  </button>
                )}
                <button
                  type="button"
                  className={
                    activeProjectView === "gantt" || isActiveTemplate
                      ? "project-view-tab project-view-tab--active"
                      : "project-view-tab"
                  }
                  onClick={() => onSelectProjectView("gantt")}
                >
                  甘特图
                </button>
                {!isActiveTemplate && (
                  <button
                    type="button"
                    className={
                      activeProjectView === "calendar"
                        ? "project-view-tab project-view-tab--active"
                        : "project-view-tab"
                    }
                    onClick={() => onSelectProjectView("calendar")}
                  >
                    日历
                  </button>
                )}
              </div>
            </div>
          </header>

          <section className="project-workspace" aria-label={`${projectName}项目工作区`}>
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
