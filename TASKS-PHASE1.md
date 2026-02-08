# ============================================================
# TechScout — Phase 1 Tasks for Claude Code
# ============================================================
# Dai questi task a Claude Code uno alla volta.
# Ogni task ha un prompt pronto da copiare.
# L'ordine è importante: ogni task dipende dal precedente.
# ============================================================


## TASK 1.1 — Database Schema

Prompt:
```
Leggi CLAUDE.md e architecture/project_profile.schema.yaml e
architecture/recommendation.schema.yaml e architecture/agent.schema.yaml.

Crea la migration SQL in supabase/migrations/001_initial_schema.sql
con tutte le tabelle del sistema. Segui le indicazioni nel CLAUDE.md
sezione Task 1.1. Usa JSONB dove indicato, colonne tipizzate dove
i dati verranno filtrati. Crea gli indici per le query più comuni.
Abilita RLS su tutte le tabelle.
```

Verifica dopo:
- [ ] Tutte le tabelle create
- [ ] RLS abilitato
- [ ] Indici su project_id, created_at, status dove serve
- [ ] JSONB per stack, manifest, cf_findings
- [ ] Colonne tipizzate per campi filtrabili


## TASK 1.2 — TypeScript Types

Prompt:
```
Leggi gli schema YAML in architecture/ e crea i TypeScript types
in src/types/. Crea:
- src/types/project-profile.ts (da project_profile.schema.yaml)
- src/types/recommendation.ts (da recommendation.schema.yaml)
- src/types/feed-item.ts (item normalizzato dal feed)
- src/types/agent.ts (da agent.schema.yaml)
- src/types/ifx.ts (IFXTag, IFXTaggedClaim, IFXTrace)
- src/types/kqr.ts (KQRSource, KQRConfidence)
- src/types/index.ts (barrel export)

Usa Zod per le validazioni runtime oltre ai types.
I types devono rispecchiare fedelmente gli schema YAML.
```

Verifica dopo:
- [ ] Types coprono tutti i campi degli schema
- [ ] Zod schemas per validazione runtime
- [ ] Barrel export in index.ts


## TASK 1.3 — Supabase Client + Query Helpers

Prompt:
```
Crea src/db/client.ts con il Supabase client (legge da env vars).
Crea src/db/queries.ts con le query CRUD base per ogni tabella:
- createProject, getProject, updateProject, listProjects
- addSource, getSources
- upsertStack, getStack
- addFeedItem, getFeedItems (con filtri per ecosystem, date range)
- createRecommendation, getRecommendations, updateRecommendationFeedback
- createMigrationJob, updateMigrationJob
- appendAuditLog

Ogni funzione deve avere typing corretto usando i types da src/types/.
Gestione errori: log + throw, mai swallow.
```

Verifica dopo:
- [ ] Client inizializzato correttamente
- [ ] Query per ogni tabella principale
- [ ] Typing corretto
- [ ] Error handling


## TASK 1.4 — GitHub Provider

Prompt:
```
Crea src/providers/github.ts:
- Usa Octokit per autenticazione
- fetchRepoMetadata(owner, repo): languages, topics, default branch
- fetchDependencyFiles(owner, repo): scarica package.json, requirements.txt,
  pyproject.toml, Cargo.toml, go.mod, Gemfile, composer.json
- parseDependencies(files): estrae dipendenze direct + dev per ecosistema

Crea src/providers/normalizer.ts:
- normalizeFromGitHub(githubData, manifest): produce ProjectProfile completo
- La funzione deve combinare dati dal provider con il manifest dell'utente
- Calcola stack_health iniziale (score basato su dependency freshness)

IMPORTANTE: il provider scarica SOLO file manifest (package.json etc.),
MAI codice sorgente. Questo è un vincolo di sicurezza non negoziabile.
```

Verifica dopo:
- [ ] GitHub auth funziona
- [ ] Scarica solo manifest files
- [ ] Parse corretto di package.json + requirements.txt
- [ ] Normalizer produce ProjectProfile valido
- [ ] Nessun codice sorgente toccato


## TASK 1.5 — IFX/KQR Helpers

Prompt:
```
Crea src/lib/ifx.ts:
- tagFact(claim, source, sourceReliability): IFXTaggedClaim
- tagInference(claim, derivedFrom, confidence): IFXTaggedClaim
- tagAssumption(claim): IFXTaggedClaim
- generateTraceId(): string (formato: IFX-YYYY-MMDD-XXX)
- validateTrace(claims): controlla che ci sia almeno 1 FACT e
  che ogni INFERENCE abbia derivedFrom

Crea src/lib/kqr.ts:
- qualifySource(name, type, reliability): KQRSource
- calculateConfidence(sources, factualBasis, inferenceQuality, assumptionRisk): number
- generateQualificationStatement(confidence, sources): string

Crea src/lib/logger.ts:
- Logger semplice con livelli: debug, info, warn, error
- Ogni log entry ha timestamp e context
```

Verifica dopo:
- [ ] IFX tagging produce claim validi
- [ ] Trace ID con formato corretto
- [ ] KQR confidence formula corretta
- [ ] Logger funziona


## TASK 1.6 — Seed Script

Prompt:
```
Crea scripts/seed-project.ts che:
1. Connette a Supabase
2. Crea un progetto di esempio "BetStarters Sales Automation"
   con tutti i dati dell'esempio nello schema YAML
3. Popola: sources, stack, manifest, cf_findings, stack_health
4. Crea 2 feed items di esempio
5. Crea 1 recommendation di esempio (la BetterAuth dallo schema)
6. Log di conferma per ogni insert

Usa i types e le query helpers creati nei task precedenti.
Il seed deve essere idempotent (cancella e ricrea se esiste).
```

Verifica dopo:
- [ ] Script eseguibile con `npm run seed`
- [ ] Dati inseriti correttamente
- [ ] Idempotent (può essere rieseguito)


## DOPO PHASE 1

Quando tutti i 6 task sono completati e verificati:
1. Testa con `npm run seed` su un progetto Supabase reale
2. Verifica che i types matchino il DB
3. Verifica che il GitHub provider funzioni su un repo pubblico

Poi si passa a Phase 2: Feed Engine.
