import { useState } from 'react';
import { api } from '../api';
import { useSections } from '../SectionContext';
import type { ScrapeResult } from '../types';

export default function Topbar({ onScraped }: { onScraped?(): void }) {
  const { activeName, activeCount, reload } = useSections();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ScrapeResult[] | null>(null);
  const [err, setErr] = useState('');

  async function scrape() {
    setBusy(true);
    setErr('');
    setResults(null);
    try {
      const res = await api<{ results: ScrapeResult[] }>('/api/scrape', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setResults(res.results);
      await reload();
      onScraped?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const added = results?.reduce((n, r) => n + r.inserted, 0) ?? 0;

  return (
    <header className="topbar">
      <div className="topbar-title">
        <strong>{activeName}</strong>
        <span className="muted">{activeCount} leads</span>
      </div>

      <div className="topbar-actions">
        {err && <span className="error-text small">{err}</span>}
        {results && !err && (
          <span className="small muted" title={results.map((r) => `${r.source}: ${r.error ?? `${r.inserted} new`}`).join('\n')}>
            {added > 0 ? `+${added} new leads` : 'no new leads'}
            {results.some((r) => r.error) && <span className="error-text"> · some sources failed</span>}
          </span>
        )}
        <button className="btn btn-primary" onClick={scrape} disabled={busy}>
          {busy ? 'Scraping…' : '⟳ Scrape sources'}
        </button>
      </div>
    </header>
  );
}
