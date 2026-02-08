# ============================================================
# TechScout — System Architecture v1.1
# ============================================================
# Technology Intelligence proattiva per sviluppatori.
# Governance: IFX/KQR. Security: codice mai esposto.
#
# CHANGELOG v1.1:
#   - Stability Gate nel Layer 3 (bias verso stabilita)
#   - Breaking Change Alerts (bypass ranking, consegna immediata)
#   - Cost Tracking post-adozione (calibra stime future)
#   - Team/Role awareness (filtro delivery per ruolo)
#   - Export/Archivio automatico (PDF + JSON)
# ============================================================


## PRINCIPIO FONDAMENTALE

Il sistema ha un BIAS ESPLICITO VERSO LA STABILITA'.
Non suggerisce cambiamenti perche "e' uscito qualcosa di nuovo".
Suggerisce cambiamenti SOLO quando il costo del non-cambiare
supera il costo del cambiare.

Un brief vuoto ("nessuna raccomandazione, il tuo stack e' sano")
e' un output di altissimo valore.


## SYSTEM DIAGRAM

```
USER
  |
  |  1. Crea progetto
  |  2. Sceglie provider (GitHub/GitLab/local/...)
  |  3. Compila manifest (obiettivi, pain points)
  |  4. Opzionale: importa CF findings
  |  5. Opzionale: aggiunge team members con ruoli
  |
  v
+------------------------------------------------------------------+
|                     LAYER 1: INGESTION                            |
|                                                                   |
|  Providers:                                                       |
|  [GitHub] [GitLab] [Bitbucket] [Vercel] [Railway]               |
|  [Local Upload] [CLI Local] [Manual Manifest]                    |
|                                                                   |
|  Tutti convergono nel NORMALIZER                                  |
|       |                                                           |
|       v                                                           |
|  project_profile.json                                             |
|  + CF findings (metadata only)                                    |
|  + stack_health score (calcolato automaticamente)                 |
|  + cost_tracking history (da feedback precedenti)                 |
+------------------------------------------------------------------+
       |
       v
+------------------------------------------------------------------+
|                     LAYER 2: FEED AGGREGATION                     |
|                                                                   |
|  20+ fonti organizzate in 3 tier:                                |
|  Tier 1: HN, YC, TechCrunch, GitHub Trending, Product Hunt       |
|  Tier 2: ThoughtWorks, Weekly newsletters, VC blogs, Lobsters     |
|  Tier 3: Reddit, DEV.to                                          |
|  + Conditional feeds per ecosistema                               |
|                                                                   |
|  Output: tech_feed.json (normalizzato, deduplicato)              |
+------------------------------------------------------------------+
       |
       v
+------------------------------------------------------------------+
|                     LAYER 3: MATCHING ENGINE                      |
|                                                                   |
|  STEP 1: Pre-Filter (deterministico, zero LLM)                  |
|  ~200 items/day -> ~15-30                                        |
|       |                                                           |
|       v                                                           |
|  STEP 2: Maturity Filter                                         |
|  - experimental (<6mo) -> solo MONITOR                           |
|  - growth (6-18mo) -> COMPLEMENT/NEW_CAPABILITY                  |
|  - stable (18mo+) -> qualsiasi action                            |
|       |                                                           |
|       v                                                           |
|  STEP 3: LLM Analysis (Claude Sonnet, top-N only)               |
|  Input: project_profile + cf_findings + feed item                |
|  Output: IFX-tagged analysis + KQR confidence                    |
|  ~15-30 items -> ~3-8 candidate recommendations                  |
|       |                                                           |
|       v                                                           |
|  STEP 4: STABILITY GATE (v1.1)                                   |
|  Per ogni candidato:                                              |
|                                                                   |
|    cost_of_change        vs       cost_of_no_change              |
|    - effort giorni                - security exposure             |
|    - regression risk              - maintenance risk              |
|    - learning curve               - deprecation risk              |
|    - tests da aggiornare          - compliance risk               |
|                                                                   |
|    SE cost_no_change > cost_change -> RECOMMEND                  |
|    SE cost_no_change ~ cost_change -> MONITOR                    |
|    SE cost_no_change < cost_change -> DROP (non nel brief)       |
|                                                                   |
|    Stack health modifica la soglia:                               |
|    score > 0.8 -> soglia ALTA (quasi niente passa)               |
|    score 0.5-0.8 -> soglia MEDIA                                 |
|    score < 0.5 -> soglia BASSA                                   |
|                                                                   |
|    Pain point match abbassa la soglia per quell'area             |
|       |                                                           |
|       v                                                           |
|  STEP 5: Ranking & Cap                                           |
|  score = impact * confidence * recency                           |
|  cap: max 5 per brief (configurabile)                            |
|       |                                                           |
|       v                                                           |
|  STEP 6: Effort Calibration (v1.1)                               |
|  Se ci sono adozioni precedenti nel cost_tracking:               |
|  - Calcola bias (over/underestimate)                             |
|  - Applica fattore di calibrazione alla stima                    |
|  - Mostra sia stima raw che calibrata                            |
|                                                                   |
|  PARALLEL: Breaking Change Detection (v1.1)                      |
|  Monitora releases delle dipendenze del progetto.                |
|  Se rileva major version / deprecation / CVE / EOL:             |
|  -> Bypassa Stability Gate                                       |
|  -> Bypassa ranking e cap                                        |
|  -> Consegna IMMEDIATA come alert                                |
+------------------------------------------------------------------+
       |
       v
+------------------------------------------------------------------+
|                     LAYER 4: DELIVERY (v1.1)                      |
|                                                                   |
|  ROLE-FILTERED DELIVERY:                                         |
|                                                                   |
|  developer_frontend:                                              |
|    -> raccomandazioni categoria frontend/ui/styling               |
|    -> brief tecnico                                               |
|                                                                   |
|  developer_backend:                                               |
|    -> raccomandazioni categoria backend/auth/db/infra             |
|    -> brief tecnico                                               |
|                                                                   |
|  developer_fullstack:                                             |
|    -> TUTTE le raccomandazioni                                    |
|    -> brief tecnico                                               |
|                                                                   |
|  pm:                                                              |
|    -> TUTTE le raccomandazioni                                    |
|    -> brief human-friendly (con verdict_plain + talking points)  |
|                                                                   |
|  stakeholder:                                                     |
|    -> solo priority high/critical                                 |
|    -> brief human-friendly                                        |
|                                                                   |
|  1 persona senza ruolo:                                          |
|    -> tutto, entrambi i formati                                   |
|                                                                   |
|  EXPORT (v1.1):                                                   |
|  Dopo ogni brief:                                                 |
|  -> PDF generato automaticamente                                  |
|  -> JSON dump completo                                            |
|  -> Salvati in Supabase Storage                                   |
|  -> Accessibili dalla dashboard (archivio)                        |
|  -> Retention configurabile (default 365 giorni)                  |
+------------------------------------------------------------------+
       |
       v
+------------------------------------------------------------------+
|                     LAYER 5: FEEDBACK LOOP (v1.1)                 |
|                                                                   |
|  Per ogni raccomandazione l'utente marca:                        |
|  USEFUL | NOT_RELEVANT | ALREADY_KNEW | ADOPTED | DISMISSED     |
|                                                                   |
|  Se ADOPTED, campi opzionali aggiuntivi (v1.1):                 |
|  - actual_days (giorni effettivi)                                |
|  - notes (testo libero)                                          |
|  - unexpected_issues                                              |
|                                                                   |
|  Il feedback alimenta:                                            |
|  -> Pre-filter weights (Layer 3 Step 1)                          |
|  -> Stack health recalculation                                    |
|  -> Cost tracking calibration (v1.1)                              |
|  -> Source reliability scores (KQR)                               |
+------------------------------------------------------------------+


## LAYER 6: MIGRATION AGENT (opzionale)

```
Raccomandazione marcata ADOPTED
    |
    v
