import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSections } from '../SectionContext';
import type { Lead, LeadStatus, Template } from '../types';
import { STATUS_LABELS } from '../types';
import { ScoreBadge, SourceTag, fmtDate } from './bits';
import ConfirmDialog from './ConfirmDialog';

const STATUS_FLOW: LeadStatus[] = ['new', 'shortlisted', 'pitched', 'replied', 'won', 'lost'];

interface Props {
  lead: Lead;
  onClose(): void;
  onChange(updated: Lead): void;
  onDelete(id: string): void | Promise<void>;
}

export default function LeadModal({ lead, onClose, onChange, onDelete }: Props) {
  const { sections, reload: reloadSections } = useSections();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [pitch, setPitch] = useState<{ subject: string; body: string; to: string } | null>(null);
  const [note, setNote] = useState('');
  const [emailEdit, setEmailEdit] = useState(lead.contactEmail);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'post' | 'pitch' | 'notes'>('post');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const params = lead.sectionId ? `?section=${lead.sectionId}` : '';
    api<Template[]>(`/api/templates${params}`).then((ts) => {
      setTemplates(ts);
      setTemplateId((cur) => (ts.some((t) => t._id === cur) ? cur : (ts[0]?._id ?? '')));
    });
  }, [lead.sectionId]);

  useEffect(() => {
    setEmailEdit(lead.contactEmail);
    setPitch(null);
    setTab('post');
  }, [lead._id, lead.contactEmail]);

  useEffect(() => {
    if (confirmDelete) return; // the confirm dialog owns Escape while it's up
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirmDelete]);

  async function patch(body: Record<string, unknown>) {
    try {
      onChange(
        await api<Lead>(`/api/leads/${lead._id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      );
      setErr('');
      if ('sectionId' in body) reloadSections();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    onChange(
      await api<Lead>(`/api/leads/${lead._id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text: note }),
      }),
    );
    setNote('');
  }

  async function confirmedDelete() {
    setDeleting(true);
    try {
      await onDelete(lead._id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function renderPitch() {
    if (!templateId) return;
    setPitch(
      await api(`/api/templates/${templateId}/render`, {
        method: 'POST',
        body: JSON.stringify({ leadId: lead._id }),
      }),
    );
    setCopied(false);
  }

  async function copyPitch() {
    if (!pitch) return;
    await navigator.clipboard.writeText(pitch.body);
    setCopied(true);
  }

  const mailto = pitch
    ? `mailto:${pitch.to || emailEdit}?subject=${encodeURIComponent(pitch.subject)}&body=${encodeURIComponent(pitch.body)}`
    : '';
  const doneIdx = STATUS_FLOW.indexOf(lead.status);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="lead-modal" onClick={(e) => e.stopPropagation()}>
        {/* ── header ── */}
        <header className="lm-head">
          <div className="lm-head-main">
            <div className="lm-crumbs">
              <ScoreBadge score={lead.score} />
              <SourceTag source={lead.source} />
              {lead.budgetText && <span className="budget">{lead.budgetText}</span>}
              <span className="muted small">posted {fmtDate(lead.postedAt)}</span>
              {lead.sectionLocked && (
                <span className="muted small" title="You filed this lead by hand — re-scrapes won't move it">
                  📌 pinned
                </span>
              )}
            </div>
            <h2>{lead.title}</h2>
            {lead.company && <div className="muted">{lead.company}</div>}
          </div>
          <button className="lm-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {/* ── status stepper ── */}
        <div className="lm-stepper">
          {STATUS_FLOW.map((s, i) => (
            <button
              key={s}
              className={`step ${lead.status === s ? 'step-on' : ''} ${i < doneIdx ? 'step-done' : ''}`}
              onClick={() => patch({ status: s })}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
          {lead.status === 'archived' && <span className="pill pill-archived">Archived</span>}
        </div>

        {err && <div className="error-box lm-err">{err}</div>}

        {/* ── body: main + aside ── */}
        <div className="lm-body">
          <div className="lm-main">
            <div className="lm-tabs">
              {(['post', 'pitch', 'notes'] as const).map((t) => (
                <button
                  key={t}
                  className={`lm-tab ${tab === t ? 'lm-tab-on' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t === 'post' ? 'Original post' : t === 'pitch' ? 'Pitch' : `Notes (${lead.notes.length})`}
                </button>
              ))}
            </div>

            {tab === 'post' && (
              <div className="lm-pane">
                {lead.url && (
                  <a href={lead.url} target="_blank" rel="noreferrer" className="ext-link">
                    open original ↗
                  </a>
                )}
                <pre className="post-body post-body-lg">
                  {lead.description || '(no body — open the original post)'}
                </pre>
              </div>
            )}

            {tab === 'pitch' && (
              <div className="lm-pane">
                <div className="pitch-controls">
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {templates.length === 0 && <option value="">No templates yet</option>}
                    {templates.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                        {t.sectionId ? '' : ' (shared)'}
                      </option>
                    ))}
                  </select>
                  <button className="btn" onClick={renderPitch} disabled={!templateId}>
                    Generate
                  </button>
                </div>
                {pitch ? (
                  <div className="pitch-out">
                    {pitch.subject && <div className="pitch-subject">Subject: {pitch.subject}</div>}
                    <textarea
                      value={pitch.body}
                      rows={16}
                      onChange={(e) => setPitch({ ...pitch, body: e.target.value })}
                    />
                    <div className="pitch-actions">
                      <button className="btn btn-primary" onClick={copyPitch}>
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                      <a
                        className={`btn ${pitch.to || emailEdit ? '' : 'btn-disabled'}`}
                        href={mailto}
                        onClick={() => patch({ status: 'pitched' })}
                      >
                        Open in mail app
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="muted empty">Pick a template and hit Generate.</p>
                )}
              </div>
            )}

            {tab === 'notes' && (
              <div className="lm-pane">
                {lead.notes.length === 0 && <p className="muted">No notes yet.</p>}
                {lead.notes.map((n, i) => (
                  <div key={i} className="note">
                    <span className="muted small">{fmtDate(n.at)}</span> {n.text}
                  </div>
                ))}
                <div className="inline-edit">
                  <input
                    value={note}
                    placeholder="Add a note…"
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addNote()}
                  />
                  <button className="btn btn-small" onClick={addNote}>Add</button>
                </div>
              </div>
            )}
          </div>

          {/* ── aside ── */}
          <aside className="lm-aside">
            <label>
              Section
              <select
                value={lead.sectionId ?? ''}
                onChange={(e) => patch({ sectionId: e.target.value || null })}
              >
                <option value="">Unsorted</option>
                {sections.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </label>
            {lead.sectionLocked && (
              <p className="muted small lm-note">
                Filed by hand — keyword changes won't move it.
              </p>
            )}

            <label>
              Contact email
              <div className="inline-edit">
                <input
                  value={emailEdit}
                  placeholder="none found — check the post"
                  onChange={(e) => setEmailEdit(e.target.value)}
                />
                {emailEdit !== lead.contactEmail && (
                  <button className="btn btn-small" onClick={() => patch({ contactEmail: emailEdit })}>
                    Save
                  </button>
                )}
              </div>
            </label>
            {lead.emails.length > 1 && (
              <p className="muted small lm-note">Also found: {lead.emails.join(', ')}</p>
            )}

            <label>
              Follow up on
              <input
                type="date"
                value={lead.followUpAt ? lead.followUpAt.slice(0, 10) : ''}
                onChange={(e) => patch({ followUpAt: e.target.value || null })}
              />
            </label>

            {lead.location && (
              <div className="lm-fact">
                <span className="muted small">Location</span>
                <div>{lead.location}</div>
              </div>
            )}

            {lead.matchedKeywords.length > 0 && (
              <div className="lm-fact">
                <span className="muted small">Matched</span>
                <div className="keyword-row">
                  {lead.matchedKeywords.map((k) => (
                    <span key={k} className="keyword">{k}</span>
                  ))}
                </div>
              </div>
            )}

            <button className="btn btn-danger lm-delete" onClick={() => setConfirmDelete(true)}>
              Delete lead
            </button>
          </aside>
        </div>

        {confirmDelete && (
          <ConfirmDialog
            title="Delete this lead?"
            confirmLabel="Delete lead"
            busy={deleting}
            onConfirm={confirmedDelete}
            onCancel={() => setConfirmDelete(false)}
          >
            <p><strong>{lead.title}</strong></p>
            <p>
              This removes it permanently, including its notes. If the source still lists the
              post, the next scrape will bring it back as a fresh lead.
            </p>
          </ConfirmDialog>
        )}
      </div>
    </div>
  );
}

