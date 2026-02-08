# TechScout — Claude Code Context

## WHAT IS THIS PROJECT

TechScout è una piattaforma di technology intelligence proattiva.
Monitora tecnologie emergenti rilevanti per i progetti dell'utente
e produce raccomandazioni actionable con governance IFX/KQR.

**Stack**: TypeScript, Supabase (PostgreSQL), n8n, Claude API
**Principio**: bias verso stabilità. Codice sorgente mai esposto.

## ARCHITECTURE — 6 LAYERS

```
L1: Ingestion    → Estrae profilo progetto da provider (GitHub/GitLab/local)
L2: Feeds        → Aggrega 20+ fonti tech (HN, YC, GitHub Trending, newsletters)
L3: Matching     → Pre-filter → Maturity → LLM Analysis → Stability Gate → Ranking
L4: Delivery     → Brief tecnico (dev) + human-friendly (PM), filtrato per ruolo
L5: Feedback     → USEFUL/NOT_RELEVANT/ADOPTED/DISMISSED + cost tracking
L6: Agent        → Claude Code esegue migrazioni su branch isolato (opzionale)
```

## GOVERNANCE PROTOCOLS

### IFX (Information Flow eXplicitness)
Ogni claim nel sistema DEVE essere taggato:
- `FACT` → verificabile senza assunzioni
- `INFERENCE` → derivato logicamente da FACT
- `ASSUMPTION` → ipotesi esplicita non verificata

Ogni output ha `ifx_trace_id`. Sezione Assumptions/Limitations obbligatoria.

### KQR (Knowledge Qualification & Reliability)
Ogni fonte ha un reliability score: very_high | high | medium | low
Confidence = weighted(source_reliability × factual_basis × inference_quality × (1 - assumption_risk))

## PROJECT STRUCTURE

```
techscout/
├── CLAUDE.md                    # Questo file
├── package.json
├── tsconfig.json
├── .env.example
├── .env                         # NON committare
├── supabase/
│   └── migrations/              # SQL migrations ordinate per timestamp
├── src/
│   ├── types/                   # TypeScript types (da schema YAML)
│   │   ├── project-profile.ts
│   │   ├── recommendation.ts
│   │   ├── feed-item.ts
│   │   └── agent.ts
│   ├── db/                      # Supabase client + query helpers
│   │   ├── client.ts
│   │   └── queries.ts
│   ├── lib/                     # Utilities condivise
│   │   ├── ifx.ts               # IFX tagging helpers
│   │   ├── kqr.ts               # KQR scoring
│   │   └── logger.ts
│   ├── providers/               # L1: Project ingestion
│   │   ├── github.ts
│   │   ├── gitlab.ts
│   │   ├── local.ts
│   │   └── normalizer.ts        # Tutti i provider convergono qui
│   ├── feeds/                   # L2: Feed aggregation
│   │   ├── sources/             # Un file per fonte
│   │   ├── normalizer.ts
│   │   └── dedup.ts
│   ├── matching/                # L3: Matching engine
│   │   ├── prefilter.ts         # Deterministico, zero LLM
│   │   ├── maturity.ts          # Maturity gate
│   │   ├── analyzer.ts          # LLM analysis (Claude API)
│   │   ├── stability-gate.ts    # Cost of change vs cost of no-change
│   │   └── ranker.ts            # Final ranking + cap
│   ├── delivery/                # L4: Output
│   │   ├── technical-brief.ts
│   │   ├── human-brief.ts
│   │   ├── email.ts
│   │   ├── slack.ts
│   │   └── export.ts            # PDF/JSON export
│   └── agent/                   # L6: Migration agent
│       ├── preflight.ts
│       ├── backup.ts
│       ├── planner.ts
│       ├── executor.ts
│       ├── reporter.ts
│       └── safety.ts
├── tests/
├── scripts/
│   ├── seed-project.ts          # Crea un progetto di test
│   └── run-pipeline.ts          # Esegue pipeline manualmente
├── architecture/                # Schema YAML di reference
│   ├── ARCHITECTURE.md
│   ├── project_profile.schema.yaml
│   ├── recommendation.schema.yaml
│   ├── agent.schema.yaml
│   └── feeds.config.summary.yaml
└── .github/
    └── workflows/
```

## DATA FLOW RULES — NON NEGOZIABILI

