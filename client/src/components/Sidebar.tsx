import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import { useSections } from '../SectionContext';
import { UNSORTED, type Lead } from '../types';
import NewSectionDialog from './NewSectionDialog';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '◎' },
  { to: '/leads', label: 'Leads', icon: '☰' },
  { to: '/pipeline', label: 'Pipeline', icon: '▦' },
  { to: '/templates', label: 'Templates', icon: '✎' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar({ onLeadMoved }: { onLeadMoved?(lead: Lead): void }) {
  const { sections, unsortedCount, total, active, setActive, reload } = useSections();
  const [creating, setCreating] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /** Dropping a dragged lead card onto a section files it there permanently. */
  async function handleDrop(e: React.DragEvent, sectionId: string | null) {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const updated = await api<Lead>(`/api/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ sectionId }),
    });
    onLeadMoved?.(updated);
    reload();
  }

  function dropProps(key: string, sectionId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setDropTarget(key);
      },
      onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
      onDrop: (e: React.DragEvent) => handleDrop(e, sectionId),
    };
  }

  return (
    <aside className="sidebar">
      <div className="logo">
        Lead<span>Forge</span>
      </div>

      <nav className="nav-main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-scroll">
        <div className="sec-head">
          <span>Sections</span>
          <button className="sec-add" onClick={() => setCreating(true)} title="New section">
            +
          </button>
        </div>

        <button
          className={`sec-item ${active === '' ? 'sec-active' : ''}`}
          onClick={() => setActive('')}
        >
          <span className="sec-dot" style={{ background: 'var(--muted)' }} />
          <span className="sec-name">All leads</span>
          <span className="sec-count">{total}</span>
        </button>

        {sections.map((s) => (
          <button
            key={s._id}
            className={`sec-item ${active === s._id ? 'sec-active' : ''} ${
              dropTarget === s._id ? 'sec-drop' : ''
            }`}
            onClick={() => setActive(s._id)}
            {...dropProps(s._id, s._id)}
          >
            <span className="sec-dot" style={{ background: s.color }} />
            <span className="sec-name">{s.name}</span>
            <span className="sec-count">{s.count}</span>
          </button>
        ))}

        <button
          className={`sec-item ${active === UNSORTED ? 'sec-active' : ''} ${
            dropTarget === UNSORTED ? 'sec-drop' : ''
          }`}
          onClick={() => setActive(UNSORTED)}
          {...dropProps(UNSORTED, null)}
        >
          <span className="sec-dot sec-dot-hollow" />
          <span className="sec-name">Unsorted</span>
          <span className="sec-count">{unsortedCount}</span>
        </button>

        {sections.length === 0 && (
          <p className="sec-hint">
            Create a section to sort leads by keywords — nothing is ever deleted, unmatched
            leads just stay in Unsorted.
          </p>
        )}
      </div>

      <div className="sidebar-foot">free · local · yours</div>

      {creating && (
        <NewSectionDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setActive(id);
          }}
        />
      )}
    </aside>
  );
}
