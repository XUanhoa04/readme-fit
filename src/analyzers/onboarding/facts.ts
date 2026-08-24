import type { CodeBlock, ReadmeDocument } from '../../models/index.js';
import { parseReadmeCommands } from '../../core/claims/commands.js';

export type CommandKind = 'install' | 'usage';

export interface RunnableCommand {
  command: string;
  kind: CommandKind;
  line: number;
  block: CodeBlock;
}

export function runnableCommands(readme: ReadmeDocument): RunnableCommand[] {
  return parseReadmeCommands(readme)
    .filter(
      (command): command is typeof command & { kind: CommandKind } =>
        command.kind === 'install' || command.kind === 'usage',
    )
    .map((command) => ({
      command: command.command,
      kind: command.kind,
      line: command.line,
      block: command.block,
    }));
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
    const relatedCommands = commands.filter(
      (command) =>
        command.block === block ||
        (block.line > command.line && block.line - command.line < 25),
    );
    if (!relatedCommands.length) return false;
    const commandText = new Set(relatedCommands.map((command) => command.command.trim()));
    const nonCommandLines = block.value
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^\$\s+/, ''))
      .filter((line) => line && !commandText.has(line));
    const explicitOutputLanguage = ['text', 'txt', 'output'].includes(language);
    const consoleOutput =
      ['console', 'terminal'].includes(language) && nonCommandLines.length > 0;
    const looksLikeOutput =
      /(?:✓|✔|score|found|success|error|warning|readme fit|\d+\/100)/i.test(
        nonCommandLines.join('\n'),
      );
    const labeledJsonResult =
      language === 'json' &&
      /(?:output|result|response)/i.test(block.section ?? '') &&
      nonCommandLines.length > 0;
    return explicitOutputLanguage || consoleOutput || looksLikeOutput || labeledJsonResult;
  });
}
