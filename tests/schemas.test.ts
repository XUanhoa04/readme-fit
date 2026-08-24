import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';
import { createBaseline } from '../src/core/baseline.js';

async function schema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.resolve('schemas', name), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('published JSON Schemas', () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    formats: { 'date-time': true },
  });

  it('validates generated reports and baselines', async () => {
    const report = await analyzeRepository(path.resolve('fixtures', 'stale-cli'));
    const validateReport = ajv.compile(await schema('report.schema.json'));
    const validateBaseline = ajv.compile(await schema('baseline.schema.json'));
    expect(validateReport(report), JSON.stringify(validateReport.errors)).toBe(true);
    expect(
      validateBaseline(createBaseline(report)),
      JSON.stringify(validateBaseline.errors),
    ).toBe(true);
  });

  it('accepts config v2 and rejects unknown configuration keys', async () => {
    const validate = ajv.compile(await schema('config.schema.json'));
    expect(validate({ version: 2, scoring: { preset: 'oss' } })).toBe(true);
    expect(validate({ version: 2, scorign: { preset: 'oss' } })).toBe(false);
  });
});