[OPT-IN CHECK] agent_config.enabled == true?
    |                          |
    no -> STOP (flow           yes
    |     classico)              |
    v                            v
Feedback manuale          [PREFLIGHT]
                          - base branch clean?
                          - tests green?
                          - scope within limits?
                          - no forbidden paths?
                                |
                                v (all passed)
                          [BACKUP — NON NEGOZIABILE]
                          - crea branch techscout/migrate/{rec-id}
                          - commit stato attuale
                          - push
                                |
                                v
                     +-----[MODE CHECK]-----+
                     |                      |
                  assisted              supervised
                     |                      |
                     v                      v
                  Esegue              Genera piano
                  subito              e ASPETTA ok
                     |                      |
                     |               [HUMAN: approve?]
                     |                  si  |  no
                     |                  |   v
                     |                  | ABORT
                     v                  v
                  [EXECUTION]
                  Claude Code lavora sul branch
                  - safety monitor attivo
                  - max files/lines/time
                  - se ambiguita alta -> STOP
                  - se forbidden path -> STOP
                        |
                        v
                  [TESTING]
                  - test suite
                  - lint
                  - typecheck
                  - se fail -> safety_stop
                        |
                        v (all green)
                  [MIGRATION REPORT]
                  - diff stats
                  - CF findings risolti
                  - effort comparison (stima vs reale)
                  - observations + discoveries
                  - review checklist
                        |
                        v
                  [PR OPENED]
                  Branch -> main
                  Labels: techscout, migration, {category}
                        |
                        v
                  [HUMAN GATE — NON NEGOZIABILE]
                  L'utente review, approva o rifiuta.
                  L'agente NON mergia mai.
                        |
                        v (merged via webhook)
                  [POST-MERGE AUTO]
                  - recommendation.status -> adopted
                  - cost_tracking aggiornato
                  - cf_findings.status -> resolved
                  - stack_health ricalcolato
