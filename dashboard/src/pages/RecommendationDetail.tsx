import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Recommendation, Project, RecommendationFeedback } from '../lib/types';

type FeedbackStatus = 'useful' | 'not_relevant' | 'already_knew' | 'adopted' | 'dismissed';

export function RecommendationDetailPage() {
  const { id, recId } = useParams<{ id: string; recId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [existingFeedback, setExistingFeedback] = useState<RecommendationFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showAdoptionForm, setShowAdoptionForm] = useState(false);
  const [adoptionDays, setAdoptionDays] = useState('');
  const [adoptionNotes, setAdoptionNotes] = useState('');

  useEffect(() => {
    if (id && recId) loadData();
  }, [id, recId]);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: projectData }, { data: recData }, { data: feedbackData }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('recommendations').select('*').eq('id', recId).single(),
        supabase.from('recommendation_feedback').select('*').eq('recommendation_id', recId).single(),
      ]);

      setProject(projectData as Project);
      setRec(recData as Recommendation);
      setExistingFeedback(feedbackData as RecommendationFeedback | null);
    } catch (err) {
      console.error('Failed to load recommendation:', err);
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback(feedbackStatus: FeedbackStatus) {
    if (!rec) return;

    if (feedbackStatus === 'adopted') {
      setShowAdoptionForm(true);
      return;
    }

    setSubmittingFeedback(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      await supabase.from('recommendation_feedback').insert({
        recommendation_id: rec.id,
        status: feedbackStatus,
        submitted_by: user.user.id,
        submitted_at: new Date().toISOString(),
      });

      // Mark recommendation as delivered
      await supabase.from('recommendations').update({ is_delivered: true }).eq('id', rec.id);

      loadData();
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function submitAdoption() {
    if (!rec) return;

    setSubmittingFeedback(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      await supabase.from('recommendation_feedback').insert({
        recommendation_id: rec.id,
        status: 'adopted',
        submitted_by: user.user.id,
        submitted_at: new Date().toISOString(),
        actual_days: adoptionDays ? parseInt(adoptionDays) : null,
        adoption_notes: adoptionNotes || null,
        adopted_at: new Date().toISOString(),
      });

      await supabase.from('recommendations').update({ is_delivered: true }).eq('id', rec.id);

      setShowAdoptionForm(false);
      loadData();
    } catch (err) {
      console.error('Failed to submit adoption:', err);
    } finally {
      setSubmittingFeedback(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-500">Loading recommendation...</div>
      </div>
    );
  }

  if (!rec || !project) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-500">Recommendation not found.</div>
      </div>
    );
  }

  const getActionBadgeClass = (action: string) => {
    const classes: Record<string, string> = {
      REPLACE_EXISTING: 'badge-replace',
      COMPLEMENT: 'badge-complement',
      NEW_CAPABILITY: 'badge-new',
      MONITOR: 'badge-monitor',
    };
    return classes[action] || 'badge-info';
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
        <Link to="/projects" className="hover:text-zinc-300 transition-colors duration-150">Projects</Link>
        <span>/</span>
        <Link to={`/projects/${project.id}`} className="hover:text-zinc-300 transition-colors duration-150">{project.name}</Link>
        <span>/</span>
        <span className="text-zinc-100">Recommendation</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h1 className="text-lg font-semibold text-zinc-100">{rec.subject.name}</h1>
          <span className={`badge ${getActionBadgeClass(rec.action)}`}>
            {rec.action.replace('_', ' ')}
          </span>
          <span className={`badge badge-${rec.priority}`}>{rec.priority}</span>
        </div>
        <p className="text-sm text-zinc-400">{rec.human_friendly.one_liner}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
          <span>Confidence: {Math.round(rec.confidence * 100)}%</span>
          <span>Verdict: {rec.stability_assessment.verdict}</span>
          <span>Type: {rec.subject.type}</span>
          {rec.subject.version && <span>Version: {rec.subject.version}</span>}
        </div>
      </div>

      {/* Feedback Buttons */}
      {!existingFeedback && (
        <div className="card mb-6">
          <h3 className="text-sm font-medium text-zinc-100 mb-3">Your Feedback</h3>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => submitFeedback('useful')}
              disabled={submittingFeedback}
              className="btn btn-secondary"
            >
              Useful
            </button>
            <button
              onClick={() => submitFeedback('not_relevant')}
              disabled={submittingFeedback}
              className="btn btn-secondary"
            >
              Not Relevant
            </button>
            <button
              onClick={() => submitFeedback('already_knew')}
              disabled={submittingFeedback}
              className="btn btn-secondary"
            >
              Already Knew
            </button>
            <button
              onClick={() => submitFeedback('adopted')}
              disabled={submittingFeedback}
              className="btn btn-primary"
            >
              Adopted
            </button>
            <button
              onClick={() => submitFeedback('dismissed')}
              disabled={submittingFeedback}
              className="btn btn-ghost"
            >
              Dismiss
            </button>
          </div>

          {showAdoptionForm && (
            <div className="mt-4 p-3 bg-zinc-800 border border-zinc-700 rounded-sm">
              <h4 className="text-sm font-medium text-zinc-100 mb-2">Adoption Details (optional)</h4>
              <div className="space-y-3">
                <div>
                  <label className="label">Actual days to implement</label>
                  <input
                    type="number"
                    value={adoptionDays}
                    onChange={(e) => setAdoptionDays(e.target.value)}
                    className="input w-32"
                    placeholder="e.g., 3"
                  />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    value={adoptionNotes}
                    onChange={(e) => setAdoptionNotes(e.target.value)}
                    className="input h-20"
                    placeholder="Any notes about the implementation..."
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={submitAdoption} className="btn btn-primary" disabled={submittingFeedback}>
                    Submit
                  </button>
                  <button onClick={() => setShowAdoptionForm(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {existingFeedback && (
        <div className="card mb-6 bg-zinc-800/50">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">Feedback submitted:</span>
            <span className="badge badge-accent">{existingFeedback.status}</span>
          </div>
        </div>
      )}

      {/* Technical Analysis */}
      <div className="card mb-4">
        <h3 className="text-sm font-medium text-zinc-100 mb-3">Analysis</h3>
        <div className="space-y-4">
          {/* Facts */}
          {rec.technical.analysis.facts.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Facts</h4>
              <div className="space-y-2">
                {rec.technical.analysis.facts.map((fact, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="badge ifx-fact shrink-0">FACT</span>
                    <div>
                      <span className="text-zinc-300">{fact.claim}</span>
                      <span className="text-xs text-zinc-500 ml-2">— {fact.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inferences */}
          {rec.technical.analysis.inferences.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Inferences</h4>
              <div className="space-y-2">
                {rec.technical.analysis.inferences.map((inf, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="badge ifx-inference shrink-0">INFERENCE</span>
                    <div>
                      <span className="text-zinc-300">{inf.claim}</span>
                      <span className="text-xs text-zinc-500 ml-2">
                        (confidence: {Math.round(inf.confidence * 100)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assumptions */}
          {rec.technical.analysis.assumptions.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase mb-2">Assumptions</h4>
              <div className="space-y-2">
                {rec.technical.analysis.assumptions.map((asm, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="badge ifx-assumption shrink-0">ASSUMPTION</span>
                    <span className="text-zinc-300">{asm.claim}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Effort */}
      <div className="card mb-4">
        <h3 className="text-sm font-medium text-zinc-100 mb-3">Effort Estimate</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-zinc-500">Days</div>
            <div className="text-zinc-100 font-medium">{rec.technical.effort.calibrated_estimate_days}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Complexity</div>
            <div className="text-zinc-300 capitalize">{rec.technical.effort.complexity}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Breaking Changes</div>
            <div className="text-zinc-300">{rec.technical.effort.breaking_changes ? 'Yes' : 'No'}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Reversibility</div>
            <div className="text-zinc-300 capitalize">{rec.technical.effort.reversibility}</div>
          </div>
        </div>
        {rec.technical.effort.steps.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-zinc-500 mb-1">Steps</div>
            <ol className="list-decimal list-inside text-sm text-zinc-300 space-y-1">
              {rec.technical.effort.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Impact */}
      <div className="card mb-4">
        <h3 className="text-sm font-medium text-zinc-100 mb-3">Impact</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {Object.entries(rec.technical.impact).map(([key, val]) => (
            <div key={key}>
              <div className="text-xs text-zinc-500 capitalize">{key}</div>
              {typeof val === 'object' && 'score_change' in val ? (
                <div className="text-zinc-300">{val.score_change}</div>
              ) : typeof val === 'object' && 'level' in val ? (
                <div className="text-zinc-300">
                  <span className={`badge badge-${val.level}`}>{val.level}</span>
                </div>
              ) : (
                <div className="text-zinc-500">—</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tradeoffs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <h3 className="text-sm font-medium text-emerald-400 mb-2">Gains</h3>
          <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1">
            {rec.technical.tradeoffs.gains.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-red-400 mb-2">Losses</h3>
          <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1">
            {rec.technical.tradeoffs.losses.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Failure Modes */}
      {rec.technical.failure_modes.length > 0 && (
        <div className="card mb-4">
          <h3 className="text-sm font-medium text-zinc-100 mb-3">Failure Modes</h3>
          <div className="space-y-2">
            {rec.technical.failure_modes.map((fm, i) => (
              <div key={i} className="text-sm border-l-2 border-zinc-700 pl-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-300">{fm.mode}</span>
                  <span className={`badge badge-${fm.probability === 'high' ? 'high' : fm.probability === 'medium' ? 'medium' : 'low'}`}>
                    {fm.probability}
                  </span>
                </div>
                <div className="text-zinc-500 text-xs mt-1">Mitigation: {fm.mitigation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Human Summary */}
      <div className="card mb-4">
        <h3 className="text-sm font-medium text-zinc-100 mb-3">Summary</h3>
        <p className="text-sm text-zinc-400 whitespace-pre-wrap">{rec.human_friendly.summary}</p>
        <div className="mt-3">
          <h4 className="text-xs font-medium text-zinc-500 mb-1">Why Now?</h4>
          <p className="text-sm text-zinc-400">{rec.human_friendly.why_now}</p>
        </div>
      </div>

      {/* Limitations */}
      {rec.technical.limitations.length > 0 && (
        <div className="card bg-amber-500/10 border-amber-500/20">
          <h3 className="text-sm font-medium text-amber-400 mb-2">Limitations</h3>
          <ul className="list-disc list-inside text-sm text-amber-300/80 space-y-1">
            {rec.technical.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Trace ID */}
      <div className="mt-6 text-xs text-zinc-400">
        Trace ID: {rec.ifx_trace_id}
      </div>
    </div>
  );
}
