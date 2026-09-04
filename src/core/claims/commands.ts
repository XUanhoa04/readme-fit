import type { CodeBlock, ReadmeDocument } from '../../models/index.js';

export type CommandKind = 'install' | 'usage' | 'other';
export type CommandManager =
  'npm' | 'pnpm' | 'yarn' | 'bun' | 'pip' | 'uv' | 'poetry' | 'cargo' | 'go' | 'docker';

export interface ParsedReadmeCommand {
  command: string;
  executable: string;
  args: string[];
  kind: CommandKind;
  line: number;
  block: CodeBlock;
  manager?: CommandManager;
  script?: string;
  packageTarget?: string;
}

const SHELL_LANGUAGES = new Set([
  '',
  'bash',
  'sh',
  'shell',
  'console',
  'terminal',
  'zsh',
  'fish',
  'powershell',
  'ps1',
  'cmd',
  'bat',
]);
const OPTIONS_WITH_VALUES = new Set([
  '-C',
  '--cwd',
  '-w',
  '--workspace',
  '--filter',
  '--prefix',
  '--config',
  '--package',
  '-p',
]);

const PACKAGE_MANAGER_BUILTINS = new Set([
  'install',
  'i',
  'add',
  'remove',
  'rm',
  'uninstall',
  'update',
  'upgrade',
  'up',
  'link',
  'unlink',
  'import',
  'rebuild',
  'rb',
  'prune',
  'env',
  'init',
  'create',
  'publish',
  'pack',
  'audit',
  'outdated',
  'why',
  'info',
  'help',
  'root',
  'bin',
  'config',
  'setup',
  'exec',
  'dlx',
  'node',
  'pm',
]);

function splitSegments(line: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? '';
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    const pair = line.slice(index, index + 2);
    if (character === ';' || pair === '&&' || pair === '||') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      if (pair.length === 2 && pair !== ';') index += 1;
      continue;
    }
    current += character;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const character of command) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current) tokens.push(current);
  return tokens;
}

function stripCommandPrefix(tokens: string[]): string[] {
  const output = [...tokens];
  while (output[0] && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(output[0])) output.shift();
  if (output[0] === 'env') {
    output.shift();
    while (output[0] && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(output[0])) output.shift();
  }
  if (output[0] === 'sudo' || output[0] === 'command') output.shift();
  if (output[0] === 'corepack') output.shift();
  return output;
}

function positional(args: string[], start = 0): string | undefined {
  for (let index = start; index < args.length; index += 1) {
    const token = args[index];
    if (!token) continue;
    if (token === '--') return args[index + 1];
    if (OPTIONS_WITH_VALUES.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith('-')) continue;
    return token;
  }
  return undefined;
}

function packageOption(args: string[]): string | undefined {
  const inline = args.find((argument) => argument.startsWith('--package='));
  if (inline) return inline.slice('--package='.length);
  const index = args.findIndex((argument) => argument === '--package' || argument === '-p');
  return index >= 0 ? args[index + 1] : undefined;
}

