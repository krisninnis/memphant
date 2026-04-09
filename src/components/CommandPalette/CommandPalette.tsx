/**
 * ⌘K Command Palette
 *
 * Trigger: ⌘K (macOS) / Ctrl+K (Windows/Linux) from anywhere in the app.
 *
 * Features:
 *  - Fuzzy project search
 *  - Quick actions: New project, Settings tabs, Export, Sync
 *  - Keyboard navigation (↑↓ Enter Esc) via cmdk
 */

import { useEffect, useState, useCallback } from 'react';
import { Command } from 'cmdk';
import { useProjectStore } from '../../store/projectStore';
import { createProject } from '../../services/tauriActions';
import './CommandPalette.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaletteAction {
  id: string;
  label: string;
  group: string;
  icon: string;
  run: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const projects       = useProjectStore((s) => s.projects);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setCurrentView = useProjectStore((s) => s.setCurrentView);
  const setSettingsTab = useProjectStore((s) => s.setSettingsTab);
  const showToast      = useProjectStore((s) => s.showToast);
  const cloudUser      = useProjectStore((s) => s.cloudUser);

  // ── Open / close on ⌘K / Ctrl+K ─────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Reset search when closed
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  // ── Actions ──────────────────────────────────────────────────────────────

  const actions: PaletteAction[] = [
    {
      id: 'new-project',
      label: 'New project',
      group: 'Actions',
      icon: '✚',
      run: async () => {
        close();
        const name = window.prompt('Project name:');
        if (name?.trim()) await createProject(name.trim());
      },
    },
    {
      id: 'goto-settings-general',
      label: 'Settings → General',
      group: 'Actions',
      icon: '⚙️',
      run: () => { close(); setSettingsTab('general'); setCurrentView('settings'); },
    },
    {
      id: 'goto-settings-sync',
      label: 'Settings → Cloud Backup',
      group: 'Actions',
      icon: '☁️',
      run: () => { close(); setSettingsTab('sync'); setCurrentView('settings'); },
    },
    {
      id: 'goto-settings-privacy',
      label: 'Settings → Privacy',
      group: 'Actions',
      icon: '🔒',
      run: () => { close(); setSettingsTab('privacy'); setCurrentView('settings'); },
    },
    {
      id: 'goto-settings-platforms',
      label: 'Settings → AI Platforms',
      group: 'Actions',
      icon: '🤖',
      run: () => { close(); setSettingsTab('platforms'); setCurrentView('settings'); },
    },
    {
      id: 'goto-settings-about',
      label: 'Settings → About',
      group: 'Actions',
      icon: 'ℹ️',
      run: () => { close(); setSettingsTab('about'); setCurrentView('settings'); },
    },
    ...(cloudUser
      ? [
          {
            id: 'sync-now',
            label: 'Sync with cloud now',
            group: 'Actions',
            icon: '🔄',
            run: () => {
              close();
              setSettingsTab('sync');
              setCurrentView('settings');
              showToast('Opening Cloud Backup — click Sync now.');
            },
          },
        ]
      : []),
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={close} role="dialog" aria-modal="true" aria-label="Command palette">
      <div
        className="cmd-wrapper"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <Command label="Command palette" shouldFilter loop>
          <div className="cmd-input-row">
            <span className="cmd-input-icon">⌘</span>
            <Command.Input
              className="cmd-input"
              placeholder="Search projects or type a command…"
              value={search}
              onValueChange={setSearch}
              autoFocus
            />
            <kbd className="cmd-esc-hint" onClick={close}>esc</kbd>
          </div>

          <Command.List className="cmd-list">
            <Command.Empty className="cmd-empty">
              No results for &ldquo;{search}&rdquo;
            </Command.Empty>

            {/* Projects */}
            {projects.length > 0 && (
              <Command.Group heading="Projects" className="cmd-group">
                {projects.map((project) => (
                  <Command.Item
                    key={project.id}
                    value={project.name}
                    className="cmd-item"
                    onSelect={() => {
                      setActiveProject(project.id);
                      setCurrentView('projects');
                      close();
                    }}
                  >
                    <span className="cmd-item-icon">📁</span>
                    <span className="cmd-item-label">{project.name}</span>
                    {project.currentState && (
                      <span className="cmd-item-hint">
                        {project.currentState.slice(0, 60)}
                        {project.currentState.length > 60 ? '…' : ''}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Actions */}
            <Command.Group heading="Actions" className="cmd-group">
              {actions.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.label}
                  className="cmd-item"
                  onSelect={() => void action.run()}
                >
                  <span className="cmd-item-icon">{action.icon}</span>
                  <span className="cmd-item-label">{action.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

export default CommandPalette;
