import { describe, expect, it } from 'vitest';
import { outcomeSignals } from '../src/analyzers/impression/rules.js';
import {
  firstSuccessCommand,
  hasExpectedOutput,
  runnableCommands,
} from '../src/analyzers/onboarding/facts.js';
import { parseReadme } from '../src/core/markdown/parser.js';
import { parseReadmeCommands } from '../src/core/claims/commands.js';
import { quickStartRule } from '../src/analyzers/onboarding/rules.js';
import { DEFAULT_CONFIG } from '../src/core/config/config.js';
import type { AnalysisContext } from '../src/rules/types.js';

describe('onboarding command classification', () => {
  it('distinguishes installation from first success', () => {
    const readme = parseReadme('# Tool\n\n```bash\nnpm install tool\nnpx tool scan .\n```');
    expect(runnableCommands(readme).map((command) => command.kind)).toEqual([
      'install',
      'usage',
    ]);
    expect(firstSuccessCommand(readme)?.command).toBe('npx tool scan .');
  });

  it('does not treat installation alone as first success', () => {
    const readme = parseReadme('# Tool\n\n```bash\npip install tool\n```');
    expect(firstSuccessCommand(readme)).toBeUndefined();
  });

  it('classifies bun, poetry, and uv commands properly', () => {
    const readme = parseReadme(`
# Modern Tool

\`\`\`bash
bun add -d my-tool
poetry add "requests[security]"
uv pip install --upgrade pkg
bunx my-tool scan
\`\`\`
`);
    const commands = runnableCommands(readme);
    expect(commands.map((c) => ({ command: c.command, kind: c.kind }))).toEqual([
      { command: 'bun add -d my-tool', kind: 'install' },
      { command: 'poetry add "requests[security]"', kind: 'install' },
      { command: 'uv pip install --upgrade pkg', kind: 'install' },
      { command: 'bunx my-tool scan', kind: 'usage' },
    ]);
    expect(firstSuccessCommand(readme)?.command).toBe('bunx my-tool scan');
  });

  it('parses quoted package targets, command prefixes, and workspace scripts', () => {
    const fence = '```';
    const readme = parseReadme(
      `# Commands\n\n${fence}bash\nenv CI=1 corepack pnpm --workspace docs run build && npx "@scope/tool@^1" scan\n${fence}`,
    );
    const commands = parseReadmeCommands(readme);
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ manager: 'pnpm', script: 'build' }),
        expect.objectContaining({ manager: 'npm', packageTarget: '@scope/tool' }),
      ]),
    );
  });

  it('does not count an unlabeled JSON input block as expected output', () => {
    const fence = '```';
    const readme = parseReadme(
      `# Tool\n\n${fence}bash\nnpx tool scan\n${fence}\n\n${fence}json\n{"input": true}\n${fence}`,
    );
    expect(hasExpectedOutput(readme)).toBe(false);
  });

  it('requires first-success guidance inside the detected onboarding section', async () => {
    const fence = '```';
    const readme = parseReadme(
      `# Tool\n\nUseful tool.\n\n## Installation\n\nRead the guide.\n\n## Architecture\n\n${fence}bash\nnpx tool scan\n${fence}`,
    );
    const context = {
      repository: {
        root: '/mock',
        files: ['README.md'],
        inspection: { fileLimit: 10_000, truncated: false },
      },
      readme,
      project: {
        primaryType: 'cli',
        secondaryTypes: [],
        languages: [],
        packageManagers: [],
        hasCli: true,
        hasWebUi: false,
        hasTests: false,
        hasLicense: false,
        entrypoints: [],
        confidence: 1,
      },
      config: DEFAULT_CONFIG,
      options: { checkLinks: false },
      evidenceGraph: { claims: [], evidence: [], verifications: [] },
    } satisfies AnalysisContext;
    const result = await quickStartRule.evaluate(context);
    expect(result.score.status).toBe('fail');
  });
});

describe('WHY heuristic', () => {
  it('does not accept the bare word find as a value proposition', () => {
    expect(outcomeSignals('Find the API reference in the documentation.')).toEqual([]);
  });

  it('recognizes a concrete pain point or outcome', () => {
    expect(
      outcomeSignals('Detect documentation drift before stale commands break onboarding.'),
    ).not.toEqual([]);
    expect(outcomeSignals('Helps maintainers prevent broken releases.')).not.toEqual([]);
  });
});
