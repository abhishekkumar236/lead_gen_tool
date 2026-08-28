import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isAbort } from '../api';
import { useSections, withSection } from '../SectionContext';
import type { Lead, LeadStatus } from '../types';
import { STATUS_LABELS } from '../types';
import { ScoreBadge, SourceTag } from '../components/bits';
import LeadModal from '../components/LeadModal';

const COLUMNS: LeadStatus[] = ['new', 'shortlisted', 'pitched', 'replied', 'won', 'lost'];

export default function Pipeline({ refreshKey }: { refreshKey: number }) {
  const { active, activeName, reload: reloadSections } = useSections();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [over, setOver] = useState<LeadStatus | null>(null);

  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    const params = new URLSearchParams({ limit: '1000' });
    try {
      setLeads(
        await api<Lead[]>(`/api/leads?${withSection(params, active)}`, { signal: ctrl.signal }),
      );
    } catch (e) {
      if (!isAbort(e)) throw e;
    }
  }, [active]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

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
        <h1>Pipeline <span className="muted">· {activeName}</span></h1>
        <span className="muted small">Drag a card between columns, or onto a section in the sidebar to re-file it.</span>
      </header>

      <div className="board">
        {COLUMNS.map((col) => {
          const items = leads.filter((l) => l.status === col);
          return (
            <div
              key={col}
              className={`board-col ${over === col ? 'board-col-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver((c) => (c === col ? null : c))}
              onDrop={(e) => {
                setOver(null);
                const id = e.dataTransfer.getData('text/plain');
                const lead = leads.find((l) => l._id === id);
                if (lead && lead.status !== col) move(lead, col);
              }}
            >
              <div className="board-head">
                {STATUS_LABELS[col]} <span className="muted">{items.length}</span>
              </div>
              <div className="board-scroll">
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
                    {l.company && <div className="muted small">{l.company}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <LeadModal
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
            reloadSections();
          }}
        />
      )}
    </div>
  );
}
