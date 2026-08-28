import { useState } from 'react';
import { api } from '../api';
import { useSections } from '../SectionContext';
import type { Section } from '../types';

const SWATCHES = ['#4f8ef7', '#3fbf7f', '#e8a33d', '#b48ef7', '#f2564b', '#38b6c9'];

interface Props {
  onClose(): void;
  onCreated(sectionId: string): void;
  editing?: Section;
}

export default function NewSectionDialog({ onClose, onCreated, editing }: Props) {
  const { reload } = useSections();
  const [name, setName] = useState(editing?.name ?? '');
  const [keywords, setKeywords] = useState((editing?.keywords ?? []).join(', '));
  const [color, setColor] = useState(editing?.color ?? SWATCHES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [moved, setMoved] = useState<number | null>(null);

  async function save() {
    if (!name.trim() || !keywords.trim()) {
      setErr('Give the section a name and at least one keyword.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await api<{ section: Section; reclassified: { moved: number } }>(
        editing ? `/api/sections/${editing._id}` : '/api/sections',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify({ name: name.trim(), keywords, color }),
        },
      );
      setMoved(res.reclassified.moved);
      await reload();
      onCreated(res.section._id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? 'Edit section' : 'New section'}</h2>
        <p className="muted small">
          Leads matching these keywords get filed here and ranked by score. Anything matching
          nothing stays in Unsorted — leads are never discarded.
        </p>

        <label>
          Section name
          <input
            autoFocus
            placeholder="GTM, Poker Platform, Freelance…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label>
          Keywords
          <input
            placeholder="gtm, marketing, product marketing, contract"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </label>
        <div className="muted small">Comma-separated. Matched as whole words, case-insensitive.</div>

        <div className="swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              className={`swatch ${color === c ? 'swatch-on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`colour ${c}`}
            />
          ))}
        </div>

        {err && <div className="error-box">{err}</div>}
        {moved !== null && <div className="ok-text small">Re-filed {moved} leads.</div>}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Sorting leads…' : editing ? 'Save & re-sort' : 'Create & sort leads'}
          </button>
        </div>
      </div>
    </div>
  );
}
