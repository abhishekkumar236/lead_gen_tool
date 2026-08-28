import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SectionProvider } from './SectionContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Pipeline from './pages/Pipeline';
import Templates from './pages/Templates';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  // Bumped whenever something outside a page mutates leads (a scrape, or a
  // lead dropped onto a sidebar section) so the mounted page refetches.
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((n) => n + 1);

  return (
    <SectionProvider>
      <div className="layout">
        <Sidebar onLeadMoved={bump} />
        <div className="main">
          <Topbar onScraped={bump} />
          <main className="content">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard refreshKey={refreshKey} />} />
              <Route path="/leads" element={<Leads refreshKey={refreshKey} />} />
              <Route path="/pipeline" element={<Pipeline refreshKey={refreshKey} />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </SectionProvider>
  );
}
