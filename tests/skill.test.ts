import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('agent skill safeguards', () => {
  it('prioritizes correctness and rejects decoration-only advice', async () => {
    const skill = await readFile('skills/readme-fit/SKILL.md', 'utf8');
    const principles = await readFile('skills/readme-fit/references/principles.md', 'utf8');
    const types = await readFile('skills/readme-fit/references/project-types.md', 'utf8');
    expect(principles).toMatch(/Correctness outranks presentation/);
    expect(skill).toMatch(/Do not recommend a logo, badges, screenshot, video/);
    expect(types).toMatch(/video.*optional.*must not reduce/i);
  });

  it('includes the profile human-ability disclaimer', async () => {
    const profile = await readFile(
      'skills/readme-fit/references/profile-readme.md',
      'utf8',
    );
    expect(profile).toMatch(/does not measure the person’s actual skills/i);
  });
});
