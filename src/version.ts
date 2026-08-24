import { readFileSync } from 'node:fs';
import { valid as validSemver } from 'semver';

const manifest: unknown = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

if (typeof manifest !== 'object' || manifest === null) {
  throw new Error('Package manifest must be a JSON object.');
}

const version = (manifest as Record<string, unknown>).version;
if (typeof version !== 'string' || validSemver(version) !== version) {
  throw new Error('Package manifest must contain a valid semantic version.');
}

export const VERSION = version;
