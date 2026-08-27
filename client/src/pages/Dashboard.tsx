import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { ScrapeResult, Stats } from '../types';
import { ScoreBadge, SourceTag, fmtDate } from '../components/bits';

const FUNNEL: Array<{ key: keyof Stats['byStatus']; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'pitched', label: 'Pitched' },
  { key: 'replied', label: 'Replied' },
  { key: 'won', label: 'Won' },
];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeResults, setScrapeResults] = useState<ScrapeResult[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Stats>('/api/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function scrapeNow() {
    setScraping(true);
    setError('');
    setScrapeResults(null);
    try {
      const res = await api<{ results: ScrapeResult[] }>('/api/scrape', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setScrapeResults(res.results);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScraping(false);
    }
  }

  return (
    <div>
      <header className="page-head">
        <h1>Dashboard</h1>
        <button className="btn btn-primary" onClick={scrapeNow} disabled={scraping}>
          {scraping ? 'Scraping…' : '⟳ Scrape all sources'}
        </button>
      </header>

      {error && <div className="error-box">{error}</div>}

      {scrapeResults && (
        <div className="card scrape-report">
          {scrapeResults.map((r) => (
            <div key={r.source} className="scrape-row">
              <strong>{r.source}</strong>
              {r.error ? (
                <span className="error-text">{r.error}</span>
              ) : (
                <span>
                  {r.fetched} fetched · {r.inserted} new · {r.updated} updated
                </span>
              )}
            </div>
          ))}
        </div>
      )}

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
