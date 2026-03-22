# Changelog

记录项目的重要变更。

## [2026-03-22]
### Added
- 任务编辑弹窗新增父任务选择与任务类型（普通/里程碑）。
- 任务层级结构支持展开/折叠，并在列表中展示缩进。
- 层级防循环校验（禁止设置为自身或子孙节点）。

### Changed
- useTasks 生成任务树并输出可视化列表（visibleTasks）。
- mockTasks 增加父子任务、依赖与里程碑示例。
- 本地存储持久化任务层级字段与展开状态。

## [2026-03-15]
### Added
- 任务新增/编辑/删除能力与 TaskFormModal 弹窗。
- 任务列表操作列与 新建任务按钮。
- localStorage 持久化（含初始化与自动保存）。
- 拖动甘特任务条更新任务时间（onDateChange）。
- 悬浮提示中文化与日期显示格式优化。

### Changed
- 甘特图视图与列表组件结构完善（GanttChart/TaskList）。
- 修复并统一 UTF-8 编码处理。

## [2026-03-14]
### Added
- 项目初始化（Vite + React + TypeScript）。
