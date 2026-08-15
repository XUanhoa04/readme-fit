import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { RootContent } from 'mdast';
import type {
  CodeBlock,
  Heading,
  ReadmeDocument,
  ReadmeLink,
  ReadmeSection,
} from '../../models/index.js';

function textOf(node: RootContent): string {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map((child) => textOf(child as RootContent)).join('');
  }
  return '';
}

function lineOf(node: RootContent): number {
  return node.position?.start.line ?? 1;
}

function currentSection(headings: Heading[], line: number): string | undefined {
  return [...headings].reverse().find((heading) => heading.line <= line)?.text;
}

export function parseReadme(raw: string, path = 'README.md'): ReadmeDocument {
  const tree = unified().use(remarkParse).parse(raw);
  const headings: Heading[] = [];
  const codeBlocks: CodeBlock[] = [];
  const links: ReadmeLink[] = [];
  const images: ReadmeLink[] = [];
  const htmlBlocks: Array<{ value: string; line: number }> = [];
  let lists = 0;
  let tables = 0;
  let blockquotes = 0;
  let details = 0;

  visit(tree, (node) => {
    const item = node;
    if (item.type === 'heading') {
      headings.push({ depth: item.depth, text: textOf(item), line: lineOf(item) });
    } else if (item.type === 'code') {
      const block: CodeBlock = { value: item.value, line: lineOf(item) };
      if (item.lang) block.language = item.lang;
      const section = currentSection(headings, lineOf(item));
      if (section) block.section = section;
      codeBlocks.push(block);
    } else if (item.type === 'link') {
      links.push({ url: item.url, text: textOf(item), line: lineOf(item), image: false, html: false });
    } else if (item.type === 'image') {
      const image = { url: item.url, text: item.alt ?? '', line: lineOf(item), image: true, html: false };
      images.push(image);
      links.push(image);
    } else if (item.type === 'html') {
      htmlBlocks.push({ value: item.value, line: lineOf(item) });
      details += /<details\b/i.test(item.value) ? 1 : 0;
      for (const match of item.value.matchAll(/<img\b[^>]*?src=["']([^"']+)["'][^>]*>/gi)) {
        const image = { url: match[1] ?? '', text: '', line: lineOf(item), image: true, html: true };
        images.push(image);
        links.push(image);
      }
    } else if (item.type === 'list') lists += 1;
    else if (item.type === 'blockquote') blockquotes += 1;
    else if (item.type === 'table') tables += 1;
  });

  const lines = raw.split(/\r?\n/);
  const sections: ReadmeSection[] = headings.map((heading, index) => {
    const next = headings[index + 1];
    const endLine = next ? next.line - 1 : lines.length;
    return {
      heading,
      endLine,
      wordCount: lines.slice(heading.line, endLine).join(' ').trim().split(/\s+/).filter(Boolean).length,
    };
  });

  return {
    path,
    raw,
    lineCount: lines.length,
    wordCount: raw.replace(/```[\s\S]*?```/g, ' ').trim().split(/\s+/).filter(Boolean).length,
    headings,
    sections,
    codeBlocks,
    links,
    images,
    htmlBlocks,
    lists,
    tables,
    blockquotes,
    details,
  };
}
