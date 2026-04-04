import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import SettingsGeneral from './SettingsGeneral';
import SettingsPrivacy from './SettingsPrivacy';
import SettingsProjects from './SettingsProjects';
import SettingsPlatforms from './SettingsPlatforms';
import SettingsAbout from './SettingsAbout';
import './SettingsPage.css';

type SettingsTab = 'general' | 'privacy' | 'projects' | 'platforms' | 'about';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'general',   label: 'General',    icon: '⚙️' },
  { id: 'privacy',   label: 'Privacy & Security', icon: '🔒' },
  { id: 'projects',  label: 'Projects',   icon: '🗂️' },
  { id: 'platforms', label: 'AI Platforms', icon: '🤖' },
  { id: 'about',     label: 'About',      icon: 'ℹ️' },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const setCurrentView = useProjectStore((s) => s.setCurrentView);

  return (
    <div className="settings-page">
      {/* Mobile back button shown above the tab strip */}
      <div className="settings-back-mobile">
        <button className="settings-back-btn" onClick={() => setCurrentView('projects')}>
          ← Back to projects
        </button>
      </div>

      <div className="settings-nav">
        {/* Desktop: sidebar header */}
        <div className="settings-nav-header">
          <button className="settings-back-btn" onClick={() => setCurrentView('projects')}>
            ← Back
          </button>
          <span className="settings-nav-title">Settings</span>
        </div>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="settings-nav-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-content">
        {activeTab === 'general'   && <SettingsGeneral />}
        {activeTab === 'privacy'   && <SettingsPrivacy />}
        {activeTab === 'projects'  && <SettingsProjects />}
        {activeTab === 'platforms' && <SettingsPlatforms />}
        {activeTab === 'about'     && <SettingsAbout />}
      </div>
    </div>
  );
}

export default SettingsPage;
