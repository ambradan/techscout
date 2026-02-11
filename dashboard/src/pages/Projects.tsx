import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Project, StackHealth } from '../lib/types';

interface ProjectWithStats extends Project {
  stackHealth?: StackHealth;
  pendingRecommendations: number;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', repo_url: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      // Load projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (projectsError) throw projectsError;

      // Load stack health and recommendations for each project
      const projectsWithStats: ProjectWithStats[] = await Promise.all(
        (projectsData || []).map(async (project: Project) => {
          // Get stack health
          const { data: healthData } = await supabase
            .from('stack_health')
            .select('*')
            .eq('project_id', project.id)
            .single();

          // Get pending recommendations count
          const { count } = await supabase
            .from('recommendations')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project.id)
            .eq('status', 'pending');

          return {
            ...project,
            stackHealth: healthData as StackHealth | undefined,
            pendingRecommendations: count || 0,
          };
        })
      );

      setProjects(projectsWithStats);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const slug = newProject.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const { data: projectData, error: insertError } = await supabase.from('projects').insert({
        owner_id: user.user.id,
        name: newProject.name,
        slug,
        scouting_enabled: true,
        focus_areas: ['frontend', 'backend', 'devops', 'tooling'],
        exclude_categories: [],
        max_recommendations: 5,
        notification_channels: [],
      }).select().single();

      if (insertError) throw insertError;

      // Create project_manifest with description if provided
      if (newProject.description && projectData) {
        await supabase.from('project_manifest').insert({
          project_id: projectData.id,
          description: newProject.description,
        });
      }

      setNewProject({ name: '', description: '', repo_url: '' });
      setShowNewProjectForm(false);
      loadProjects();
    } catch (err) {
      console.error('Failed to create project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  function getHealthColor(score: number) {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    if (score >= 0.4) return 'bg-orange-500';
    return 'bg-red-500';
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-500">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-zinc-900">Projects</h1>
        <button
          onClick={() => setShowNewProjectForm(true)}
          className="btn btn-primary"
        >
          New Project
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
          {error}
        </div>
      )}

      {/* New Project Form */}
      {showNewProjectForm && (
        <div className="mb-4 card">
          <h2 className="text-sm font-medium text-zinc-900 mb-3">New Project</h2>
          <form onSubmit={createProject} className="space-y-3">
            <div>
              <label className="label">Project Name</label>
              <input
                type="text"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                className="input"
                placeholder="My Project"
                required
              />
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <input
                type="text"
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                className="input"
                placeholder="Brief description"
              />
            </div>
            <div>
              <label className="label">GitHub Repository URL (optional)</label>
              <input
                type="url"
                value={newProject.repo_url}
                onChange={(e) => setNewProject({ ...newProject, repo_url: e.target.value })}
                className="input"
                placeholder="https://github.com/owner/repo"
              />
            </div>

            {/* Data Privacy Notice */}
            <div className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-sm p-3">
              <strong className="text-zinc-700">Data Collection Notice:</strong> TechScout analyzes{' '}
              <strong>only manifest files</strong> from your repository (package.json, requirements.txt, etc.).
              Source code is never read, copied, or sent to external services.
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create Project'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewProjectForm(false);
                  setNewProject({ name: '', description: '', repo_url: '' });
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projects Table */}
      {projects.length === 0 ? (
        <div className="text-sm text-zinc-500 text-center py-12">
          No projects yet. Create your first project to get started.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table-dense">
            <thead>
              <tr>
                <th>Project</th>
                <th className="w-32">Health</th>
                <th className="w-24 text-center">Pending</th>
                <th className="w-28">Last Scan</th>
                <th className="w-20 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link
                      to={`/projects/${project.id}`}
                      className="text-zinc-900 hover:text-blue-600 font-medium"
                    >
                      {project.name}
                    </Link>
                    {project.description && (
                      <div className="text-xs text-zinc-500 truncate max-w-xs">
                        {project.description}
                      </div>
                    )}
                  </td>
                  <td>
                    {project.stackHealth ? (
                      <div className="flex items-center gap-2">
                        <div className="health-bar flex-1">
                          <div
                            className={`health-bar-fill ${getHealthColor(project.stackHealth.overall_score)}`}
                            style={{ width: `${project.stackHealth.overall_score * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-600 tabular-nums">
                          {Math.round(project.stackHealth.overall_score * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="text-center">
                    {project.pendingRecommendations > 0 ? (
                      <span className="badge badge-accent">{project.pendingRecommendations}</span>
                    ) : (
                      <span className="text-xs text-zinc-400">0</span>
                    )}
                  </td>
                  <td className="text-xs text-zinc-500">
                    {project.stackHealth
                      ? formatDate(project.stackHealth.calculated_at)
                      : 'Never'}
                  </td>
                  <td className="text-center">
                    <span
                      className={`badge ${
                        project.scouting_enabled ? 'badge-low' : 'badge-info'
                      }`}
                    >
                      {project.scouting_enabled ? 'Active' : 'Paused'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
