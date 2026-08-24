import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AnalysisReport, Finding } from '../models/index.js';

const execFileAsync = promisify(execFile);

function normalized(file: string): string {
  return file.replaceAll('\\', '/').replace(/^\.\//, '');
}

export async function changedFilesSince(
  root: string,
  reference: string,
): Promise<string[]> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/@{}^~:+-]*$/.test(reference)) {
    throw new Error(
      'changed-since must be a Git revision, not an option or revision range.',
    );
  }
  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        '-c',
        'diff.external=',
        '-c',
        `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--name-only',
        '-z',
        reference,
        '--',
      ],
      {
        cwd: path.resolve(root),
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 1_000_000,
        windowsHide: true,
      },
    );
    return [...new Set(stdout.split('\0').filter(Boolean).map(normalized))].sort();
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr).trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Unable to compare Git revision ${reference}: ${detail}`);
  }
}

function findingPath(
  finding: Finding,
  report: AnalysisReport,
  projectPath: string | undefined,
): string {
  const source = normalized(finding.source?.path ?? report.readme.path);
  const prefix = projectPath ? normalized(projectPath).replace(/\/$/, '') : '';
  return prefix && prefix !== '.' ? `${prefix}/${source}` : source;
}

export function attachDiff(
  report: AnalysisReport,
  base: string,
  changedFiles: string[],
  projectPath?: string,
): void {
  const changed = new Set(changedFiles.map(normalized));
  const findings = report.findings.filter((finding) =>
    changed.has(findingPath(finding, report, projectPath)),
  );
  report.diff = { base, changedFiles, findings };
}

export function reportFindings(report: AnalysisReport): Finding[] {
  return report.diff?.findings ?? report.baseline?.newFindings ?? report.findings;
}
