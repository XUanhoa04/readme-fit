#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const target = path.resolve(process.argv[2] ?? '.');
const skillDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const localCli = path.resolve(skillDirectory, '..', '..', 'dist', 'cli.js');
const command = existsSync(localCli) ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = existsSync(localCli)
  ? [localCli, 'scan', target, '--format', 'json']
  : ['--yes', 'readme-fit', 'scan', target, '--format', 'json'];

const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
if (result.error) {
  process.stderr.write(`readme-fit inspection failed: ${result.error.message}\n`);
  process.exitCode = 2;
} else {
  process.exitCode = result.status ?? 2;
}
