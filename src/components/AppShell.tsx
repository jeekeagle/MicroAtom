import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AudioLines,
  Brain,
  Boxes,
  ChevronRight,
  Clapperboard,
  Command,
  Cpu,
  FilePenLine,
  FolderKanban,
  Gauge,
  Layers3,
  Menu,
  PanelsTopLeft,
  Plus,
  Search,
  Settings,
  Sparkles,
  X
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { modeShortLabel } from '../lib/format';
import type { CourseProject } from '../types';
import { CreateProjectModal } from './CreateProjectModal';
import { RuntimeDrawer } from './RuntimeDrawer';
import { Button, IconButton } from './ui';

interface NavItem {
  label: string;
  to: string;
  icon: typeof Gauge;
  exact?: boolean;
  matchQuery?: string;
}

const primaryNav: NavItem[] = [
  { label: '工作台', to: '/', icon: Gauge, exact: true },
  { label: '课程项目', to: '/projects', icon: FolderKanban },
  { label: '讲稿工坊', to: '/projects?stage=script', icon: FilePenLine, matchQuery: 'script' },
  { label: '课件工坊', to: '/projects?stage=slides', icon: Layers3, matchQuery: 'slides' },
  { label: '声音与录制', to: '/projects?stage=audio', icon: AudioLines, matchQuery: 'audio' },
  { label: '成片交付', to: '/projects?stage=render', icon: Clapperboard, matchQuery: 'render' }
];

const platformNav: NavItem[] = [
  { label: '智能体', to: '/agents', icon: Sparkles },
  { label: 'Skill 库', to: '/skills', icon: Boxes },
  { label: '引擎工坊', to: '/engines', icon: Cpu },
  { label: '介质工坊', to: '/media-workshop', icon: PanelsTopLeft },
  { label: '教师记忆', to: '/memory', icon: Brain }
];

const routeTitle = (pathname: string) => {
  if (pathname === '/') return '工作台';
  if (pathname.startsWith('/projects/')) return '课程工作台';
  if (pathname === '/projects') return '课程项目';
  if (pathname === '/agents') return '智能体平台';
  if (pathname === '/skills') return 'Skill 库';
  if (pathname === '/engines') return '引擎工坊';
  if (pathname === '/media-workshop') return '介质工坊';
  if (pathname === '/memory') return '教师记忆';
  if (pathname === '/settings') return '运行设置';
  return '课序';
};

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.exact}
      onClick={onNavigate}
      className={({ isActive }) => `side-link ${isActive ? 'is-active' : ''}`}
    >
      <item.icon size={17} strokeWidth={1.8} />
      <span>{item.label}</span>
      <span className="side-link-rail" />
    </NavLink>
  );
}

