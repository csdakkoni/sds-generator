import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { ExtractionFile } from './schema.ts';

const target = new URL('../schema.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(z.toJSONSchema(ExtractionFile), null, 2)}\n`);
console.log(`wrote ${target.pathname}`);
