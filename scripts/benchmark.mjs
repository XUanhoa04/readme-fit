import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { analyzeRepository } from '../dist/index.js';

const temporary = await mkdtemp(path.join(tmpdir(), 'readme-fit-benchmark-'));
try {
  await writeFile(
    path.join(temporary, 'README.md'),
    '# Benchmark\n\nA static benchmark project for maintainers.\n',
  );
  for (let directory = 0; directory < 20; directory += 1) {
    const target = path.join(temporary, 'src', String(directory));
    await mkdir(target, { recursive: true });
    await Promise.all(
      Array.from({ length: 100 }, (_, file) =>
        writeFile(path.join(target, `file-${file}.ts`), 'export const value = 1;\n'),
      ),
    );
  }
  const started = performance.now();
  const report = await analyzeRepository(temporary);
  const elapsed = performance.now() - started;
  if (report.facts.fileCount !== 2001)
    throw new Error(`Unexpected file count: ${report.facts.fileCount}`);
  if (elapsed > 10_000)
    throw new Error(`Benchmark exceeded 10 seconds: ${elapsed.toFixed(0)}ms`);
  process.stdout.write(`benchmark OK: 2,001 files in ${elapsed.toFixed(0)}ms\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