function RecentProject({ project, onNavigate }: { project: CourseProject; onNavigate: () => void }) {
  return (
    <Link to={`/projects/${project.id}`} className="recent-project" onClick={onNavigate}>
      <span className={`recent-tone tone-${project.coverTone}`} />
      <span className="recent-copy">
        <strong>{project.title}</strong>
        <small>
          {modeShortLabel[project.mode]} · {project.progress}%
        </small>
      </span>
      <ChevronRight size={14} />
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data, openCreateProject } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setQuery('');
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const searchResults = useMemo<{
    nav: NavItem[];
    projects: CourseProject[];
  }>(() => {
    if (!data) return { nav: [], projects: [] };
    const q = query.trim().toLowerCase();
    const nav = [...primaryNav, ...platformNav].filter(
      (item) => !q || item.label.toLowerCase().includes(q)
    );
    const projects = data.projects
      .filter(
        (project) =>
          !q ||
          project.title.toLowerCase().includes(q) ||
          project.subject.toLowerCase().includes(q) ||
          project.topic.toLowerCase().includes(q)
      )
      .slice(0, q ? 8 : 4);
    return { nav, projects };
  }, [data, query]);

  const navigateTo = (to: string) => {
    navigate(to);
    setSearchOpen(false);
    setMobileOpen(false);
  };

  return (
    <div className="app-frame">
      {mobileOpen && <button className="sidebar-scrim" aria-label="关闭目录" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <Link to="/" className="brand-lockup" aria-label="课序首页">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="brand-copy">
              <strong>课序</strong>
              <small>COURSE SEQUENCE</small>
            </span>
          </Link>
          <IconButton label="关闭目录" className="sidebar-close" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="sidebar-body">
          <nav className="side-nav" aria-label="功能目录">
            <div className="side-group">
              <span className="side-group-label">生产</span>
              {primaryNav.map((item) => (
                <SidebarLink key={item.label} item={item} onNavigate={() => setMobileOpen(false)} />
              ))}
            </div>
            <div className="side-group">
              <span className="side-group-label">智能体平台</span>
              {platformNav.map((item) => (
                <SidebarLink key={item.label} item={item} onNavigate={() => setMobileOpen(false)} />
              ))}
            </div>
          </nav>

          <div className="recent-block">
            <div className="recent-head">
              <span>最近课程</span>
              <Link to="/projects" onClick={() => setMobileOpen(false)}>
                全部
              </Link>
            </div>
            <div className="recent-list">
              {data?.projects.slice(0, 3).map((project) => (
                <RecentProject key={project.id} project={project} onNavigate={() => setMobileOpen(false)} />
              ))}
            </div>
          </div>
        </div>

        <div className="sidebar-foot">
          <div className="runtime-indicator">
            <span className="runtime-pulse" />
            <div>
              <strong>编排服务在线</strong>
              <small>{data?.skills.filter((skill) => skill.enabled).length ?? 0} 个 Skill 可用</small>
            </div>
          </div>
          <Link to="/settings" className="sidebar-settings" onClick={() => setMobileOpen(false)}>
            <Settings size={16} />
            运行设置
          </Link>
          <div className="user-line">
            <span className="avatar">{data?.memory.name.slice(0, 1) || '师'}</span>
            <div>
              <strong>{data?.memory.name || '教师'}</strong>
              <small>{data?.memory.school || '课程设计者'}</small>
            </div>
            <span className="user-status" />
          </div>
        </div>
      </aside>

      <div className="app-column">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton label="打开功能目录" className="mobile-menu" onClick={() => setMobileOpen(true)}>
              <Menu size={20} />
            </IconButton>
            <div className="page-location">
              <span>课序</span>
              <ChevronRight size={13} />
              <strong>{routeTitle(location.pathname)}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setSearchOpen(true)}>
              <Search size={16} />
              <span>搜索课程、Skill</span>
              <kbd>
                <Command size={11} />K
              </kbd>
            </button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => openCreateProject()}
            >
              新建微课
            </Button>
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>

      {searchOpen && (
        <div className="command-backdrop" onMouseDown={() => setSearchOpen(false)}>
          <div className="command-panel" onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-input">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入课程名称、学科或模块"
                autoFocus
              />
              <kbd>ESC</kbd>
            </div>
            <div className="command-results">
              {query && searchResults.nav?.length > 0 && (
                <div className="command-group">
                  <span className="command-label">模块</span>
                  {searchResults.nav.map((item) => (
                    <button key={item.label} onClick={() => navigateTo(item.to)}>
                      <item.icon size={16} />
                      <span>{item.label}</span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              )}
              <div className="command-group">
                <span className="command-label">课程项目</span>
                {searchResults.projects?.length ? (
                  searchResults.projects.map((project) => (
                    <button key={project.id} onClick={() => navigateTo(`/projects/${project.id}`)}>
                      <span className={`command-tone tone-${project.coverTone}`} />
                      <span className="command-project-copy">
                        <strong>{project.title}</strong>
                        <small>
                          {project.subject} · {project.grade}
                        </small>
                      </span>
                      <span className="command-project-progress">{project.progress}%</span>
                    </button>
                  ))
                ) : (
                  <p className="command-empty">没有匹配的课程</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <CreateProjectModal />
      <RuntimeDrawer />
    </div>
  );
}
