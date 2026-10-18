# extract-supplier-sds

Reads supplier SDS PDFs with an AI model and writes one JSON file per PDF plus `summary.md`.

```sh
ANTHROPIC_API_KEY=… npm run extract -w @sds/extract-supplier-sds -- ../../samples/supplier-sds
```

- Output format: `src/schema.ts` (Zod), exported as `schema.json` (`npm run schema`).
- The model sits behind `ExtractionProvider` (`src/provider.ts`); the current adapter is Anthropic (Claude). The key is read from `ANTHROPIC_API_KEY`, the model from `--model` or `ANTHROPIC_MODEL` (default `claude-opus-5-5`).
- Every quote is checked against the PDF text layer (poppler `pdftotext`); mismatches and consistency problems are added as `[kontrol]` flags.
- Put PDFs under `samples/` (git-ignored). Never commit supplier documents or their extractions.
