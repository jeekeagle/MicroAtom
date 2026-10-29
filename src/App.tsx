import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectStudioPage } from './pages/ProjectStudioPage';
import { AgentsPage } from './pages/AgentsPage';
import { SkillsPage } from './pages/SkillsPage';
import { EnginesPage } from './pages/EnginesPage';
import { MemoryPage } from './pages/MemoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoaderCircle } from 'lucide-react';

function AppRoutes() {
  const { loading, error, refresh } = useApp();

  if (loading) {
    return (
      <div className="app-loading">
        <span className="loading-mark">
          <span />
          <span />
        </span>
        <p>正在打开课程生产台</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-error">
        <span className="error-code">SERVICE / OFFLINE</span>
        <h1>课序服务未连接</h1>
        <p>{error}</p>
        <button className="button button-primary button-md" onClick={() => void refresh()}>
          <LoaderCircle size={16} />
          重新连接
        </button>
      </div>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectStudioPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/engines" element={<EnginesPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
