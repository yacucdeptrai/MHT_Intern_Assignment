import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useLocation, useNavigate, useRouteLoaderData } from "react-router";

import type { SessionUser } from "@pm/domain";
import { APP_NAME } from "@pm/domain";

import { translateRole } from "../../i18n/labels";
import type { ProjectHeaderLoaderData } from "../../loaders/projectHeaderLoader";
import { useSidebarCollapsed, useTheme } from "../../utils/theme";
import { LanguageSwitcher, useLanguageSwitch } from "../i18n/LanguageSwitcher";
import { Avatar } from "../ui/Avatar";
import { PRODUCT_INITIALS } from "../ui/brand";
import { projectDot } from "../ui/projectColor";
import { Breadcrumb, type BreadcrumbItem } from "../ui/Breadcrumb";
import { CommandBar, type CommandGroup, type CommandItem } from "../ui/CommandBar";
import { Icon, type IconName } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { Kbd } from "../ui/Kbd";
import { Sidebar, SidebarItem, SidebarSection, WorkspaceSwitcher } from "../ui/Sidebar";
import { StatusIcon, statusGlyph } from "../ui/TaskIcons";
import { Toast } from "../ui/Toast";
import { useCommandTasks } from "./useCommandTasks";

export interface SidebarProject {
  id: string;
  name: string;
  code: string;
}

export interface AppShellProps {
  user: SessionUser;
  projects: SidebarProject[];
  unreadCount: number;
  children: ReactNode;
}

type ProjectTab = "tasks" | "sprints" | "members" | "settings" | "reports";

type PageId =
  | "dashboard"
  | "my-tasks"
  | "calendar"
  | "notifications"
  | "profile"
  | "projects"
  | "admin-users"
  | "admin-statuses"
  | "admin-audit"
  | "project";

interface ActiveRoute {
  page: PageId;
  projectId?: string;
  tab?: ProjectTab;
}

const PROJECT_ROUTE_ID = "routes/_app.projects.$projectId";

/** Maps the URL to the one sidebar item that should be active. */
function resolveRoute(pathname: string): ActiveRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  const projectMatch = /^\/projects\/([^/]+)(?:\/([^/]+))?/.exec(path);
  if (projectMatch && projectMatch[1] !== "new") {
    const sub = projectMatch[2];
    const tab: ProjectTab =
      sub === "sprints" || sub === "members" || sub === "settings" || sub === "reports" ? sub : "tasks";
    return { page: "project", projectId: projectMatch[1], tab };
  }
  if (path.startsWith("/projects")) return { page: "projects" };
  if (path.startsWith("/my-tasks")) return { page: "my-tasks" };
  if (path.startsWith("/calendar")) return { page: "calendar" };
  if (path.startsWith("/notifications")) return { page: "notifications" };
  if (path.startsWith("/profile")) return { page: "profile" };
  if (path.startsWith("/admin/users")) return { page: "admin-users" };
  if (path.startsWith("/admin/statuses")) return { page: "admin-statuses" };
  if (path.startsWith("/admin/audit-log")) return { page: "admin-audit" };
  return { page: "dashboard" };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
}

/**
 * One shell for both layouts. Member: personal pages + projects. Admin & PM portal: adds the
 * Management section. Role checks stay server-side; this only hides what the role cannot use.
 */
