import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '../src/core/analysis.js';
import {
  pyprojectValue,
  pythonPackageName,
  pythonRuntimeConstraint,
} from '../src/core/repository/python-metadata.js';
import { parseReadme } from '../src/core/markdown/parser.js';
import { runtimeRule } from '../src/analyzers/runtime/rule.js';
import { DEFAULT_CONFIG } from '../src/core/config/config.js';

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

  it('recognizes markdown-formatted Node.js and Python runtime requirements', async () => {
    const raw = '# Project\n\n- **Node.js**: >=20\n- **Python**: >=3.11\n';
    const readme = parseReadme(raw, 'README.md');
    const context = {
      repository: {
        root: '/mock',
        files: ['README.md', 'package.json', 'pyproject.toml'],
        licenseText: undefined,
        packageJson: { engines: { node: '>=20.0.0' } },
        pyproject: '[project]\nrequires-python = ">=3.11"\n',
        inspection: { fileLimit: 10_000, truncated: false },
        workspace: { isMonorepo: false, patterns: [], packages: [], lockfileConflicts: [] },
      },
      readme,
      project: {
        primaryType: 'library',
        secondaryTypes: [],
        languages: ['TypeScript', 'Python'],
        packageManagers: ['npm', 'pip'],
        hasCli: false,
        hasWebUi: false,
        hasTests: false,
        hasLicense: false,
        entrypoints: [],
        confidence: 1,
      },
      config: DEFAULT_CONFIG,
      options: { checkLinks: false },
      evidenceGraph: { claims: [], evidence: [], verifications: [] },
    } as Parameters<typeof runtimeRule.evaluate>[0];

    const result = await runtimeRule.evaluate(context);
    expect(result.score.status).toBe('pass');
    expect(result.findings).toHaveLength(0);
  });
});
