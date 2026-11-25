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
  const [location, setLocation] = useState('');
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
  // Multi-select, file-explorer style: tick rows, shift-click for a range.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const lastClicked = useRef<number | null>(null); // row index the next shift-click ranges from
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const headerBox = useRef<HTMLInputElement>(null);

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    if (minScore) params.set('minScore', minScore);
    if (location) params.set('location', location);
    if (q.trim()) params.set('q', q.trim());
    if (sort !== SORTS[0].value) params.set('sort', sort);
    return withSection(params, active);
  }, [status, source, minScore, location, q, sort, active]);

  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setLoading(true);
    try {
      const data = await api<Lead[]>(`/api/leads?${query()}`, { signal: ctrl.signal });
      setLeads(data);
      // Keep only ticks on rows still on screen, so nothing hidden can be deleted.
      const shown = new Set(data.map((l) => l._id));
      setChecked((prev) => new Set([...prev].filter((id) => shown.has(id))));
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

  // New filters, sort or section → a different list, so start with nothing ticked.
  useEffect(() => {
    setChecked(new Set());
    lastClicked.current = null;
  }, [query]);

  const allChecked = leads.length > 0 && leads.every((l) => checked.has(l._id));
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = checked.size > 0 && !allChecked;
  }, [checked, allChecked]);

  // Esc clears the selection, unless a dialog is open (Esc closes that instead).
  useEffect(() => {
    if (checked.size === 0 || selected || bulkOpen || purge) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setChecked(new Set());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [checked.size, selected, bulkOpen, purge]);

  /**
   * Click toggles one row. Shift-click sets every row from the last clicked one
   * to this one to this row's new state, e.g. tick row 2, shift-click row 6 →
   * rows 2–6 ticked.
   */
  function toggleRow(index: number, shift: boolean) {
    const turnOn = !checked.has(leads[index]._id);
    const from = shift && lastClicked.current !== null ? Math.min(lastClicked.current, index) : index;
    const to = shift && lastClicked.current !== null ? Math.max(lastClicked.current, index) : index;
    setChecked((prev) => {
      const next = new Set(prev);
      for (const l of leads.slice(from, to + 1)) {
        if (turnOn) next.add(l._id);
        else next.delete(l._id);
      }
      return next;
    });
    lastClicked.current = index;
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(leads.map((l) => l._id)));
    lastClicked.current = null;
  }

  const checkedLeads = leads.filter((l) => checked.has(l._id));
  // Leads you've already worked on; the confirm dialog calls them out.
  const worked = checkedLeads.filter((l) => l.status !== 'new' || l.notes.length > 0).length;

  async function runBulkDelete() {
    setBulkDeleting(true);
    try {
      const ids = [...checked];
      const { deleted } = await api<{ deleted: number }>('/api/leads/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      const gone = new Set(ids);
      setLeads((ls) => ls.filter((l) => !gone.has(l._id)));
      setChecked(new Set());
      lastClicked.current = null;
      setBulkOpen(false);
      setPurged(deleted);
      await reloadSections();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkDeleting(false);
    }
  }

  function applyUpdate(updated: Lead) {
    setLeads((ls) => ls.map((l) => (l._id === updated._id ? updated : l)));
    setSelected(updated);
  }

  async function remove(id: string) {
    await api(`/api/leads/${id}`, { method: 'DELETE' });
    setLeads((ls) => ls.filter((l) => l._id !== id));
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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
              {purged === 0 ? 'nothing to remove' : `deleted ${purged} lead${purged === 1 ? '' : 's'}`}
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
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          title="Open to India: an Indian city or India in the post, or a remote job open worldwide"
        >
          <option value="">Anywhere</option>
          <option value="india">Open to India</option>
          <option value="ncr">Delhi NCR</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} title="Sort order">
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {error && <div className="error-box">{error}</div>}

      {checked.size > 0 && (
        <div className="card selection-bar">
          <strong>{checked.size}</strong>&nbsp;selected
          <span className="muted small">· shift-click to select a range · Esc to clear</span>
          <span className="selection-actions">
            <button className="btn" onClick={() => setChecked(new Set())}>Clear selection</button>
            <button className="btn btn-danger btn-danger-fill" onClick={() => setBulkOpen(true)}>
              🗑 Delete selected
            </button>
          </span>
        </div>
      )}

      <div className="card table-wrap">
        <table className="lead-table">
          <thead>
            <tr>
              <th className="cell-check">
                <input
                  ref={headerBox}
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  disabled={leads.length === 0}
                  title={allChecked ? 'Clear selection' : `Select all ${leads.length} shown`}
                  aria-label="Select all shown leads"
                />
              </th>
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
            {leads.map((l, i) => (
              <tr
                key={l._id}
                className={checked.has(l._id) ? 'row-checked' : undefined}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', l._id)}
                onClick={() => setSelected(l)}
              >
                {/* The whole cell is the hit area; it never opens the lead. */}
                <td
                  className="cell-check"
                  onMouseDown={(e) => e.shiftKey && e.preventDefault()} // no text selection on shift-click
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRow(i, e.shiftKey);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(l._id)}
                    readOnly
                    aria-label={`Select ${l.title}`}
                  />
                </td>
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

      {bulkOpen && (
        <ConfirmDialog
          title={`Delete ${checked.size} selected lead${checked.size === 1 ? '' : 's'}?`}
          confirmLabel={`Delete ${checked.size}`}
          busy={bulkDeleting}
          onConfirm={runBulkDelete}
          onCancel={() => setBulkOpen(false)}
        >
          <p>This can't be undone. A later scrape may bring a deleted post back if it's still listed.</p>
          {worked > 0 && (
            <p>
              <strong>{worked}</strong> of them {worked === 1 ? 'has' : 'have'} a status beyond New
              or notes — {worked === 1 ? 'that history goes' : 'their history goes'} too.
            </p>
          )}
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
