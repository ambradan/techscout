import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Project } from '../lib/types';

export function SettingsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [scoutingEnabled, setScoutingEnabled] = useState(true);
  const [scoutingFrequency, setScoutingFrequency] = useState<'daily' | 'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [excludeCategories, setExcludeCategories] = useState<string[]>([]);
  const [maxRecommendations, setMaxRecommendations] = useState(5);
  const [notificationChannels, setNotificationChannels] = useState<string[]>([]);

  const availableFocusAreas = [
    'frontend', 'backend', 'devops', 'tooling', 'ai', 'database', 'security', 'testing', 'monitoring'
  ];

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      setScoutingEnabled(selectedProject.scouting_enabled);
      setScoutingFrequency(selectedProject.scouting_frequency);
      setFocusAreas(selectedProject.focus_areas);
      setExcludeCategories(selectedProject.exclude_categories);
      setMaxRecommendations(selectedProject.max_recommendations);
      // Cast notification_channels to string[]
      const channels = selectedProject.notification_channels as unknown[];
      setNotificationChannels(channels.filter((c): c is string => typeof c === 'string'));
    }
  }, [selectedProject]);

  async function loadProjects() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('name');
      setProjects((data || []) as Project[]);
      if (data && data.length > 0) {
        setSelectedProject(data[0] as Project);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!selectedProject) return;

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('projects')
        .update({
          scouting_enabled: scoutingEnabled,
          scouting_frequency: scoutingFrequency,
          focus_areas: focusAreas,
          exclude_categories: excludeCategories,
          max_recommendations: maxRecommendations,
          notification_channels: notificationChannels,
        })
        .eq('id', selectedProject.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Settings saved successfully.' });
      loadProjects();
    } catch (err) {
      console.error('Failed to save settings:', err);
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject() {
    if (!selectedProject) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${selectedProject.name}"? This will permanently delete all project data, recommendations, and history.`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', selectedProject.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Project deleted.' });
      setSelectedProject(null);
      loadProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
      setMessage({ type: 'error', text: 'Failed to delete project.' });
    }
  }

  function toggleFocusArea(area: string) {
    if (focusAreas.includes(area)) {
      setFocusAreas(focusAreas.filter(a => a !== area));
    } else {
      setFocusAreas([...focusAreas, area]);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <h1 className="text-lg font-semibold text-zinc-900 mb-4">Settings</h1>

      {message && (
        <div className={`mb-4 text-sm px-3 py-2 rounded-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-sm text-zinc-500">No projects to configure.</div>
      ) : (
        <>
          {/* Project Selector */}
          <div className="mb-6">
            <label className="label">Select Project</label>
            <select
              value={selectedProject?.id || ''}
              onChange={(e) => {
                const p = projects.find(p => p.id === e.target.value);
                setSelectedProject(p || null);
              }}
              className="input w-auto"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {selectedProject && (
            <>
              {/* Scouting Config */}
              <div className="card mb-4">
                <h2 className="text-sm font-medium text-zinc-900 mb-4">Scouting Configuration</h2>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="scoutingEnabled"
                      checked={scoutingEnabled}
                      onChange={(e) => setScoutingEnabled(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <label htmlFor="scoutingEnabled" className="text-sm text-zinc-700">
                      Enable scouting for this project
                    </label>
                  </div>

                  <div>
                    <label className="label">Focus Areas</label>
                    <div className="flex flex-wrap gap-2">
                      {availableFocusAreas.map(area => (
                        <button
                          key={area}
                          onClick={() => toggleFocusArea(area)}
                          className={`px-2 py-1 text-xs rounded-sm border ${
                            focusAreas.includes(area)
                              ? 'bg-zinc-900 text-white border-zinc-900'
                              : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400'
                          }`}
                        >
                          {area}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label">Scouting Frequency</label>
                    <select
                      value={scoutingFrequency}
                      onChange={(e) => setScoutingFrequency(e.target.value as typeof scoutingFrequency)}
                      className="input w-auto"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Max Recommendations per Run</label>
                    <input
                      type="number"
                      value={maxRecommendations}
                      onChange={(e) => setMaxRecommendations(parseInt(e.target.value) || 5)}
                      className="input w-24"
                      min={1}
                      max={20}
                    />
                  </div>
                </div>
              </div>

              {/* Notification Channels */}
              <div className="card mb-4">
                <h2 className="text-sm font-medium text-zinc-900 mb-4">Notification Channels</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="notifyEmail"
                      checked={notificationChannels.includes('email')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNotificationChannels([...notificationChannels, 'email']);
                        } else {
                          setNotificationChannels(notificationChannels.filter(c => c !== 'email'));
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <label htmlFor="notifyEmail" className="text-sm text-zinc-700">
                      Email notifications
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="notifySlack"
                      checked={notificationChannels.includes('slack')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNotificationChannels([...notificationChannels, 'slack']);
                        } else {
                          setNotificationChannels(notificationChannels.filter(c => c !== 'slack'));
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <label htmlFor="notifySlack" className="text-sm text-zinc-700">
                      Slack notifications
                    </label>
                  </div>
                </div>
              </div>

              {/* Privacy & Data */}
              <div className="card mb-4">
                <h2 className="text-sm font-medium text-zinc-900 mb-4">Privacy & Data</h2>
                <p className="text-sm text-zinc-600 mb-3">
                  TechScout only analyzes manifest files from your repository. Source code is never
                  read, stored, or sent to any external service.
                </p>
                <div className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-sm p-3 mb-4">
                  <strong>Data collected:</strong> Dependency lists, language percentages, framework
                  versions, repository topics. Nothing else.
                </div>
                <button onClick={deleteProject} className="btn btn-danger">
                  Delete Project Data
                </button>
              </div>

              {/* Save Button */}
              <div className="flex gap-2">
                <button onClick={saveSettings} className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
