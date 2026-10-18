/**
 * Usage: node --experimental-strip-types src/cli.ts <pdf-folder> [--out <folder>] [--model <id>]
 *
 * Writes one <name>.json per PDF and summary.md into the output folder (default:
 * <pdf-folder>/extracted). Requires SDS_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { extractFile } from './extract.ts';
import { createProvider } from './provider.ts';
import { type SummaryRow, summaryMarkdown, summaryRow } from './summary.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' }, model: { type: 'string' } },
});
const input = positionals[0];
if (!input) {
  console.error('Usage: cli.ts <pdf-folder> [--out <folder>] [--model <id>]');
  process.exit(1);
}
const out = values.out ?? join(input, 'extracted');
mkdirSync(out, { recursive: true });

const provider = await createProvider('anthropic', values.model);
const pdfs = readdirSync(input)
  .filter((f) => extname(f).toLowerCase() === '.pdf')
  .sort();
const rows: SummaryRow[] = [];

for (const file of pdfs) {
  const started = Date.now();
  process.stdout.write(`${file} … `);
  try {
    const result = await extractFile(join(input, file), provider);
    writeFileSync(
      join(out, `${basename(file, extname(file))}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    rows.push(summaryRow(result));
    console.log(
      `${result.extraction.components.length} bileşen, ${result.extraction.flags.length} bayrak`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rows.push({
      file,
      components: 0,
      flags: 0,
      durationMs: Date.now() - started,
      error: message.slice(0, 200),
    });
    console.log(`HATA: ${message}`);
  }
}

const summary = summaryMarkdown(rows);
writeFileSync(join(out, 'summary.md'), summary);
console.log(`\n${summary}`);
