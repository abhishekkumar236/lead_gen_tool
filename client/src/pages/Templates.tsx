import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useSections } from '../SectionContext';
import type { Template } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';

const PLACEHOLDERS = [
  'myName', 'headline', 'skills', 'portfolioUrl', 'rate',
  'title', 'company', 'source', 'matchedKeywords', 'leadUrl',
];

const BLANK = { name: '', subject: '', body: '', sectionId: '' };

export default function Templates() {
  const { sections, active } = useSections();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<{ _id?: string } & typeof BLANK>(BLANK);
  const [saved, setSaved] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null);

  // Listing every template regardless of section: this page is where you manage
  // them, so hiding other sections' templates would make them unreachable.
  const load = useCallback(() => {
    api<Template[]>('/api/templates').then(setTemplates);
  }, []);
  useEffect(load, [load]);

  // A new template defaults to the section you're working in.
  useEffect(() => {
    setEditing((e) =>
      e._id || e.name || e.body ? e : { ...BLANK, sectionId: active === 'unsorted' ? '' : active },
    );
  }, [active]);

  async function save() {
    if (!editing.name.trim() || !editing.body.trim()) return;
    const payload = JSON.stringify({
      name: editing.name,
      subject: editing.subject,
      body: editing.body,
      sectionId: editing.sectionId || null,
    });
    if (editing._id) {
      await api(`/api/templates/${editing._id}`, { method: 'PUT', body: payload });
    } else {
      await api('/api/templates', { method: 'POST', body: payload });
    }
    setEditing(BLANK);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    load();
  }

  const sectionName = (id: string | null) =>
    id ? (sections.find((s) => s._id === id)?.name ?? 'unknown section') : 'Shared';

  async function remove(id: string) {
    await api(`/api/templates/${id}`, { method: 'DELETE' });
    if (editing._id === id) setEditing(BLANK);
    setPendingDelete(null);
    load();
  }

  return (
    <div>
      <header className="page-head">
        <h1>Pitch templates</h1>
        {editing._id && (
          <button className="btn btn-ghost" onClick={() => setEditing(BLANK)}>+ New template</button>
        )}
      </header>

      <div className="two-col">
        <section className="card">
          <h2>{editing._id ? 'Edit template' : 'New template'}</h2>
          <label>
            Name
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <label>
            Subject
            <input
              value={editing.subject}
              placeholder="Re: {{title}}"
              onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
            />
          </label>
          <label>
            Use in section
            <select
              value={editing.sectionId}
              onChange={(e) => setEditing({ ...editing, sectionId: e.target.value })}
            >
              <option value="">Shared — every section</option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Body
            <textarea
              rows={14}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
          </label>
          <div className="placeholder-help">
            {PLACEHOLDERS.map((p) => (
              <code
                key={p}
                onClick={() => setEditing({ ...editing, body: `${editing.body}{{${p}}}` })}
              >
                {`{{${p}}}`}
              </code>
            ))}
          </div>
          <button className="btn btn-primary" onClick={save}>
            {saved ? '✓ Saved' : editing._id ? 'Update' : 'Create'}
          </button>
        </section>

        <section className="card">
          <h2>Saved ({templates.length})</h2>
          {templates.map((t) => (
            <div key={t._id} className="tpl-row">
              <button
                className="tpl-name"
                onClick={() => setEditing({ ...t, sectionId: t.sectionId ?? '' })}
              >
                {t.name}
                <span className="muted small tpl-scope">{sectionName(t.sectionId)}</span>
              </button>
              <button className="btn btn-small btn-danger" onClick={() => setPendingDelete(t)}>Delete</button>
            </div>
          ))}
        </section>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this template?"
          confirmLabel="Delete template"
          onConfirm={() => remove(pendingDelete._id)}
          onCancel={() => setPendingDelete(null)}
        >
          <p><strong>{pendingDelete.name}</strong></p>
          <p>Pitches you've already generated from it are unaffected.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
