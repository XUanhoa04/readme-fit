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

  it('extracts HTML anchor links and preserves HTML image alt text', () => {
    const raw = `
# Project

<a href="https://example.com/docs">Read the documentation</a>
<a href="./CONTRIBUTING.md">Contributing Guide</a>
<img src="./assets/banner.png" alt="Project Banner" width="600" />
`;
    const doc = parseReadme(raw);
    const htmlLinks = doc.links.filter((link) => link.html && !link.image);
    expect(htmlLinks).toHaveLength(2);
    expect(htmlLinks[0]?.url).toBe('https://example.com/docs');
    expect(htmlLinks[1]?.url).toBe('./CONTRIBUTING.md');

    const htmlImages = doc.images.filter((img) => img.html);
    expect(htmlImages).toHaveLength(1);
    expect(htmlImages[0]?.url).toBe('./assets/banner.png');
    expect(htmlImages[0]?.text).toBe('Project Banner');
  });
});
