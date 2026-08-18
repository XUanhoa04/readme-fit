import type { CodeBlock, ReadmeDocument } from '../../models/index.js';

export type CommandKind = 'install' | 'usage';

export interface RunnableCommand {
  command: string;
  kind: CommandKind;
  line: number;
  block: CodeBlock;
}

const INSTALL =
  /^(?:\$\s*)?(?:npm\s+(?:i|install|add)|pnpm\s+(?:add|i|install)|yarn\s+(?:add|install)|bun\s+(?:add|i|install)|pip3?\s+install|python(?:3)?\s+-m\s+pip\s+install|uv\s+(?:add|pip\s+install)|poetry\s+add|cargo\s+install|go\s+install)\b/i;
const USAGE =
  /^(?:\$\s*)?(?:npx\b|bunx\b|npm\s+(?:run|test|start)\b|pnpm\s+(?!add\b|install\b)|yarn\s+(?!add\b|install\b)|bun\s+(?!add\b|install\b)|uv\s+(?:run|tool\s+run)\b|poetry\s+run\b|cargo\s+run\b|go\s+run\b|docker(?:-compose|\s+compose)?\b|[\w.-]+\s+(?:scan|run|start|init|check)\b)/i;

export function runnableCommands(readme: ReadmeDocument): RunnableCommand[] {
  const commands: RunnableCommand[] = [];
  for (const block of readme.codeBlocks) {
    block.value.split(/\r?\n/).forEach((line, index) => {
      const clean = line.trim();
      const kind = INSTALL.test(clean)
        ? 'install'
        : USAGE.test(clean)
          ? 'usage'
          : undefined;
      if (kind) {
        commands.push({
          command: clean.replace(/^\$\s*/, ''),
          kind,
          line: block.line + index + 1,
          block,
        });
      }
    });
  }
  return commands;
}

export function firstSuccessCommand(readme: ReadmeDocument): RunnableCommand | undefined {
  return runnableCommands(readme).find((command) => command.kind === 'usage');
}

export function wordsBefore(readme: ReadmeDocument, line: number): number {
  return readme.raw
    .split(/\r?\n/)
    .slice(0, Math.max(0, line - 1))
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function hasExpectedOutput(readme: ReadmeDocument): boolean {
  const commands = runnableCommands(readme).filter((command) => command.kind === 'usage');
  if (!commands.length) return false;
  return readme.codeBlocks.some((block) => {
    const language = block.language?.toLowerCase() ?? '';
    const followsCommand = commands.some(
      (command) => block.line > command.line && block.line - command.line < 25,
    );
    const outputLanguage = ['text', 'txt', 'console', 'output', 'json'].includes(language);
    const looksLikeOutput =
      /(?:✓|✔|score|found|success|error|warning|readme fit|\d+\/100)/i.test(block.value) &&
      !INSTALL.test(block.value.trim()) &&
      !USAGE.test(block.value.trim());
    return followsCommand && (outputLanguage || looksLikeOutput);
  });
}