export function AppShell({ user, projects, unreadCount, children }: AppShellProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentLang, switchTo } = useLanguageSwitch();
  const projectData = useRouteLoaderData<ProjectHeaderLoaderData>(PROJECT_ROUTE_ID);

  const isPortal = user.systemRole === "ADMIN" || user.systemRole === "PM";
  const isAdmin = user.systemRole === "ADMIN";
  const dashboardPath = isPortal ? "/admin" : "/";
  const route = resolveRoute(location.pathname);

  const [isCollapsed, toggleSidebar] = useSidebarCollapsed();
  const [theme, toggleTheme] = useTheme();
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  // Keep the active item visible in long project lists (the current project and its tabs).
  useEffect(() => {
    const active = document.querySelector<HTMLElement>('[data-testid="app-sidebar"] nav [aria-current="page"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandOpen((open) => !open);
      } else if (event.key === "[" && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target)) {
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [toggleSidebar]);

  const projectTabs = useMemo(() => {
    if (!projectData) {
      return [];
    }
    const { project, permissions } = projectData;
    const base = `/projects/${project.id}`;
    const tabs: Array<{ id: ProjectTab; label: string; to: string }> = [
      { id: "tasks", label: t("project_layout.tab_tasks"), to: base },
      { id: "sprints", label: t("project_layout.tab_sprints"), to: `${base}/sprints` },
      { id: "members", label: t("project_layout.tab_members"), to: `${base}/members` },
    ];
    if (permissions.canManageProject) {
      tabs.push({ id: "settings", label: t("project_layout.tab_settings"), to: `${base}/settings` });
    }
    if (permissions.canViewMemberReport || permissions.canViewProjectReport) {
      tabs.push({ id: "reports", label: t("project_layout.tab_reports"), to: `${base}/reports` });
    }
    return tabs;
  }, [projectData, t]);

  const currentProject = projectData?.project;
  const sidebarProjects = useMemo(() => {
    if (!currentProject || projects.some((project) => project.id === currentProject.id)) {
      return projects;
    }
    return [{ id: currentProject.id, name: currentProject.name, code: currentProject.code }, ...projects];
  }, [projects, currentProject]);

  const pageLabel: Record<Exclude<PageId, "project">, string> = {
    dashboard: t("nav.dashboard"),
    "my-tasks": t("nav.my_tasks"),
    calendar: t("nav.calendar"),
    notifications: t("nav.notifications"),
    profile: t("nav.profile"),
    projects: isPortal ? t("nav.projects") : t("nav.all_projects"),
    "admin-users": t("nav.users"),
    "admin-statuses": t("nav.statuses"),
    "admin-audit": t("nav.audit_log"),
  };

  let crumbs: BreadcrumbItem[];
  if (route.page === "project") {
    const tabLabel = projectTabs.find((tab) => tab.id === route.tab)?.label ?? t("project_layout.tab_tasks");
    crumbs = [
      { label: t("nav.projects"), to: "/projects" },
      ...(currentProject ? [{ label: currentProject.name, to: `/projects/${currentProject.id}` }] : []),
      { label: tabLabel },
    ];
  } else if (route.page.startsWith("admin-")) {
    crumbs = [{ label: t("nav.management") }, { label: pageLabel[route.page] }];
  } else {
    crumbs = [{ label: APP_NAME, to: dashboardPath }, { label: pageLabel[route.page] }];
  }

  const goto = (id: string, label: string, icon: IconName, to: string): CommandItem => ({
    id,
    label,
    icon,
    onSelect: () => {
      void navigate(to);
    },
  });

  // Quick-add and view switches target the open project, else the first one the user can see.
  const targetProject = currentProject ?? sidebarProjects[0] ?? null;
  const commandTasks = useCommandTasks(isCommandOpen, currentProject?.id ?? null);
  const switchView = (view: "list" | "board" | "timeline") => {
    if (targetProject) {
      void navigate(`/projects/${targetProject.id}${view === "list" ? "" : `?view=${view}`}`);
    }
  };
  const viewCommands: CommandItem[] = targetProject
    ? [
        {
          id: "view-list",
          icon: "layout-list",
          label: t("command.view_list"),
          onSelect: () => {
            switchView("list");
          },
        },
        {
          id: "view-board",
          icon: "kanban",
          label: t("command.view_board"),
          onSelect: () => {
            switchView("board");
          },
        },
        {
          id: "view-timeline",
          icon: "chart-gantt",
          label: t("command.view_timeline"),
          onSelect: () => {
            switchView("timeline");
          },
        },
      ]
    : [];

  const commandGroups: CommandGroup[] = [
    {
      title: t("command.group_goto"),
      items: [
        goto("go-dashboard", t("nav.dashboard"), "house", dashboardPath),
        goto("go-my-tasks", t("nav.my_tasks"), "square-check", "/my-tasks"),
        goto("go-calendar", t("nav.calendar"), "calendar", "/calendar"),
        goto("go-notifications", t("nav.notifications"), "bell", "/notifications"),
        goto("go-projects", pageLabel.projects, "folder-kanban", "/projects"),
        goto("go-profile", t("nav.profile"), "user", "/profile"),
        ...(isAdmin
          ? [
              goto("go-users", t("nav.users"), "users", "/admin/users"),
              goto("go-statuses", t("nav.statuses"), "layers", "/admin/statuses"),
              goto("go-audit", t("nav.audit_log"), "history", "/admin/audit-log"),
            ]
          : []),
        ...projectTabs.map((tab) =>
          goto(`go-tab-${tab.id}`, `${currentProject?.name ?? ""} · ${tab.label}`, "folder-kanban", tab.to),
        ),
      ],
    },
    {
      title: t("command.group_projects"),
      items: sidebarProjects.map((project) => ({
        ...goto(`go-project-${project.id}`, project.name, "folder", `/projects/${project.id}`),
        hint: project.code,
      })),
    },
    {
      title: t("command.group_commands"),
      items: [
        ...viewCommands,
        {
          id: "theme",
          icon: theme === "dark" ? "sun" : "moon",
          label: theme === "dark" ? t("command.theme_light") : t("command.theme_dark"),
          onSelect: toggleTheme,
        },
        {
          id: "language",
          icon: "globe",
          label: currentLang === "en" ? t("common.switch_to_vi") : t("common.switch_to_en"),
          onSelect: () => {
            switchTo(currentLang === "en" ? "vi" : "en");
          },
        },
        {
          id: "sidebar",
          icon: "panel-left",
          label: isCollapsed ? t("shell.expand_sidebar") : t("shell.collapse_sidebar"),
          kbd: ["["],
          onSelect: toggleSidebar,
        },
      ],
    },
    {
      title: t("command.group_tasks"),
      items: commandTasks.tasks.map((task) => ({
        id: `task-${task.id}`,
        iconEl: <StatusIcon category={statusGlyph(task.statusName, task.statusCategory)} />,
        label: task.title,
        hint: `${task.projectCode ?? currentProject?.code ?? ""}-${String(task.number)}`,
        onSelect: () => {
          void navigate(`/projects/${task.projectId}/tasks/${task.id}`);
        },
      })),
    },
  ];

  const openCommand = () => {
    setIsCommandOpen(true);
  };
  const isOn = (page: PageId) => route.page === page;
  const roleLabel = translateRole(t, user.systemRole);
  const avatarSrc = user.avatarKey ? `/api/avatars/${user.id}` : null;
  const avatarTestId = user.avatarKey ? "shell-avatar-img" : "shell-avatar-fallback";

  const footer = isCollapsed ? (
    <div className="flex flex-col items-center gap-1.5">
      <Link to="/profile" aria-label={t("nav.profile")} title={user.fullName}>
        <Avatar name={user.fullName} src={avatarSrc} size={22} data-testid={avatarTestId} />
      </Link>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-medium leading-none text-fg-muted">{t("common.language")}</span>
        <LanguageSwitcher />
      </div>
      <div className={`flex items-center gap-2 rounded-md p-1 ${isOn("profile") ? "bg-active" : "hover:bg-hover"}`}>
        <Link
          to="/profile"
          className="flex min-w-0 flex-1 items-center gap-2 no-underline hover:no-underline"
          aria-current={isOn("profile") ? "page" : undefined}
          data-testid="shell-profile-link"
        >
          <Avatar name={user.fullName} src={avatarSrc} size={24} data-testid={avatarTestId} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[12.5px] font-medium leading-[1.2] text-fg">{user.fullName}</span>
            <span className="truncate text-[11px] leading-[1.2] text-fg-muted">{`${roleLabel} · ${user.email}`}</span>
          </span>
        </Link>
        <Form method="post" action="/logout">
          <IconButton type="submit" icon="log-out" label={t("nav.sign_out")} size="xs" />
        </Form>
      </div>
    </div>
  );

  return (
    <div
      className="flex h-screen overflow-hidden bg-app text-fg"
      data-testid={isPortal ? "admin-shell" : "member-shell"}
    >
      <Sidebar
        collapsed={isCollapsed}
        onToggleCollapse={toggleSidebar}
        footer={footer}
        data-testid="app-sidebar"
        header={
          <WorkspaceSwitcher
            name={APP_NAME}
            initials={PRODUCT_INITIALS}
            to={dashboardPath}
            subtitle={isPortal ? t("nav.admin_portal") : t("nav.workspace")}
          />
        }
      >
        <SidebarSection>
          <SidebarItem icon="search" label={t("nav.search")} kbd="⌘K" onClick={openCommand} />
          <SidebarItem
            icon="bell"
            label={t("nav.notifications")}
            count={unreadCount || undefined}
            active={isOn("notifications")}
            to="/notifications"
          />
        </SidebarSection>

        {isPortal ? (
          <SidebarSection title={t("nav.management")}>
            <SidebarItem icon="house" label={t("nav.dashboard")} active={isOn("dashboard")} to="/admin" />
            <SidebarItem icon="folder-kanban" label={t("nav.projects")} active={isOn("projects")} to="/projects" />
            {isAdmin ? (
              <>
                <SidebarItem icon="users" label={t("nav.users")} active={isOn("admin-users")} to="/admin/users" />
                <SidebarItem
                  icon="layers"
                  label={t("nav.statuses")}
                  active={isOn("admin-statuses")}
                  to="/admin/statuses"
                />
                <SidebarItem
                  icon="history"
                  label={t("nav.audit_log")}
                  active={isOn("admin-audit")}
                  to="/admin/audit-log"
                />
              </>
            ) : null}
          </SidebarSection>
        ) : null}

        <SidebarSection title={isPortal ? t("nav.personal") : undefined}>
          {isPortal ? null : <SidebarItem icon="house" label={t("nav.dashboard")} active={isOn("dashboard")} to="/" />}
          <SidebarItem icon="square-check" label={t("nav.my_tasks")} active={isOn("my-tasks")} to="/my-tasks" />
          <SidebarItem icon="calendar" label={t("nav.calendar")} active={isOn("calendar")} to="/calendar" />
          {isPortal ? null : (
            <SidebarItem icon="folder-kanban" label={t("nav.all_projects")} active={isOn("projects")} to="/projects" />
          )}
        </SidebarSection>

        {sidebarProjects.length > 0 ? (
          <SidebarSection title={t("nav.projects")}>
            {sidebarProjects.map((project) => {
              const isCurrent = route.page === "project" && route.projectId === project.id;
              const showTabs = isCurrent && currentProject?.id === project.id && !isCollapsed;
              return (
                <div key={project.id} className="flex flex-col gap-px">
                  <SidebarItem
                    dot={projectDot(project.code)}
                    label={project.name}
                    to={`/projects/${project.id}`}
                    active={isCurrent && !showTabs}
                    data-testid={`sidebar-project-${project.code}`}
                  />
                  {showTabs
                    ? projectTabs.map((tab) => (
                        <SidebarItem
                          key={tab.id}
                          depth={1}
                          label={tab.label}
                          to={tab.to}
                          active={route.tab === tab.id}
                          data-testid={`sidebar-tab-${tab.id}`}
                        />
                      ))
                    : null}
                </div>
              );
            })}
          </SidebarSection>
        ) : null}
      </Sidebar>

      <div className="relative flex min-w-0 flex-1 flex-col bg-surface">
        <header
          data-testid="topbar"
          className="flex h-[var(--topbar-height)] shrink-0 items-center gap-2.5 border-b border-line pl-5 pr-3"
        >
          <Breadcrumb items={crumbs} className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={openCommand}
            data-testid="topbar-search"
            className="inline-flex h-7 w-[220px] shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line-default bg-subtle pl-[9px] pr-1.5 text-[12.5px] leading-none text-fg-muted hover:text-fg-secondary"
          >
            <Icon name="search" size={14} />
            <span className="flex-1 whitespace-nowrap text-left">{t("shell.search_placeholder")}</span>
            <Kbd keys={["⌘", "K"]} size="xs" />
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <CommandBar
        open={isCommandOpen}
        onClose={() => {
          setIsCommandOpen(false);
        }}
        groups={commandGroups}
        placeholder={t("command.placeholder")}
        onCreate={
          targetProject
            ? (title) => {
                commandTasks.createTask(targetProject.id, title);
              }
            : undefined
        }
        // Inside a project the target is implicit (as in the kit); elsewhere name the project it goes to.
        createLabel={
          !currentProject && targetProject ? t("command.create_task_in", { code: targetProject.code }) : undefined
        }
      />
      <Toast
        text={commandTasks.createError ?? undefined}
        id={commandTasks.createResult}
        data-testid="command-create-error"
      />
    </div>
  );
}
