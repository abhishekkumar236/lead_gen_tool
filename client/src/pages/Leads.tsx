import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isAbort } from '../api';
import { useSections, withSection } from '../SectionContext';
import type { Lead } from '../types';
import { SOURCE_LABELS, STATUS_LABELS } from '../types';
import { ScoreBadge, SourceTag, StatusPill, fmtDate } from '../components/bits';
import LeadModal from '../components/LeadModal';
import ConfirmDialog from '../components/ConfirmDialog';

/** Posts older than this are considered dead — nobody's still hiring off a month-old thread. */
const STALE_DAYS = 30;

/** Values the API's `?sort=` whitelist accepts. Undated posts sort last under "newest". */
const SORTS = [
  { value: '-score', label: 'Best score' },
  { value: '-postedAt', label: 'Newest posted' },
  { value: 'postedAt', label: 'Oldest posted' },
  { value: '-scrapedAt', label: 'Recently scraped' },
] as const;

export default function Leads({ refreshKey }: { refreshKey: number }) {
  const { active, activeName, sections, reload: reloadSections } = useSections();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [minScore, setMinScore] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<string>(SORTS[0].value);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Purge flow: count first, and only open the confirm when there's something to delete.
  const [purge, setPurge] = useState<{ count: number } | null>(null);
  const [counting, setCounting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purged, setPurged] = useState<number | null>(null);

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    if (minScore) params.set('minScore', minScore);
    if (q.trim()) params.set('q', q.trim());
    if (sort !== SORTS[0].value) params.set('sort', sort);
    return withSection(params, active);
  }, [status, source, minScore, q, sort, active]);

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

  // Scoped like Export: the purge only touches the section you're looking at.
  const staleQuery = () =>
    withSection(new URLSearchParams({ days: String(STALE_DAYS) }), active);

  async function openPurge() {
    setPurged(null);
    setCounting(true);
    try {
      const { count } = await api<{ count: number }>(`/api/leads/stale?${staleQuery()}`);
      if (count === 0) setPurged(0);
      else setPurge({ count });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCounting(false);
    }
  }

  async function runPurge() {
    setPurging(true);
    try {
      const { deleted } = await api<{ deleted: number }>(`/api/leads/stale?${staleQuery()}`, {
        method: 'DELETE',
      });
      setPurge(null);
      setPurged(deleted);
      await Promise.all([load(), reloadSections()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPurging(false);
    }
  }

  const sectionName = (id: string | null) =>
    id ? (sections.find((s) => s._id === id)?.name ?? '—') : 'Unsorted';

  return (
    <div>
      <header className="page-head">
        <h1>
          {activeName} <span className="muted">({leads.length})</span>
        </h1>
        <div className="page-actions">
          {purged !== null && (
            <span className="small muted">
              {purged === 0 ? 'nothing to remove' : `removed ${purged} old lead${purged === 1 ? '' : 's'}`}
            </span>
          )}
          <button
            className="btn btn-danger"
            onClick={openPurge}
            disabled={counting}
            title={`Remove untouched leads posted more than ${STALE_DAYS} days ago`}
          >
            {counting ? 'Counting…' : '🗑 Delete old leads'}
          </button>
          {/* Content-Disposition on the endpoint turns this into a file download. */}
          <a
            className={`btn ${leads.length === 0 ? 'btn-disabled' : ''}`}
            href={`/api/leads/export?${query()}`}
            title="Download the leads below, with the filters you have applied"
          >
            ⭳ Export to Excel
          </a>
        </div>
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
        <select value={sort} onChange={(e) => setSort(e.target.value)} title="Sort order">
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
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
              <th
                className="th-sort"
                title="Sort by posting date"
                onClick={() => setSort(sort === '-postedAt' ? 'postedAt' : '-postedAt')}
              >
                Posted {sort === '-postedAt' ? '↓' : sort === 'postedAt' ? '↑' : ''}
              </th>
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

      {purge && (
        <ConfirmDialog
          title={`Delete leads older than ${STALE_DAYS} days?`}
          confirmLabel={`Delete ${purge.count} lead${purge.count === 1 ? '' : 's'}`}
          busy={purging}
          onConfirm={runPurge}
          onCancel={() => setPurge(null)}
        >
          <p>
            <strong>{purge.count}</strong> lead{purge.count === 1 ? '' : 's'} in{' '}
            <strong>{activeName}</strong> {purge.count === 1 ? 'was' : 'were'} posted more than{' '}
            {STALE_DAYS} days ago and never touched.
          </p>
          <p>
            Only leads still marked <strong>New</strong> with no notes are removed. Anything
            shortlisted, pitched, replied, won, lost or archived stays.
          </p>
        </ConfirmDialog>
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
