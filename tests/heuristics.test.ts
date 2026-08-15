import { describe, expect, it } from 'vitest';
import { outcomeSignals } from '../src/analyzers/impression/rules.js';
import {
  firstSuccessCommand,
  runnableCommands,
} from '../src/analyzers/onboarding/facts.js';
import { parseReadme } from '../src/core/markdown/parser.js';

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