```
❌ NEVER: source code → LLM
❌ NEVER: source code → database
❌ NEVER: source code → network (tranne provider autenticati)

✅ OK: dependency lists, language stats, CF metadata, manifest, feed items → LLM
```

## CONVENTIONS

- **Language**: TypeScript strict
- **Runtime**: Node.js 20+
- **Database**: Supabase (PostgreSQL 15). Usa `@supabase/supabase-js`
- **LLM**: `@anthropic-ai/sdk`. Model: `claude-sonnet-4-5-20250929` per batch
- **Formatting**: Nessun linter configurato per ora, mantieni consistenza
- **Naming**: camelCase per variabili/funzioni, PascalCase per types/interfaces
- **Exports**: named exports, no default
- **Error handling**: never swallow errors silently. Log + rethrow or handle
- **IFX**: ogni funzione che produce output taggabile deve usare helpers da `src/lib/ifx.ts`

## ENVIRONMENT VARIABLES

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
GITHUB_TOKEN=
```

## CURRENT PHASE: 1 — Foundation

### Task 1.1: Database Schema
Crea le migration SQL in `supabase/migrations/`.
Tabelle da creare (derivate dagli schema YAML):

- `projects` — identità + config scouting
- `project_sources` — provider collegati (1:N con projects)
- `project_stack` — stack normalizzato (JSONB)
- `project_manifest` — obiettivi, pain points, constraints (JSONB)
- `project_team` — membri con ruoli (1:N con projects)
- `cf_findings` — Code Forensics findings (1:N con projects)
- `stack_health` — score calcolato (1:1 con projects)
- `feed_items` — items normalizzati da tutte le fonti
- `recommendations` — output del matching engine
- `recommendation_feedback` — feedback utente + cost tracking
- `migration_jobs` — esecuzioni dell'agent (1:N con recommendations)
- `audit_log` — log immutabile di tutte le azioni agent
- `brief_archive` — export PDF/JSON archiviati

Usa JSONB dove la struttura è flessibile (stack, manifest, findings).
Usa colonne tipizzate dove i dati sono strutturati e query-abili.
RLS: abilita su tutte le tabelle, policy basata su auth.uid() = owner_id.

### Task 1.2: TypeScript Types
Genera i types in `src/types/` dagli schema YAML.
I types devono essere la single source of truth per il codice.

### Task 1.3: Supabase Client + Helpers
Setup `src/db/client.ts` con Supabase client.
`src/db/queries.ts` con le query base CRUD per ogni tabella.

### Task 1.4: GitHub Provider (primo ingestion)
`src/providers/github.ts`:
- Autenticazione via GitHub token
- Fetch repo metadata (languages, topics)
- Fetch dependency files (package.json, requirements.txt, etc.)
- Parse dependencies (direct + dev)
- Output: partial ProjectProfile

`src/providers/normalizer.ts`:
- Prende output da qualsiasi provider
- Produce ProjectProfile normalizzato conforme allo schema

### Task 1.5: IFX/KQR Helpers
`src/lib/ifx.ts`:
- `tagFact(claim, source, sourceReliability)` → IFXTaggedClaim
- `tagInference(claim, derivedFrom, confidence)` → IFXTaggedClaim
- `tagAssumption(claim)` → IFXTaggedClaim
- `generateTraceId()` → string

`src/lib/kqr.ts`:
- `qualifySource(source)` → KQRSource
- `calculateConfidence(sources, factualBasis, inferenceQuality, assumptionRisk)` → number

### Task 1.6: Seed Script
`scripts/seed-project.ts`:
- Crea un progetto di esempio in Supabase
- Popola con dati realistici (basati sullo schema YAML di esempio)
- Utile per testare i layer successivi

## IMPORTANT NOTES FOR CLAUDE CODE

1. Gli schema YAML in `architecture/` sono la reference. I types TypeScript
   devono essere derivati da quelli schema. Se c'è conflitto, lo schema vince.

2. Non inventare campi che non esistono negli schema.

3. Quando scrivi query SQL, pensa a come il Layer 3 (matching) farà le query.
   Feed items e recommendations verranno filtrati pesantemente per progetto,
   data, e stato. Indici appropriati.

4. Il campo JSONB è comodo ma non abusarne. Se un campo verrà usato in WHERE
   o ORDER BY, fallo colonna tipizzata.

5. Ogni migration deve essere idempotent-safe e avere un commento in testa
   che spiega cosa fa.
