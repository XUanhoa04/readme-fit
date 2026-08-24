import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required; run this check through npm.');

function fail(message) {
  throw new Error(`Release check failed: ${message}`);
}

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`npm ${args.join(' ')} failed (${code}): ${stderr}`));
    });
  });
}

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const lockfile = JSON.parse(await readFile('package-lock.json', 'utf8'));
const changelog = await readFile('CHANGELOG.md', 'utf8');
const action = await readFile('action.yml', 'utf8');

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
  fail(`package version is not releaseable semver: ${manifest.version}`);
}
if (
  lockfile.version !== manifest.version ||
  lockfile.packages?.['']?.version !== manifest.version
) {
  fail('package.json and package-lock.json versions differ');
}
if (!changelog.includes(`## [${manifest.version}]`)) {
  fail(`CHANGELOG.md has no ${manifest.version} release section`);
}
if (!action.includes(`readme-fit@${manifest.version.split('.')[0]}`)) {
  fail('action.yml does not use the package major matching this release');
}
if (manifest.repository?.url !== 'git+https://github.com/XUanhoa04/readme-fit.git') {
  fail('repository.url must exactly identify the provenance repository');
}

const expectedTag = process.env.README_FIT_RELEASE_TAG;
if (expectedTag && expectedTag !== `v${manifest.version}`) {
  fail(`release tag ${expectedTag} does not match v${manifest.version}`);
}

const cliVersion = (
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/cli.js', '--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`CLI version check failed (${code}): ${stderr}`));
    });
  })
).trim();
if (cliVersion !== manifest.version) {
  fail(`CLI reports ${cliVersion}; package reports ${manifest.version}`);
}

const pack = JSON.parse(await runNpm(['pack', '--dry-run', '--json']));
const packedFiles = new Set(pack[0]?.files?.map((file) => file.path));
const requiredFiles = [
  'action.yml',
  'CHANGELOG.md',
  'dist/cli.js',
  'dist/index.d.ts',
  'dist/index.js',
  'LICENSE',
  'package.json',
  'README.md',
  'schemas/baseline.schema.json',
  'schemas/config.schema.json',
  'schemas/report.schema.json',
];
for (const requiredFile of requiredFiles) {
  if (!packedFiles.has(requiredFile)) fail(`tarball is missing ${requiredFile}`);
}

for (const schemaPath of [
  'schemas/baseline.schema.json',
  'schemas/config.schema.json',
  'schemas/report.schema.json',
]) {
  JSON.parse(await readFile(schemaPath, 'utf8'));
}

const sbom = JSON.parse(await runNpm(['sbom', '--sbom-format=cyclonedx']));
if (sbom.metadata?.component?.name !== manifest.name) {
  fail('CycloneDX SBOM does not identify the root package');
}
if (sbom.metadata?.component?.version !== manifest.version) {
  fail('CycloneDX SBOM version does not match package.json');
}

process.stdout.write(
  `release check OK: ${manifest.name}@${manifest.version}, ${packedFiles.size} packed files, CycloneDX SBOM valid\n`,
);