```

SAFETY GATES (qualunque violazione -> STOP immediato):
  - files_modified > max_files_modified (default: 15)
  - lines_changed > max_lines_changed (default: 500)
  - execution_time > max_execution_time (default: 30 min)
  - effort_reale > stima * complexity_threshold (default: 2x)
  - accesso a forbidden_paths (.env, terraform/, migrations/)
  - operazione proibita (merge, force push, rm -rf, DROP TABLE)
  - test/lint/typecheck failure
  - ambiguita con confidence < 0.5

L'agente NON PUO MAI:
  - Fare merge su main/production
  - Force push
  - Toccare file .env, secrets, infra (terraform/k8s)
  - Modificare DB migrations
  - Prendere decisioni architetturali
  - Pubblicare pacchetti
  - Continuare se i test falliscono


## INFRASTRUCTURE

  Orchestrator:  n8n (self-hosted)
  Database:      Supabase (PostgreSQL)
  LLM:           Claude API (Sonnet batch, Opus on-demand)
  Agent:         Claude Code (migration execution)
  Hosting:       Railway / VPS ($5-20/month)
  Dashboard:     React + Supabase Realtime
  Auth:          Supabase Auth
  Storage:       Supabase Storage (export PDF/JSON)
  Git:           GitHub API (branch/PR management)


## DATA FLOW RULES

  NEVER: codice sorgente -> LLM
  NEVER: codice sorgente -> database
  NEVER: codice sorgente -> rete (tranne provider autenticati)

  OK: dependency list -> LLM
  OK: language breakdown -> LLM
  OK: CF findings (abstract metadata) -> LLM
  OK: manifest (user-written) -> LLM
  OK: feed items (public data) -> LLM


## GOVERNANCE

  IFX: ogni output taggato FACT/INFERENCE/ASSUMPTION
       ogni raccomandazione ha ifx_trace_id
       sezione Assumptions/Limitations obbligatoria

  KQR: ogni fonte qualificata con reliability score
       confidence tracciabile e scomponibile
       cross-validation tra fonti

  CF:  finding integrati come context (metadata only)
       mai codice all'LLM

  Stability Gate: bias esplicito verso stabilita
                  ogni raccomandazione ha verdict motivato
                  lo stack sano alza la soglia automaticamente


## BUILD ORDER

  Phase 1 — Foundation (3 giorni)
    1. Schema DB Supabase (tabelle da questi YAML)
    2. Project manifest template + UI onboarding
    3. GitHub provider (primo ingestion)

  Phase 2 — Feed Engine (2 giorni)
    4. Feed aggregator su n8n (HN + GitHub Trending + YC)
    5. Pre-filter deterministico
    6. Normalizzazione + dedup + storage

  Phase 3 — Intelligence (3 giorni)
    7. LLM matching engine (prompt + Claude API)
    8. Stability Gate
    9. IFX tagging + KQR scoring
   10. Dual output (technical + human-friendly)
   11. Effort calibration

  Phase 4 — Delivery (2 giorni)
   12. Role-filtered brief generator
   13. Breaking change alert pipeline
   14. Email/Slack delivery
   15. Export PDF/JSON automatico

  Phase 5 — Dashboard (3 giorni)
   16. Dashboard React (vista per progetto)
   17. Archivio brief con download
   18. Feedback mechanism + cost tracking UI

  Phase 6 — Migration Agent (3 giorni)
   19. Agent config UI (enable/disable, safety limits)
   20. Preflight check system
   21. Branch creation + backup automation
   22. Claude Code integration (plan + execute)
   23. Safety monitor (real-time limits)
   24. Migration report generator
   25. PR creation via GitHub API
   26. Post-merge webhook + auto-updates

  Phase 7 — Expansion (ongoing)
   27. Provider aggiuntivi (GitLab, local upload, Railway)
   28. CF integration
   29. Feed aggiuntivi (Silicon Valley deep cuts)
   30. Analytics e learning dal feedback
   31. Agent support per GitLab/Bitbucket PR

  TOTAL MVP (Phase 1-4): ~10 giorni
  TOTAL con Dashboard: ~13 giorni
  TOTAL con Agent: ~16 giorni
  TOTAL FULL: ~20-22 giorni


## COST ESTIMATE (monthly, per istanza)

  n8n self-hosted (Railway):         $5-10
  Supabase (free tier or Pro):       $0-25
  Claude API (~200 calls/month):     $2-5
  Claude Code (agent, ~5 runs/mo):   $1-3
  Supabase Storage (export):         $0-5
  Domain + misc:                     $5

  TOTAL: ~$13-53/month
  Supporta ~10 progetti attivi


## FILES IN THIS PACKAGE

  project_profile.schema.yaml    Schema del profilo progetto (v1.1)
  recommendation.schema.yaml     Schema raccomandazione + BCA (v1.1)
  agent.schema.yaml              Schema Migration Agent (v1.0)
  feeds.config.yaml              Configurazione 20+ fonti (v1.0)
  ARCHITECTURE.md                Questo file
