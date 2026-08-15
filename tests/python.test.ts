import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';
import {
  pyprojectValue,
  pythonPackageName,
  pythonRuntimeConstraint,
} from '../src/core/repository/python-metadata.js';

const fixture = (name: string) => path.resolve('fixtures', name);

describe('Python repository evidence', () => {
  it('extracts only values from the intended TOML sections', () => {
    const source = [
      '[tool.unrelated]',
      'name = "wrong"',
      '[project]',
      'name = "right-name"',
      'requires-python = ">=3.11"',
    ].join('\n');
    expect(pythonPackageName(source)).toBe('right-name');
    expect(pythonRuntimeConstraint(source)).toBe('>=3.11');
    expect(pyprojectValue(source, 'tool.missing', 'name')).toBeUndefined();
  });

  it('detects stale pip package and Python runtime claims', async () => {
    const report = await analyzeRepository(fixture('python-library'));
    expect(report.project.primaryType).toBe('library');
    expect(report.project.packageName).toBe('evidence-lib');
    expect(report.project.languages).toContain('Python');
    expect(report.project.packageManagers).toContain('pip');
    expect(report.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        'correctness.package-name.matches',
        'correctness.runtime.matches',
      ]),
    );
  });

  it('accepts aligned Python package and runtime evidence', async () => {
    const report = await analyzeRepository(fixture('python-library-good'));
    expect(
      report.findings.some((finding) =>
        ['correctness.package-name.matches', 'correctness.runtime.matches'].includes(
          finding.id,
        ),
      ),
    ).toBe(false);
  });
});
