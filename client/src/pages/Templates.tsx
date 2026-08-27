import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Template } from '../types';

const PLACEHOLDERS = [
  'myName', 'headline', 'skills', 'portfolioUrl', 'rate',
  'title', 'company', 'source', 'matchedKeywords', 'leadUrl',
];

const BLANK = { name: '', subject: '', body: '' };

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<{ _id?: string } & typeof BLANK>(BLANK);
  const [saved, setSaved] = useState(false);

  function load() {
    api<Template[]>('/api/templates').then(setTemplates);
  }
  useEffect(load, []);

  async function save() {
    if (!editing.name.trim() || !editing.body.trim()) return;
    const payload = JSON.stringify({
      name: editing.name,
      subject: editing.subject,
      body: editing.body,
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

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return;
    await api(`/api/templates/${id}`, { method: 'DELETE' });
    if (editing._id === id) setEditing(BLANK);
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
              <button className="tpl-name" onClick={() => setEditing(t)}>{t.name}</button>
              <button className="btn btn-small btn-danger" onClick={() => remove(t._id)}>Delete</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
