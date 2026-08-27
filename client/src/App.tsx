import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Pipeline from './pages/Pipeline';
import Templates from './pages/Templates';
import SettingsPage from './pages/SettingsPage';

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/leads', label: 'Leads' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/templates', label: 'Templates' },
  { to: '/settings', label: 'Settings' },
];

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          Lead<span>Forge</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">free · local · yours</div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
