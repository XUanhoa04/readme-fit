import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectRepository } from '../src/core/repository/inspector.js';
import { classifyProject } from '../src/classifiers/project-type/classifier.js';
import { analyzeRepository } from '../src/core/analysis.js';

const temporaryDirectories: string[] = [];

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'readme-fit-workspace-'));
  temporaryDirectories.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('workspace repository inspection', () => {
  it('builds a Node workspace graph and reports conflicting root lockfiles', async () => {
    const root = await repository({
      'README.md': '# Workspace\n\nA useful tool workspace.\n',
      'package.json': JSON.stringify({
        name: 'tool-workspace',
        private: true,
        workspaces: ['packages/*'],
      }),
      'package-lock.json': '{}',
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'packages/cli/package.json': JSON.stringify({
        name: 'workspace-cli',
        bin: { workspace: 'dist/cli.js' },
      }),
      'packages/cli/README.md':
        '# CLI\n\nUseful CLI.\n\n## Quick Start\n\n```bash\nnpx workspace-cli scan\n```\n',
      'packages/library/package.json': JSON.stringify({
        name: 'workspace-library',
        exports: './dist/index.js',
      }),
      'packages/library/README.md': '# Library\n\nUseful library.\n',
    });
    const snapshot = await inspectRepository(root);
    expect(snapshot.workspace.isMonorepo).toBe(true);
    expect(snapshot.workspace.packages).toHaveLength(3);
    expect(snapshot.workspace.lockfileConflicts).toEqual(['npm', 'pnpm']);
    expect(
      snapshot.workspace.packages.find((item) => item.name === 'workspace-cli')?.hasCli,
    ).toBe(true);
    const profile = classifyProject(snapshot);
    expect(profile.primaryType).toBe('cli');
    expect(profile.classificationEvidence[0]?.source).toBe('packages/cli/package.json');

    const report = await analyzeRepository(root);
    expect(
      report.findings.some(
        (finding) => finding.id === 'correctness.package-manager.consistent',
      ),
    ).toBe(true);
  });

  it('selects a nested project and an explicit README without escaping the root', async () => {
    const root = await repository({
      'README.md': '# Root\n\nWorkspace root.\n',
      'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
      'packages/cli/package.json': JSON.stringify({
        name: 'workspace-cli',
        bin: 'dist/cli.js',
      }),
      'packages/cli/GUIDE.md':
        '# Workspace CLI\n\nDetects drift for maintainers.\n\n## Quick Start\n\n```bash\nnpx workspace-cli scan\n```\n',
    });
    const report = await analyzeRepository(root, {
      projectPath: 'packages/cli',
      readmePath: 'GUIDE.md',
    });
    expect(report.project.packageName).toBe('workspace-cli');
    expect(report.readme.path).toBe('GUIDE.md');
    await expect(analyzeRepository(root, { projectPath: '../outside' })).rejects.toThrow(
      /inside the repository root/i,
    );
  });

  it('discovers Python, Cargo, and Go workspace members', async () => {
    const python = await repository({
      'README.md': '# Python workspace\n',
      'pyproject.toml': '[tool.uv.workspace]\nmembers = ["packages/*"]\n',
      'packages/lib/pyproject.toml':
        '[project]\nname = "python-member"\n[project.scripts]\nmember = "member:main"\n',
      'packages/lib/README.md': '# Python member\n',
    });
    const rust = await repository({
      'README.md': '# Rust workspace\n',
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
      'crates/tool/Cargo.toml': '[package]\nname = "rust-member"\nversion = "1.0.0"\n',
      'crates/tool/src/main.rs': 'fn main() {}\n',
    });
    const go = await repository({
      'README.md': '# Go workspace\n',
      'go.work': 'go 1.23\nuse (\n  ./cmd/tool\n)\n',
      'cmd/tool/go.mod': 'module example.com/tool\n\ngo 1.23\n',
      'cmd/tool/main.go': 'package main\nfunc main() {}\n',
    });
    const [pythonSnapshot, rustSnapshot, goSnapshot] = await Promise.all([
      inspectRepository(python),
      inspectRepository(rust),
      inspectRepository(go),
    ]);
    expect(pythonSnapshot.workspace.packages[0]).toEqual(
      expect.objectContaining({ ecosystem: 'python', name: 'python-member', hasCli: true }),
    );
    expect(rustSnapshot.workspace.packages[0]).toEqual(
      expect.objectContaining({ ecosystem: 'rust', name: 'rust-member', hasCli: true }),
    );
    expect(goSnapshot.workspace.packages[0]).toEqual(
      expect.objectContaining({ ecosystem: 'go', name: 'example.com/tool', hasCli: true }),
    );
  });
});
