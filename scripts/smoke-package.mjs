import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required; run this smoke test through npm.');

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr}`)),
    );
  });
}

const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), 'readme-fit-package-'));
try {
  const packOutput = await run(
    process.execPath,
    [npmCli, 'pack', '--json', '--pack-destination', temporary],
    root,
  );
  const packed = JSON.parse(packOutput);
  const tarball = path.join(temporary, packed[0].filename);
  const consumer = path.join(temporary, 'consumer');
  const project = path.join(consumer, 'project');
  await mkdir(project, { recursive: true });
  await writeFile(
    path.join(consumer, 'package.json'),
    '{"private":true,"type":"module"}\n',
  );
  await writeFile(
    path.join(project, 'README.md'),
    '# Smoke project\n\nA useful project for developers.\n',
  );
  await run(process.execPath, [npmCli, 'install', '--ignore-scripts', tarball], consumer);
  const cli = path.join(consumer, 'node_modules', 'readme-fit', 'dist', 'cli.js');
  const version = await run(process.execPath, [cli, '--version'], consumer);
  if (!/^\d+\.\d+\.\d+/m.test(version))
    throw new Error(`Unexpected CLI version: ${version}`);
  const json = await run(process.execPath, [cli, 'scan', project, '--json'], consumer);
  if (JSON.parse(json).schemaVersion !== 2)
    throw new Error('Installed CLI report schema mismatch.');
  await run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "await import('readme-fit'); await import('readme-fit/rules'); await import('readme-fit/reporters'); await import('readme-fit/config');",
    ],
    consumer,
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(consumer, 'node_modules', 'readme-fit', 'package.json'),
      'utf8',
    ),
  );
  process.stdout.write(`package smoke OK: readme-fit@${manifest.version}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
