import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type {
  Project,
  ProjectStack,
  ProjectManifest,
  StackHealth,
  CFinding,
  Recommendation,
  FeedItem,
  BriefArchive,
} from '../lib/types';

type Tab = 'overview' | 'recommendations' | 'feed' | 'breaking' | 'history';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [project, setProject] = useState<Project | null>(null);
  const [stack, setStack] = useState<ProjectStack | null>(null);
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [health, setHealth] = useState<StackHealth | null>(null);
  const [findings, setFindings] = useState<CFinding[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [briefs, setBriefs] = useState<BriefArchive[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<string>('all');
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [briefView, setBriefView] = useState<'technical' | 'human'>('technical');

  useEffect(() => {
    if (id) loadProjectData(id);
  }, [id]);

  useEffect(() => {
    if (!id) return;

    // Set up realtime subscription for recommendations
    const channel = supabase
      .channel(`project-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recommendations',
          filter: `project_id=eq.${id}`,
        },
        () => {
          loadRecommendations(id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  async function loadProjectData(projectId: string) {
    setLoading(true);
    try {
      const [
        { data: projectData },
        { data: stackData },
        { data: manifestData },
        { data: healthData },
        { data: findingsData },
      ] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('project_stack').select('*').eq('project_id', projectId).single(),
        supabase.from('project_manifest').select('*').eq('project_id', projectId).single(),
        supabase.from('stack_health').select('*').eq('project_id', projectId).single(),
        supabase.from('cf_findings').select('*').eq('project_id', projectId).eq('is_resolved', false),
      ]);

      setProject(projectData as Project);
      setStack(stackData as ProjectStack | null);
      setManifest(manifestData as ProjectManifest | null);
      setHealth(healthData as StackHealth | null);
      setFindings((findingsData || []) as CFinding[]);

      await Promise.all([
        loadRecommendations(projectId),
        loadFeedItems(projectId),
        loadBriefs(projectId),
      ]);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecommendations(projectId: string) {
    const { data } = await supabase
      .from('recommendations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setRecommendations((data || []) as Recommendation[]);
  }

  async function loadFeedItems(_projectId: string) {
    // Note: feed_items are global, not per-project (we filter by relevance in backend)
    const { data } = await supabase
      .from('feed_items')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(50);
    setFeedItems((data || []) as FeedItem[]);
  }

  async function loadBriefs(projectId: string) {
    const { data } = await supabase
      .from('brief_archive')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setBriefs((data || []) as BriefArchive[]);
  }

  function getPriorityBadge(priority: string) {
    const classes: Record<string, string> = {
      critical: 'badge-critical',
      high: 'badge-high',
      medium: 'badge-medium',
      low: 'badge-low',
      info: 'badge-info',
    };
    return classes[priority] || 'badge-info';
  }

  function getActionBadge(action: string) {
    const classes: Record<string, string> = {
      REPLACE_EXISTING: 'badge-replace',
      COMPLEMENT: 'badge-complement',
      NEW_CAPABILITY: 'badge-new',
      MONITOR: 'badge-monitor',
    };
    return classes[action] || 'badge-info';
  }

  const filteredRecs = recommendations.filter((rec) => {
    if (priorityFilter !== 'all' && rec.priority !== priorityFilter) return false;
    if (deliveryFilter === 'pending' && rec.is_delivered) return false;
    if (deliveryFilter === 'delivered' && !rec.is_delivered) return false;
    return true;
  });

  const pendingCount = recommendations.filter(r => !r.is_delivered).length;

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-500">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-500">Project not found.</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
          <Link to="/projects" className="hover:text-zinc-300 transition-colors duration-150">Projects</Link>
          <span>/</span>
        </div>
        <h1 className="text-lg font-semibold text-zinc-100">{project.name}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-zinc-800 mb-4 overflow-x-auto">
        {(['overview', 'recommendations', 'feed', 'breaking', 'history'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab whitespace-nowrap ${activeTab === tab ? 'tab-active' : ''}`}
          >
            {tab === 'breaking' ? 'Breaking Changes' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'recommendations' && pendingCount > 0 && (
              <span className="ml-1.5 badge badge-accent">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          project={project}
          stack={stack}
          health={health}
          findings={findings}
          manifest={manifest}
        />
      )}

      {activeTab === 'recommendations' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="input w-auto"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value)}
              className="input w-auto"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>

          {/* Recommendations List */}
          {filteredRecs.length === 0 ? (
            <div className="text-sm text-zinc-500 py-8 text-center">
              No recommendations match the current filters.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRecs.map((rec) => (
                <div key={rec.id} className="card">
                  <div
                    className="flex items-start justify-between gap-3 cursor-pointer"
                    onClick={() => setExpandedRec(expandedRec === rec.id ? null : rec.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/projects/${project.id}/rec/${rec.id}`}
                          className="text-sm font-medium text-zinc-100 hover:text-emerald-400 transition-colors duration-150"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {rec.subject.name}
                        </Link>
                        <span className={`badge ${getActionBadge(rec.action)}`}>
                          {rec.action.replace('_', ' ')}
                        </span>
                        <span className={`badge ${getPriorityBadge(rec.priority)}`}>
                          {rec.priority}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                        <span>Confidence: {Math.round(rec.confidence * 100)}%</span>
                        <span>Verdict: {rec.stability_assessment.verdict}</span>
                        <span className={`badge ${!rec.is_delivered ? 'badge-accent' : 'badge-info'}`}>
                          {rec.is_delivered ? 'Delivered' : 'Pending'}
                        </span>
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-zinc-400 transition-transform ${expandedRec === rec.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* Expanded Detail */}
                  {expandedRec === rec.id && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => setBriefView('technical')}
                          className={`text-xs px-2 py-1 rounded-sm transition-colors duration-150 ${briefView === 'technical' ? 'bg-emerald-600 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                        >
                          Technical
                        </button>
                        <button
                          onClick={() => setBriefView('human')}
                          className={`text-xs px-2 py-1 rounded-sm transition-colors duration-150 ${briefView === 'human' ? 'bg-emerald-600 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                        >
                          Summary
                        </button>
                      </div>

                      {briefView === 'technical' ? (
                        <div className="text-sm space-y-2">
                          <p className="text-zinc-400">{rec.human_friendly.one_liner}</p>
                          <div>
                            <span className="text-xs font-medium text-zinc-500">Effort:</span>
                            <span className="ml-2 text-zinc-300">{rec.technical.effort.calibrated_estimate_days} days</span>
                            <span className="ml-2 badge badge-info">{rec.technical.effort.complexity}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-400">
                          <p>{rec.human_friendly.summary}</p>
                        </div>
                      )}

                      <Link
                        to={`/projects/${project.id}/rec/${rec.id}`}
                        className="inline-block mt-3 text-xs text-emerald-400 hover:text-emerald-300 transition-colors duration-150"
                      >
                        View full details →
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'feed' && (
        <div className="table-scroll">
          <table className="table-dense">
            <thead>
              <tr>
                <th>Title</th>
                <th className="w-24">Source</th>
                <th className="w-28">Traction</th>
                <th className="w-28">Published</th>
              </tr>
            </thead>
            <tbody>
              {feedItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a
                      href={item.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-100 hover:text-emerald-400 transition-colors duration-150"
                    >
                      {item.title}
                    </a>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {item.technologies.slice(0, 3).map((tech) => (
                        <span key={tech} className="badge badge-info">{tech}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-info">{item.source_name}</span>
                  </td>
                  <td className="text-xs text-zinc-500">
                    {item.traction.githubStars && `★ ${item.traction.githubStars}`}
                    {item.traction.hnPoints && `↑ ${item.traction.hnPoints}`}
                    {item.traction.npmWeeklyDownloads && `${(item.traction.npmWeeklyDownloads / 1000).toFixed(0)}k/w`}
                  </td>
                  <td className="text-xs text-zinc-500">
                    {item.published_at ? new Date(item.published_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'breaking' && (
        <div className="text-sm text-zinc-500 py-8 text-center">
          No breaking change alerts at this time.
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          {briefs.length === 0 ? (
            <div className="text-sm text-zinc-500 py-8 text-center">
              No archived briefs yet.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Format</th>
                    <th>Items</th>
                    <th>Created</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {briefs.map((brief) => (
                    <tr key={brief.id}>
                      <td className="capitalize">{brief.brief_type.replace('_', ' ')}</td>
                      <td className="uppercase text-xs">{brief.format}</td>
                      <td>{brief.recommendation_count}</td>
                      <td className="text-xs text-zinc-500">
                        {new Date(brief.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button className="btn btn-ghost text-xs">Download</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Overview Tab Component
function OverviewTab({
  project,
  stack,
  health,
  findings,
  manifest: _manifest,
}: {
  project: Project;
  stack: ProjectStack | null;
  health: StackHealth | null;
  findings: CFinding[];
  manifest: ProjectManifest | null;
}) {
  function getHealthColor(score: number) {
    if (score >= 0.8) return 'bg-emerald-500';
    if (score >= 0.6) return 'bg-amber-500';
    if (score >= 0.4) return 'bg-orange-500';
    return 'bg-red-500';
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Stack Health */}
      <div className="card">
        <h3 className="text-sm font-medium text-zinc-100 mb-3">Stack Health</h3>
        {health ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-semibold text-zinc-100">
                {Math.round(health.overall_score * 100)}%
              </div>
              <div className="flex-1">
                <div className="health-bar h-2">
                  <div
                    className={`health-bar-fill ${getHealthColor(health.overall_score)}`}
                    style={{ width: `${health.overall_score * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(health.components).map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-zinc-500 capitalize">{key}</span>
                  <span className="text-zinc-300">{Math.round(val.score * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No health data available.</div>
        )}
      </div>

      {/* CF Findings */}
      <div className="card">
        <h3 className="text-sm font-medium text-zinc-100 mb-3">Code Findings</h3>
        {findings.length > 0 ? (
          <div className="space-y-2">
            {findings.slice(0, 5).map((f) => (
              <div key={f.id} className="flex items-start gap-2 text-sm">
                <span className={`badge badge-${f.severity}`}>{f.severity}</span>
                <span className="text-zinc-400 text-xs">{f.description}</span>
              </div>
            ))}
            {findings.length > 5 && (
              <div className="text-xs text-zinc-500">+{findings.length - 5} more</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No unresolved findings.</div>
        )}
      </div>

      {/* Scouting Config */}
      <div className="card">
        <h3 className="text-sm font-medium text-zinc-100 mb-3">Scouting Config</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Status</span>
            <span className={`badge ${project.scouting_enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              {project.scouting_enabled ? 'Active' : 'Paused'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Frequency</span>
            <span className="text-zinc-300 capitalize">{project.scouting_frequency}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Max Recommendations</span>
            <span className="text-zinc-300">{project.max_recommendations}</span>
          </div>
          <div>
            <span className="text-zinc-500 block mb-1">Focus Areas</span>
            <div className="flex gap-1 flex-wrap">
              {project.focus_areas.map((area) => (
                <span key={area} className="badge badge-info">{area}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Data Collected (Privacy) */}
      <div className="card">
        <h3 className="text-sm font-medium text-zinc-100 mb-3">Data Collected</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Only manifest data is analyzed. Source code is never accessed.
        </p>
        {stack ? (
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-zinc-500">Languages:</span>
              <span className="ml-2 text-zinc-300">
                {stack.languages.map(l => `${l.name} (${l.percentage}%)`).join(', ')}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Frameworks:</span>
              <span className="ml-2 text-zinc-300">
                {stack.frameworks.map(f => f.name).join(', ') || 'None detected'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Dependencies:</span>
              <span className="ml-2 text-zinc-300">
                {Object.entries(stack.all_dependencies)
                  .map(([eco, data]) => `${eco}: ${data.direct + data.dev}`)
                  .join(', ')}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No stack data available.</div>
        )}
      </div>
    </div>
  );
}
