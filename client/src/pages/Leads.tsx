import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Lead } from '../types';
import { SOURCE_LABELS, STATUS_LABELS } from '../types';
import { ScoreBadge, SourceTag, StatusPill, fmtDate } from '../components/bits';
import LeadDrawer from '../components/LeadDrawer';

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [minScore, setMinScore] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    if (minScore) params.set('minScore', minScore);
    if (q.trim()) params.set('q', q.trim());
    try {
      setLeads(await api<Lead[]>(`/api/leads?${params}`));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status, source, minScore, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  function applyUpdate(updated: Lead) {
    setLeads((ls) => ls.map((l) => (l._id === updated._id ? updated : l)));
    setSelected(updated);
  }

  async function remove(id: string) {
    await api(`/api/leads/${id}`, { method: 'DELETE' });
    setLeads((ls) => ls.filter((l) => l._id !== id));
    setSelected(null);
  }

  return (
    <div>
      <header className="page-head">
        <h1>Leads {leads.length > 0 && <span className="muted">({leads.length})</span>}</h1>
      </header>

      <div className="filters card">
        <input placeholder="Search title/description…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={minScore} onChange={(e) => setMinScore(e.target.value)}>
          <option value="">Any score</option>
          <option value="60">Hot (60+)</option>
          <option value="35">Warm (35+)</option>
        </select>
      </div>

      {error && <div className="error-box">{error}</div>}

      <table className="lead-table card">
        <thead>
          <tr>
            <th>Score</th>
            <th>Title</th>
            <th>Source</th>
            <th>Email</th>
            <th>Budget</th>
            <th>Posted</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l._id} onClick={() => setSelected(l)}>
              <td><ScoreBadge score={l.score} /></td>
              <td>
                <div className="cell-title">{l.title}</div>
                {l.company && <div className="muted small">{l.company}</div>}
              </td>
              <td><SourceTag source={l.source} /></td>
              <td className="small">{l.contactEmail || <span className="muted">—</span>}</td>
              <td className="small">{l.budgetText || <span className="muted">—</span>}</td>
              <td className="small">{fmtDate(l.postedAt)}</td>
              <td><StatusPill status={l.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {!loading && leads.length === 0 && (
        <p className="muted empty">No leads match. Try clearing filters, or run a scrape from the Dashboard.</p>
      )}

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onChange={applyUpdate}
          onDelete={remove}
        />
      )}
    </div>
  );
}
