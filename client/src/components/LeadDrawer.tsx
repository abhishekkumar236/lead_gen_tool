import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Lead, LeadStatus, Template } from '../types';
import { STATUS_LABELS } from '../types';
import { ScoreBadge, SourceTag, fmtDate } from './bits';

const STATUS_FLOW: LeadStatus[] = ['new', 'shortlisted', 'pitched', 'replied', 'won', 'lost', 'archived'];

interface Props {
  lead: Lead;
  onClose(): void;
  onChange(updated: Lead): void;
  onDelete(id: string): void;
}

export default function LeadDrawer({ lead, onClose, onChange, onDelete }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [pitch, setPitch] = useState<{ subject: string; body: string; to: string } | null>(null);
  const [note, setNote] = useState('');
  const [emailEdit, setEmailEdit] = useState(lead.contactEmail);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Template[]>('/api/templates').then((ts) => {
      setTemplates(ts);
      if (ts.length > 0) setTemplateId(ts[0]._id);
    });
  }, []);

  useEffect(() => {
    setEmailEdit(lead.contactEmail);
    setPitch(null);
  }, [lead._id, lead.contactEmail]);

  async function patch(body: Record<string, unknown>) {
    try {
      onChange(await api<Lead>(`/api/leads/${lead._id}`, { method: 'PATCH', body: JSON.stringify(body) }));
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    const updated = await api<Lead>(`/api/leads/${lead._id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text: note }),
    });
    onChange(updated);
    setNote('');
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

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <div className="drawer-meta">
              <ScoreBadge score={lead.score} />
              <SourceTag source={lead.source} />
              {lead.budgetText && <span className="budget">{lead.budgetText}</span>}
              <span className="muted">posted {fmtDate(lead.postedAt)}</span>
            </div>
            <h2>{lead.title}</h2>
            {lead.company && <div className="muted">{lead.company}</div>}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </header>

        {err && <div className="error-box">{err}</div>}

        <div className="status-row">
          {STATUS_FLOW.map((s) => (
            <button
              key={s}
              className={`chip ${lead.status === s ? 'chip-active' : ''}`}
              onClick={() => patch({ status: s })}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="field-row">
          <label>
            Contact email
            <div className="inline-edit">
              <input
                value={emailEdit}
                placeholder="no email found — check the post"
                onChange={(e) => setEmailEdit(e.target.value)}
              />
              {emailEdit !== lead.contactEmail && (
                <button className="btn btn-small" onClick={() => patch({ contactEmail: emailEdit })}>
                  Save
                </button>
              )}
            </div>
          </label>
          <label>
            Follow up on
            <input
              type="date"
              value={lead.followUpAt ? lead.followUpAt.slice(0, 10) : ''}
              onChange={(e) => patch({ followUpAt: e.target.value || null })}
            />
          </label>
        </div>

        {lead.emails.length > 1 && (
          <div className="muted small">Also found: {lead.emails.join(', ')}</div>
        )}
        {lead.matchedKeywords.length > 0 && (
          <div className="keyword-row">
            {lead.matchedKeywords.map((k) => (
              <span key={k} className="keyword">{k}</span>
            ))}
          </div>
        )}

        <section>
          <h3>
            Post{' '}
            {lead.url && (
              <a href={lead.url} target="_blank" rel="noreferrer" className="ext-link">
                open original ↗
              </a>
            )}
          </h3>
          <pre className="post-body">{lead.description || '(no body — see original post)'}</pre>
        </section>

        <section>
          <h3>Pitch</h3>
          <div className="pitch-controls">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
            <button className="btn" onClick={renderPitch} disabled={!templateId}>
              Generate
            </button>
          </div>
          {pitch && (
            <div className="pitch-out">
              {pitch.subject && <div className="pitch-subject">Subject: {pitch.subject}</div>}
              <textarea
                value={pitch.body}
                rows={12}
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
          )}
        </section>

        <section>
          <h3>Notes</h3>
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
        </section>

        <footer className="drawer-foot">
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('Delete this lead permanently?')) onDelete(lead._id);
            }}
          >
            Delete lead
          </button>
        </footer>
      </div>
    </div>
  );
}
