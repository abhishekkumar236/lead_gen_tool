import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Lead, LeadStatus } from '../types';
import { STATUS_LABELS } from '../types';
import { ScoreBadge, SourceTag } from '../components/bits';
import LeadDrawer from '../components/LeadDrawer';

const COLUMNS: LeadStatus[] = ['new', 'shortlisted', 'pitched', 'replied', 'won', 'lost'];

export default function Pipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);

  function load() {
    api<Lead[]>('/api/leads?limit=1000').then(setLeads);
  }
  useEffect(load, []);

  async function move(lead: Lead, status: LeadStatus) {
    const updated = await api<Lead>(`/api/leads/${lead._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setLeads((ls) => ls.map((l) => (l._id === updated._id ? updated : l)));
  }

  return (
    <div>
      <header className="page-head">
        <h1>Pipeline</h1>
      </header>
      <div className="board">
        {COLUMNS.map((col) => {
          const items = leads.filter((l) => l.status === col);
          return (
            <div
              key={col}
              className="board-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/plain');
                const lead = leads.find((l) => l._id === id);
                if (lead && lead.status !== col) move(lead, col);
              }}
            >
              <div className="board-head">
                {STATUS_LABELS[col]} <span className="muted">{items.length}</span>
              </div>
              {items.map((l) => (
                <div
                  key={l._id}
                  className="board-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', l._id)}
                  onClick={() => setSelected(l)}
                >
                  <div className="board-card-top">
                    <ScoreBadge score={l.score} />
                    <SourceTag source={l.source} />
                  </div>
                  <div className="board-card-title">{l.title}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onChange={(u) => {
            setLeads((ls) => ls.map((l) => (l._id === u._id ? u : l)));
            setSelected(u);
          }}
          onDelete={async (id) => {
            await api(`/api/leads/${id}`, { method: 'DELETE' });
            setLeads((ls) => ls.filter((l) => l._id !== id));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
