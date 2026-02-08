# TechScout

Proactive technology intelligence platform that monitors emerging technologies relevant to your projects and produces actionable recommendations with IFX/KQR governance.

## Overview

TechScout automatically:
- Ingests your project's stack from GitHub/GitLab
- Aggregates 20+ tech feeds (Hacker News, GitHub Trending, npm, Product Hunt, YC Launches)
- Matches relevant technologies using LLM analysis with stability bias
- Delivers role-filtered briefs (technical for devs, human-friendly for PMs)
- Collects feedback to improve recommendation quality
- Optionally executes migrations on isolated branches (human approval required)

## Architecture

```
L1: Ingestion    → Extracts project profile from providers (GitHub/GitLab/local)
L2: Feeds        → Aggregates 20+ tech sources with deduplication
L3: Matching     → Pre-filter → Maturity → LLM Analysis → Stability Gate → Ranking
L4: Delivery     → Technical brief (dev) + human-friendly (PM), email, Slack, PDF
L5: Feedback     → USEFUL/NOT_RELEVANT/ADOPTED/DISMISSED + cost tracking
L6: Agent        → Claude Code executes migrations on isolated branch (optional)
```

## Governance Protocols

### IFX (Information Flow eXplicitness)
Every claim is tagged:
- `FACT` → Verifiable without assumptions
- `INFERENCE` → Logically derived from facts
- `ASSUMPTION` → Explicit unverified hypothesis

### KQR (Knowledge Qualification & Reliability)
Source reliability scoring: `very_high | high | medium | low`

Confidence = weighted(source_reliability × factual_basis × inference_quality × (1 - assumption_risk))

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (PostgreSQL 15)
- **LLM:** Claude API (`claude-sonnet-4-5-20250929`)
- **Testing:** Vitest

## Project Structure

```
src/
├── types/           # TypeScript types with Zod validation
├── db/              # Supabase client + queries
├── lib/             # IFX/KQR helpers, logger
├── providers/       # L1: GitHub provider + normalizer
├── feeds/           # L2: Feed sources + normalizer + dedup
│   └── sources/     # HN, GitHub Trending, npm, PH, YC Launches
├── matching/        # L3: Pre-filter, maturity, analyzer, stability, ranker
├── delivery/        # L4: Briefs, email, Slack, export
├── feedback/        # L5: Feedback collection, cost tracking, analytics
└── agent/           # L6: Safety, preflight, backup, planner, executor, reporter
```

## Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/ambradan/techscout.git
   cd techscout
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

   Required variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ANTHROPIC_API_KEY=your-anthropic-key
   GITHUB_TOKEN=your-github-token
   ```

3. **Run database migrations:**
   Apply `supabase/migrations/001_initial_schema.sql` in Supabase SQL Editor.

4. **Seed example data (optional):**
   ```bash
   npm run seed
   ```

5. **Run tests:**
   ```bash
   npm test
   ```

## Usage

### Run the pipeline
```bash
npm run pipeline
```

### Seed a project
```bash
npm run seed
```

### Type check
```bash
npm run typecheck
```

## Data Flow Rules

```
❌ NEVER: source code → LLM
❌ NEVER: source code → database
❌ NEVER: source code → network

✅ OK: dependency lists, language stats, manifests, feed items → LLM
```

## Agent Safety (L6)

Non-negotiable constraints:
1. Isolated branch only (never main/master/production)
2. Backup commit before any modification
3. Scope limited to recommendation files
4. **Human approval required before merge**
5. If complexity > 2x estimate → STOP and ask
6. Source code never exposed outside local runtime

## License

MIT

## Author

Built with Claude Code.
