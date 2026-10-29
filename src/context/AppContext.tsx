import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import { api } from '../lib/api';
import type { BootstrapData, CourseMode } from '../types';

type ToastTone = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  tone: ToastTone;
}

interface AppContextValue {
  data: BootstrapData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: (data: BootstrapData) => void;
  showToast: (message: string, tone?: ToastTone) => void;
  createProjectOpen: boolean;
  setCreateProjectOpen: (open: boolean) => void;
  createMode: CourseMode;
  openCreateProject: (mode?: CourseMode) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CourseMode>('auto');

  const refresh = useCallback(async () => {
    try {
      const next = await api.bootstrap();
      setData(next);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法连接课序服务');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ message, tone });
  }, []);

  const openCreateProject = useCallback((mode: CourseMode = 'auto') => {
    setCreateMode(mode);
    setCreateProjectOpen(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <AppContext.Provider
      value={{
        data,
        loading,
        error,
        refresh,
        setData,
        showToast,
        createProjectOpen,
        setCreateProjectOpen,
        createMode,
        openCreateProject
      }}
    >
      {children}
      <div className={`toast ${toast ? 'is-visible' : ''} ${toast ? `tone-${toast.tone}` : ''}`}>
        {toast?.message}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
