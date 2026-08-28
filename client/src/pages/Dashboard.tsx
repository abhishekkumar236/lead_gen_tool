import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isAbort } from '../api';
import { useSections, withSection } from '../SectionContext';
import type { Stats } from '../types';
import { ScoreBadge, SourceTag, fmtDate } from '../components/bits';

const FUNNEL: Array<{ key: keyof Stats['byStatus']; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'pitched', label: 'Pitched' },
  { key: 'replied', label: 'Replied' },
  { key: 'won', label: 'Won' },
];

export default function Dashboard({ refreshKey }: { refreshKey: number }) {
  const { active, activeName } = useSections();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    const params = withSection(new URLSearchParams(), active);
    api<Stats>(`/api/stats?${params}`, { signal: ctrl.signal })
      .then(setStats)
      .catch((e) => !isAbort(e) && setError(e.message));
  }, [active]);

  useEffect(load, [load, refreshKey]);

  return (
    <div>
      <header className="page-head">
        <h1>Dashboard <span className="muted">· {activeName}</span></h1>
      </header>

      {error && <div className="error-box">{error}</div>}

      <section className="funnel">
        {FUNNEL.map((f) => (
          <div key={f.key} className="card stat-card">
            <div className="stat-num">{stats?.byStatus[f.key] ?? 0}</div>
            <div className="stat-label">{f.label}</div>
          </div>
        ))}
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Follow-ups due</h2>
          {!stats?.followUpsDue.length && <p className="muted">Nothing due. Nice.</p>}
          {stats?.followUpsDue.map((l) => (
            <Link to="/leads" key={l._id} className="mini-lead">
              <span className="mini-title">{l.title}</span>
              <span className="muted">{fmtDate(l.followUpAt)}</span>
            </Link>
          ))}
        </section>

        <section className="card">
          <h2>Hottest new leads</h2>
          {!stats?.topNew.length && <p className="muted">Run a scrape to fill this.</p>}
          {stats?.topNew.map((l) => (
            <Link to="/leads" key={l._id} className="mini-lead">
              <ScoreBadge score={l.score} />
              <span className="mini-title">{l.title}</span>
              <SourceTag source={l.source} />
            </Link>
          ))}
        </section>
      </div>

      <section className="card">
        <h2>Leads by source</h2>
        <div className="source-counts">
          {Object.entries(stats?.bySource ?? {}).map(([s, n]) => (
            <div key={s} className="source-count">
              <SourceTag source={s as never} /> <strong>{n}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
