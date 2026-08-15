import { describe, expect, it } from 'vitest';
import { parseReadme } from '../src/core/markdown/parser.js';

describe('Markdown AST parser', () => {
  it('builds headings, sections, code blocks, links, images, and HTML image facts', () => {
    const document = parseReadme(
      '# Name\n\n## Use\n\n```bash\nnpx tool\n```\n\n[Docs](docs/a.md)\n<img src="demo.gif">',
    );
    expect(document.headings).toHaveLength(2);
    expect(document.sections[1]?.heading.text).toBe('Use');
    expect(document.codeBlocks[0]?.language).toBe('bash');
    expect(document.links.some((link) => link.url === 'docs/a.md')).toBe(true);
    expect(document.images.some((image) => image.url === 'demo.gif' && image.html)).toBe(
      true,
    );
  });
});