export function normalizePackageSpecifier(
  value: string | undefined,
  ecosystem: 'npm' | 'python',
): string | undefined {
  if (!value || /^(?:\.|\/|file:|https?:|git(?:\+|:)|github:)/i.test(value)) {
    return undefined;
  }
  if (ecosystem === 'python') {
    const normalized = value
      .replace(/\[.*$/, '')
      .split(/[<>=!~;]/, 1)[0]
      ?.trim();
    return normalized && /^[A-Za-z0-9_.-]+$/.test(normalized) ? normalized : undefined;
  }
  if (value.startsWith('@')) {
    const slash = value.indexOf('/');
    if (slash < 2) return undefined;
    const versionAt = value.indexOf('@', slash);
    const normalized = versionAt >= 0 ? value.slice(0, versionAt) : value;
    return /^@[\w.-]+\/[\w.-]+$/.test(normalized) ? normalized : undefined;
  }
  const normalized = value.split('@', 1)[0];
  return normalized && /^[\w.-]+$/.test(normalized) ? normalized : undefined;
}

function parseSegment(
  command: string,
  line: number,
  block: CodeBlock,
): ParsedReadmeCommand | undefined {
  const tokens = stripCommandPrefix(tokenize(command));
  const executable = tokens[0]?.toLowerCase();
  if (!executable) return undefined;
  const args = tokens.slice(1);
  const base: ParsedReadmeCommand = {
    command,
    executable,
    args,
    kind: 'other',
    line,
    block,
  };

  if (executable === 'npx' || executable === 'bunx') {
    const target = packageOption(args) ?? positional(args);
    const packageTarget = normalizePackageSpecifier(target, 'npm');
    return {
      ...base,
      kind: 'usage',
      manager: executable === 'npx' ? 'npm' : 'bun',
      ...(packageTarget ? { packageTarget } : {}),
    };
  }

  if (['npm', 'pnpm', 'yarn', 'bun'].includes(executable)) {
    const manager = executable as 'npm' | 'pnpm' | 'yarn' | 'bun';
    const actionIndex = args.findIndex((argument) =>
      ['install', 'i', 'add', 'run', 'run-script', 'exec', 'dlx', 'test', 'start'].includes(
        argument,
      ),
    );
    const action = actionIndex >= 0 ? args[actionIndex] : undefined;
    if (action && ['install', 'i', 'add'].includes(action)) {
      const target = positional(args, actionIndex + 1);
      const packageTarget = normalizePackageSpecifier(target, 'npm');
      return {
        ...base,
        kind: 'install',
        manager,
        ...(packageTarget ? { packageTarget } : {}),
      };
    }
    if (action && ['run', 'run-script'].includes(action)) {
      const script = positional(args, actionIndex + 1);
      return {
        ...base,
        kind: 'usage',
        manager,
        ...(script ? { script } : {}),
      };
    }
    if (action === 'test' || action === 'start') {
      return { ...base, kind: 'usage', manager, script: action };
    }
    if (action === 'exec' || action === 'dlx') {
      const target = packageOption(args) ?? positional(args, actionIndex + 1);
      const packageTarget = normalizePackageSpecifier(target, 'npm');
      return {
        ...base,
        kind: 'usage',
        manager,
        ...(packageTarget ? { packageTarget } : {}),
      };
    }
    if (['pnpm', 'yarn', 'bun'].includes(manager)) {
      const target = positional(args);
      if (target) {
        const isScript = !PACKAGE_MANAGER_BUILTINS.has(target);
        return {
          ...base,
          kind: 'usage',
          manager,
          ...(isScript ? { script: target } : {}),
        };
      }
    }
  }

  const pythonInstall =
    (['pip', 'pip3'].includes(executable) && args[0] === 'install') ||
    (/^python3?$/.test(executable) && args[0] === '-m' && args[1] === 'pip');
  if (pythonInstall) {
    const installIndex = args.indexOf('install');
    const target = positional(args, installIndex + 1);
    const packageTarget = normalizePackageSpecifier(target, 'python');
    return {
      ...base,
      kind: 'install',
      manager: 'pip',
      ...(packageTarget ? { packageTarget } : {}),
    };
  }
  if (executable === 'uv') {
    const installIndex = args.findIndex((argument) =>
      ['add', 'install'].includes(argument),
    );
    if (installIndex >= 0) {
      const packageTarget = normalizePackageSpecifier(
        positional(args, installIndex + 1),
        'python',
      );
      return {
        ...base,
        kind: 'install',
        manager: 'uv',
        ...(packageTarget ? { packageTarget } : {}),
      };
    }
    if (args[0] === 'run' || (args[0] === 'tool' && args[1] === 'run')) {
      return { ...base, kind: 'usage', manager: 'uv' };
    }
  }
  if (executable === 'poetry') {
    if (args[0] === 'add') {
      const packageTarget = normalizePackageSpecifier(positional(args, 1), 'python');
      return {
        ...base,
        kind: 'install',
        manager: 'poetry',
        ...(packageTarget ? { packageTarget } : {}),
      };
    }
    if (args[0] === 'run') return { ...base, kind: 'usage', manager: 'poetry' };
  }
  if (executable === 'cargo' && ['install', 'run'].includes(args[0] ?? '')) {
    const packageTarget =
      args[0] === 'install'
        ? normalizePackageSpecifier(positional(args, 1), 'npm')
        : undefined;
    return {
      ...base,
      kind: args[0] === 'install' ? 'install' : 'usage',
      manager: 'cargo',
      ...(packageTarget ? { packageTarget } : {}),
    };
  }
  if (executable === 'go' && ['install', 'run'].includes(args[0] ?? '')) {
    return { ...base, kind: args[0] === 'install' ? 'install' : 'usage', manager: 'go' };
  }
  if (executable === 'docker' || executable === 'docker-compose') {
    return { ...base, kind: 'usage', manager: 'docker' };
  }
  if (
    args.some((argument) => ['scan', 'run', 'start', 'init', 'check'].includes(argument))
  ) {
    return { ...base, kind: 'usage' };
  }
  return undefined;
}

export function parseReadmeCommands(readme: ReadmeDocument): ParsedReadmeCommand[] {
  const commands: ParsedReadmeCommand[] = [];
  for (const block of readme.codeBlocks) {
    const language = block.language?.toLowerCase() ?? '';
    if (!SHELL_LANGUAGES.has(language)) continue;
    block.value.split(/\r?\n/).forEach((sourceLine, index) => {
      const line = sourceLine
        .trim()
        .replace(/^\$\s+/, '')
        .replace(/^PS>\s+/i, '')
        .replace(/^>\s+/, '');
      if (!line || line.startsWith('#')) return;
      for (const segment of splitSegments(line)) {
        const parsed = parseSegment(segment, block.line + index + 1, block);
        if (parsed) commands.push(parsed);
      }
    });
  }
  return commands;
}
