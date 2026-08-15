import type { CodeBlock, ReadmeDocument } from '../../models/index.js';

export interface RunnableCommand {
  command: string;
  line: number;
  block: CodeBlock;
}

const RUNNABLE = /^(?:\$\s*)?(?:npx|npm\s+(?:i|install|run|test|start)|pnpm|yarn|pip3?\s+install|uv\s+(?:add|run|tool)|cargo\s+(?:install|run)|go\s+(?:run|install)|docker(?:-compose|\s+compose)?|[\w.-]+\s+(?:scan|run|start|init|check))\b/i;

export function runnableCommands(readme: ReadmeDocument): RunnableCommand[] {
  const commands: RunnableCommand[] = [];
  for (const block of readme.codeBlocks) {
    block.value.split(/\r?\n/).forEach((line, index) => {
      const clean = line.trim();
      if (RUNNABLE.test(clean)) commands.push({ command: clean.replace(/^\$\s*/, ''), line: block.line + index + 1, block });
    });
  }
  return commands;
}

export function wordsBefore(readme: ReadmeDocument, line: number): number {
  return readme.raw.split(/\r?\n/).slice(0, Math.max(0, line - 1)).join(' ').trim().split(/\s+/).filter(Boolean).length;
}

export function hasExpectedOutput(readme: ReadmeDocument): boolean {
  const commands = runnableCommands(readme);
  if (!commands.length) return false;
  return readme.codeBlocks.some((block) => {
    const language = block.language?.toLowerCase() ?? '';
    const followsCommand = commands.some((command) => block.line > command.line && block.line - command.line < 25);
    const outputLanguage = ['text', 'txt', 'console', 'output', 'json'].includes(language);
    const looksLikeOutput = /(?:✓|✔|score|found|success|error|warning|readme fit|\d+\/100)/i.test(block.value) && !RUNNABLE.test(block.value.trim());
    return followsCommand && (outputLanguage || looksLikeOutput);
  });
}
