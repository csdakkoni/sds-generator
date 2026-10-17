# sds-generator

Safety data sheet (GBF/SDS) and GHS label generator for small chemical producers, compliant with KKDİK Annex 2 and SEA. Every SDS is approved by a Chemical Assessment Specialist (KDU).

Read [CLAUDE.md](CLAUDE.md) first: it holds the product rules, including the non-negotiable classification rules. The roadmap is in [docs/roadmap.md](docs/roadmap.md).

## Layout

| Path | Purpose |
|---|---|
| `apps/web` | Vite + React + TypeScript + Tailwind app (Turkish UI) |
| `packages/classification-engine` | Pure TypeScript classification engine, independent of UI and database |
| `supabase/migrations`, `supabase/functions` | Database schema with RLS, Edge Functions |
| `scripts/extract-supplier-sds` | CLI that extracts structured data from supplier SDS PDFs |
| `scripts/import-sea-annex6` | Importer for SEA Annex 6 harmonised classifications |
| `tests/reference-cases` | KDU-verified recipe → expected classification cases |
| `docs` | Roadmap, setup prompts, `TODO(KDU)` list |

## Commands

Requires Node 22+.

```sh
npm install
npm run dev        # web app at http://localhost:5173
npm test           # all Vitest projects
npm run lint
npm run typecheck
npm run build
```

Supplier SDS PDFs go in `samples/` locally; that folder is git-ignored and must never be committed.
