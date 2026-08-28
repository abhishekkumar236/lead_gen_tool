import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isAbort } from '../api';
import { useSections, withSection } from '../SectionContext';
import type { Lead } from '../types';
import { SOURCE_LABELS, STATUS_LABELS } from '../types';
import { ScoreBadge, SourceTag, StatusPill, fmtDate } from '../components/bits';
import LeadModal from '../components/LeadModal';

export default function Leads({ refreshKey }: { refreshKey: number }) {
  const { active, activeName, sections, reload: reloadSections } = useSections();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [minScore, setMinScore] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    if (minScore) params.set('minScore', minScore);
    if (q.trim()) params.set('q', q.trim());
    return withSection(params, active);
  }, [status, source, minScore, q, active]);

  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setLoading(true);
    try {
      const data = await api<Lead[]>(`/api/leads?${query()}`, { signal: ctrl.signal });
      setLeads(data);
      setError('');
    } catch (e) {
      if (isAbort(e)) return; // a newer request took over
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (inFlight.current === ctrl) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q, refreshKey]);

  function applyUpdate(updated: Lead) {
    setLeads((ls) => ls.map((l) => (l._id === updated._id ? updated : l)));
    setSelected(updated);
  }

  async function remove(id: string) {
    await api(`/api/leads/${id}`, { method: 'DELETE' });
    setLeads((ls) => ls.filter((l) => l._id !== id));
    setSelected(null);
    reloadSections();
  }

  const sectionName = (id: string | null) =>
    id ? (sections.find((s) => s._id === id)?.name ?? '—') : 'Unsorted';

  return (
    <div>
      <header className="page-head">
        <h1>
          {activeName} <span className="muted">({leads.length})</span>
        </h1>
        {/* Content-Disposition on the endpoint turns this into a file download. */}
        <a
          className={`btn ${leads.length === 0 ? 'btn-disabled' : ''}`}
          href={`/api/leads/export?${query()}`}
          title="Download the leads below, with the filters you have applied"
        >
          ⭳ Export to Excel
        </a>
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

      <div className="card table-wrap">
        <table className="lead-table">
          <thead>
            <tr>
              <th>Score</th>
              <th>Title</th>
              <th>Source</th>
              {!active && <th>Section</th>}
              <th>Email</th>
              <th>Budget</th>
              <th>Posted</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr
                key={l._id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', l._id)}
                onClick={() => setSelected(l)}
              >
                <td><ScoreBadge score={l.score} /></td>
                <td>
                  <div className="cell-title">{l.title}</div>
                  {l.company && <div className="muted small">{l.company}</div>}
                </td>
                <td><SourceTag source={l.source} /></td>
                {!active && <td className="small muted">{sectionName(l.sectionId)}</td>}
                <td className="small">{l.contactEmail || <span className="muted">—</span>}</td>
                <td className="small">{l.budgetText || <span className="muted">—</span>}</td>
                <td className="small">{fmtDate(l.postedAt)}</td>
                <td><StatusPill status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && leads.length === 0 && (
        <p className="muted empty">
          No leads here. Clear the filters, pick another section, or run a scrape.
        </p>
      )}

      {selected && (
        <LeadModal
          lead={selected}
          onClose={() => setSelected(null)}
          onChange={applyUpdate}
          onDelete={remove}
        />
      )}
    </div>
  );
}
