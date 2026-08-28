import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { SectionList } from './types';
import { UNSORTED } from './types';

const STORAGE_KEY = 'leadforge.activeSection';

interface Ctx extends SectionList {
  /** A section id, `UNSORTED`, or '' for "everything across all sections". */
  active: string;
  setActive(id: string): void;
  activeName: string;
  activeCount: number;
  reload(): Promise<void>;
  loading: boolean;
}

const SectionCtx = createContext<Ctx | null>(null);

export function SectionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SectionList>({ sections: [], unsortedCount: 0, total: 0 });
  const [active, setActiveState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setData(await api<SectionList>('/api/sections'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setActive = useCallback((id: string) => {
    setActiveState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  // A section deleted in another tab (or this one) shouldn't strand the app on
  // a filter that now matches nothing.
  useEffect(() => {
    if (loading || !active || active === UNSORTED) return;
    if (!data.sections.some((s) => s._id === active)) setActive('');
  }, [data.sections, active, loading, setActive]);

  const activeName =
    active === '' ? 'All leads'
    : active === UNSORTED ? 'Unsorted'
    : (data.sections.find((s) => s._id === active)?.name ?? 'All leads');

  const activeCount =
    active === '' ? data.total
    : active === UNSORTED ? data.unsortedCount
    : (data.sections.find((s) => s._id === active)?.count ?? 0);

  return (
    <SectionCtx.Provider
      value={{ ...data, active, setActive, activeName, activeCount, reload, loading }}
    >
      {children}
    </SectionCtx.Provider>
  );
}

export function useSections(): Ctx {
  const ctx = useContext(SectionCtx);
  if (!ctx) throw new Error('useSections must be used inside SectionProvider');
  return ctx;
}

/** Appends the active section to a query string, omitting it for "All leads". */
export function withSection(params: URLSearchParams, active: string): URLSearchParams {
  if (active) params.set('section', active);
  return params;
}
