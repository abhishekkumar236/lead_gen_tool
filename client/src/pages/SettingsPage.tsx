import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Settings } from '../types';

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [guess, setGuess] = useState({ firstName: '', lastName: '', domain: '' });
  const [guessOut, setGuessOut] = useState<{ domainAcceptsMail: boolean; guesses: string[] } | null>(null);
  const [guessErr, setGuessErr] = useState('');

  useEffect(() => {
    api<Settings>('/api/settings').then(setS);
  }, []);

  async function save() {
    if (!s) return;
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(s) });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function runGuess() {
    setGuessErr('');
    setGuessOut(null);
    try {
      setGuessOut(await api('/api/email/guess', { method: 'POST', body: JSON.stringify(guess) }));
    } catch (e) {
      setGuessErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!s) return <p className="muted">Loading…</p>;

  return (
    <div>
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <div className="two-col">
        <section className="card">
          <h2>My profile</h2>
          <p className="muted small">Used to fill pitch templates.</p>
          <label>
            Name
            <input value={s.myName} onChange={(e) => setS({ ...s, myName: e.target.value })} />
          </label>
          <label>
            Headline
            <input
              placeholder="a backend engineer with 4 years building Node/React systems"
              value={s.headline}
              onChange={(e) => setS({ ...s, headline: e.target.value })}
            />
          </label>
          <label>
            Skills (comma separated)
            <input
              value={s.skills.join(', ')}
              onChange={(e) => setS({ ...s, skills: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
            />
          </label>
          <label>
            Portfolio / GitHub URL
            <input value={s.portfolioUrl} onChange={(e) => setS({ ...s, portfolioUrl: e.target.value })} />
          </label>
          <label>
            Rate
            <input placeholder="$25–35/hr" value={s.rate} onChange={(e) => setS({ ...s, rate: e.target.value })} />
          </label>
          <button className="btn btn-primary" onClick={save}>{saved ? '✓ Saved' : 'Save'}</button>
        </section>

        <section className="card">
          <h2>Scoring keywords</h2>
          <p className="muted small">
            Leads mentioning these rank higher. One per line — this is the main dial on lead quality.
          </p>
          <textarea
            rows={14}
            value={s.keywords.join('\n')}
            onChange={(e) => setS({ ...s, keywords: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
          />
          <button className="btn btn-primary" onClick={save}>{saved ? '✓ Saved' : 'Save'}</button>
        </section>
      </div>

      <section className="card">
        <h2>Email finder</h2>
        <p className="muted small">
          Generates the common corporate address patterns and checks the domain actually accepts mail (DNS MX).
        </p>
        <div className="guess-row">
          <input placeholder="First name" value={guess.firstName} onChange={(e) => setGuess({ ...guess, firstName: e.target.value })} />
          <input placeholder="Last name" value={guess.lastName} onChange={(e) => setGuess({ ...guess, lastName: e.target.value })} />
          <input placeholder="company.com" value={guess.domain} onChange={(e) => setGuess({ ...guess, domain: e.target.value })} />
          <button className="btn" onClick={runGuess}>Find</button>
        </div>
        {guessErr && <div className="error-box">{guessErr}</div>}
        {guessOut && (
          <div>
            <p className={guessOut.domainAcceptsMail ? 'ok-text' : 'error-text'}>
              {guessOut.domainAcceptsMail
                ? '✓ Domain accepts mail (MX records found)'
                : '✗ No MX records — this domain likely cannot receive email'}
            </p>
            <ul className="guess-list">
              {guessOut.guesses.map((g) => <li key={g}><code>{g}</code></li>)}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
