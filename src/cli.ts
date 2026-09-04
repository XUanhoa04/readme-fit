#!/usr/bin/env node
import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeRepository } from './core/analysis.js';
import { compareBaseline, createBaseline, loadBaseline } from './core/baseline.js';
import { createBuiltinRules } from './rules/builtin.js';
import { renderJson } from './reporters/json.js';
import { renderSarif } from './reporters/sarif.js';
import { renderGitHub } from './reporters/github.js';
import {
  renderImpressionJson,
  renderImpressionTerminal,
  renderTerminal,
} from './reporters/terminal.js';
import { GitHubProfileProvider } from './profile/github/github-provider.js';
import { analyzeProfile } from './profile/analyzer/analyze-profile.js';
import { renderProfileTerminal } from './profile/reporter.js';
import { VERSION } from './version.js';
import { attachDiff, changedFilesSince, reportFindings } from './core/git-diff.js';
import { writeOutput } from './core/output.js';
import { loadConfig } from './core/config/config.js';

const program = new Command();
const builtinRules = createBuiltinRules();
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
const SCAN_CATEGORIES = [
  'correctness',
  'completeness',
  'onboarding',
  'clarity',
  'impression',
  'visual-proof',
  'trust',
] as const;

function validateFailOn(value: string | undefined): void {
  if (
    value &&
    !SEVERITIES.includes(value as (typeof SEVERITIES)[number]) &&
    !SCAN_CATEGORIES.includes(value as (typeof SCAN_CATEGORIES)[number])
  ) {
    throw new Error(`Unknown --fail-on value: ${value}. Expected a severity or category.`);
  }
}

function scoreGate(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('--fail-on-score must be an integer from 0 through 100.');
  }
  return parsed;
}

function findingLimit(value: string | undefined): number {
  if (value === undefined) return Infinity;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--max-findings must be a non-negative integer.');
  }
  return parsed;
}

function stripAnsi(value: string): string {
  const pattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
  return value.replace(pattern, '');
}

function limitedReport(
  report: Awaited<ReturnType<typeof analyzeRepository>>,
  limit: number,
) {
  if (!Number.isFinite(limit)) return report;
  const copy = structuredClone(report);
  copy.findings = copy.findings.slice(0, limit);
  if (copy.diff) copy.diff.findings = copy.diff.findings.slice(0, limit);
  if (copy.baseline) copy.baseline.newFindings = copy.baseline.newFindings.slice(0, limit);
  return copy;
}

program
  .name('readme-fit')
  .description('Does your README fit what you built?')
  .version(VERSION);

program
  .command('scan')
  .description('Statically audit a repository README')
  .argument('[path]', 'repository path', '.')
  .option('--json', 'emit machine-readable JSON')
  .option('--format <format>', 'output format: text, json, sarif, or github', 'text')
  .option('--impression', 'show only the first-impression report')
  .option('--check-links', 'check external HTTP links with bounded network requests')
  .option('--project <path>', 'select a package directory inside a monorepo')
  .option('--readme <path>', 'override the README path inside the selected project')
  .option('--baseline <file>', 'compare against a previously captured baseline')
  .option(
    '--changed-since <ref>',
    'report findings attached to files changed since a Git ref',
  )
  .option('--verbose', 'show every applicable rule result')
  .option('--quiet', 'show only the overall score and critical findings')
  .option('--output <file>', 'write output atomically instead of printing to stdout')
  .option('--max-findings <count>', 'limit emitted findings')
  .option('--no-color', 'disable ANSI color output')
  .option('--fail-on <level>', 'exit non-zero on a category or severity')
  .option('--fail-on-score <score>', 'exit non-zero when the overall score is lower')
  .action(
    async (
      repositoryPath: string,
      options: {
        json?: boolean;
        format: string;
        impression?: boolean;
        checkLinks?: boolean;
        project?: string;
        readme?: string;
        baseline?: string;
        changedSince?: string;
        verbose?: boolean;
        quiet?: boolean;
        output?: string;
        maxFindings?: string;
        color: boolean;
        failOn?: string;
        failOnScore?: string;
      },
    ) => {
      try {
        validateFailOn(options.failOn);
        const minimumScore = scoreGate(options.failOnScore);
        const maximumFindings = findingLimit(options.maxFindings);
        if (options.baseline && options.changedSince) {
          throw new Error('--baseline and --changed-since cannot be used together.');
        }
        const report = await analyzeRepository(repositoryPath, {
          checkLinks: Boolean(options.checkLinks),
          ...(options.project ? { projectPath: options.project } : {}),
          ...(options.readme ? { readmePath: options.readme } : {}),
        });
        if (options.baseline) {
          report.baseline = compareBaseline(
            report,
            await loadBaseline(path.resolve(options.baseline)),
          );
        }
        if (options.changedSince) {
          const changed = await changedFilesSince(repositoryPath, options.changedSince);
          attachDiff(report, options.changedSince, changed, options.project);
        }
        const format = options.json ? 'json' : options.format;
        if (options.json && options.format !== 'text') {
          throw new Error('--json and --format cannot be used together.');
        }
        if (!['text', 'json', 'sarif', 'github'].includes(format))
          throw new Error(`Unknown format: ${format}`);
        if (options.impression && !['text', 'json'].includes(format)) {
          throw new Error('--impression supports only text and json formats.');
        }
        if (options.verbose && options.quiet)
          throw new Error('--verbose and --quiet cannot be used together.');
        const emittedReport = limitedReport(report, maximumFindings);
        let output = options.impression
          ? format === 'json'
            ? renderImpressionJson(emittedReport)
            : renderImpressionTerminal(emittedReport)
          : format === 'json'
            ? renderJson(emittedReport)
            : format === 'sarif'
              ? renderSarif(report, maximumFindings)
              : format === 'github'
                ? renderGitHub(report, maximumFindings)
                : renderTerminal(emittedReport, {
                    verbose: Boolean(options.verbose),
                    quiet: Boolean(options.quiet),
                  });
        if (!options.color) output = stripAnsi(output);
        if (options.output) await writeOutput(options.output, output);
        else process.stdout.write(output);
        if (options.failOn) {
          const candidateFindings = reportFindings(report);
          if (SEVERITIES.includes(options.failOn as (typeof SEVERITIES)[number])) {
            const threshold = SEVERITIES.indexOf(
              options.failOn as (typeof SEVERITIES)[number],
            );
            if (
              candidateFindings.some(
                (finding) => SEVERITIES.indexOf(finding.severity) <= threshold,
              )
            )
              process.exitCode = 1;
          } else {
            const hasFailure =
              report.baseline || report.diff
                ? candidateFindings.some((finding) => finding.category === options.failOn)
                : report.scores[options.failOn as keyof typeof report.scores]?.rules.some(
                    (rule) => rule.status === 'fail' || rule.status === 'partial',
                  );
            if (hasFailure) process.exitCode = 1;
          }
        }
        if (minimumScore !== undefined && report.overall < minimumScore) {
          process.exitCode = 1;
        }
      } catch (error) {
        process.stderr.write(
          `readme-fit: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 2;
      }
    },
  );

program
  .command('baseline')
  .description('Capture the current findings for regression-aware CI')
  .argument('[path]', 'repository path', '.')
  .option('--check-links', 'include external HTTP link checks in the baseline')
  .option('--project <path>', 'select a package directory inside a monorepo')
  .option('--readme <path>', 'override the README path inside the selected project')
  .option('--output <file>', 'write the baseline atomically instead of printing it')
  .action(
    async (
      repositoryPath: string,
      options: {
        checkLinks?: boolean;
        project?: string;
        readme?: string;
        output?: string;
      },
    ) => {
      try {
        const report = await analyzeRepository(repositoryPath, {
          checkLinks: Boolean(options.checkLinks),
          ...(options.project ? { projectPath: options.project } : {}),
          ...(options.readme ? { readmePath: options.readme } : {}),
        });
        const output = `${JSON.stringify(createBaseline(report), null, 2)}\n`;
        if (options.output) await writeOutput(options.output, output);
        else process.stdout.write(output);
      } catch (error) {
        process.stderr.write(
          `readme-fit baseline: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 2;
      }
    },
  );

program
  .command('init')
  .description('Create a safe declarative readme-fit configuration')
  .argument('[path]', 'repository path', '.')
  .option('-f, --force', 'overwrite existing configuration file')
  .action(async (repositoryPath: string, options: { force?: boolean }) => {
    try {
      const target = path.resolve(repositoryPath, '.readme-fit.yml');
      await writeFile(
        target,
        'version: 2\nproject:\n  type: auto\nscoring:\n  preset: balanced\n',
        { encoding: 'utf8', flag: options.force ? 'w' : 'wx' },
      );
      process.stdout.write(`Created ${target}\n`);
    } catch (error) {
      process.stderr.write(
        `readme-fit init: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    }
  });

const configCommand = program
  .command('config')
  .description('Manage readme-fit configuration');

configCommand
  .command('validate')
  .description('Validate and normalize the declarative configuration')
  .argument('[path]', 'repository path', '.')
  .option('--json', 'emit normalized configuration as JSON')
  .action(async (repositoryPath: string, options: { json?: boolean }) => {
    try {
      const config = await loadConfig(
        path.resolve(repositoryPath),
        new Set(builtinRules.map((rule) => rule.id)),
      );
      process.stdout.write(
        options.json
          ? `${JSON.stringify(config, null, 2)}\n`
          : `readme-fit config: valid v${config.version}${config.migratedFrom ? ` (migrated from v${config.migratedFrom})` : ''}\n`,
      );
    } catch (error) {
      process.stderr.write(
        `readme-fit config: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    }
  });

program
  .command('doctor')
  .description('Validate configuration and repository analysis prerequisites')
  .argument('[path]', 'repository path', '.')
  .option('--json', 'emit machine-readable JSON')
  .action(async (repositoryPath: string, options: { json?: boolean }) => {
    try {
      const report = await analyzeRepository(repositoryPath);
      const workspace = report.facts.workspace as
        | { lockfileConflicts?: string[]; isMonorepo?: boolean; packages?: unknown[] }
        | undefined;
      const lockfileConflicts = workspace?.lockfileConflicts ?? [];
      const hasConflicts = lockfileConflicts.length > 0;
      const diagnosis = {
        ok: !hasConflicts,
        version: VERSION,
        node: process.version,
        projectType: report.project.primaryType,
        rubricStatus: report.project.rubricStatus,
        readme: report.readme.path,
        lockfileConflicts,
        inspectionTruncated: report.facts.repositoryInspection
          ? (report.facts.repositoryInspection as { truncated?: boolean }).truncated ===
            true
          : false,
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(diagnosis, null, 2)}\n`);
      } else {
        const status = diagnosis.ok ? 'OK' : 'WARNING (lockfile conflict)';
        let text = `readme-fit doctor: ${status}\nNode ${diagnosis.node}\nProject ${diagnosis.projectType} (${diagnosis.rubricStatus} rubric)\nREADME ${diagnosis.readme}\n`;
        if (hasConflicts) {
          text += `Lockfile conflicts detected: ${lockfileConflicts.join(', ')}\n`;
        }
        process.stdout.write(text);
      }
    } catch (error) {
      process.stderr.write(
        `readme-fit doctor: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    }
  });

program
  .command('impression')
  .description('Show only the heuristic first-impression audit')
  .argument('[path]', 'repository path', '.')
  .option('--json', 'emit machine-readable JSON')
  .option('--format <format>', 'output format: text or json', 'text')
  .action(async (repositoryPath: string, options: { json?: boolean; format: string }) => {
    try {
      const report = await analyzeRepository(repositoryPath);
      const format = options.json ? 'json' : options.format;
      if (!['text', 'json'].includes(format)) throw new Error(`Unknown format: ${format}`);
      process.stdout.write(
        format === 'json' ? renderImpressionJson(report) : renderImpressionTerminal(report),
      );
    } catch (error) {
      process.stderr.write(
        `readme-fit impression: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    }
  });

program
  .command('explain')
  .description('Explain a rule')
  .argument('<rule-id>')
  .option('--json', 'emit machine-readable JSON')
  .option('--format <format>', 'output format: text or json', 'text')
  .action((ruleId: string, options: { json?: boolean; format: string }) => {
    const rule = builtinRules.find((candidate) => candidate.id === ruleId);
    if (!rule) {
      process.stderr.write(`Unknown rule: ${ruleId}\n`);
      process.exitCode = 2;
      return;
    }
    const format = options.json ? 'json' : options.format;
    if (!['text', 'json'].includes(format)) {
      process.stderr.write(`readme-fit explain: Unknown format: ${format}\n`);
      process.exitCode = 2;
      return;
    }
    if (format === 'json') {
      process.stdout.write(
        `${JSON.stringify(
          {
            id: rule.id,
            category: rule.category,
            description: rule.description,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      process.stdout.write(`${rule.id}\n\n${rule.description}\n`);
    }
  });

program
  .command('profile')
  .description('Audit the evidence visible on a public GitHub profile')
  .argument('<github-user>', 'GitHub username')
  .option('--json', 'emit machine-readable JSON')
  .option('--format <format>', 'output format: text or json', 'text')
  .action(async (username: string, options: { json?: boolean; format: string }) => {
    try {
      const report = await analyzeProfile(username, new GitHubProfileProvider());
      const format = options.json ? 'json' : options.format;
      if (!['text', 'json'].includes(format)) throw new Error(`Unknown format: ${format}`);
      process.stdout.write(
        format === 'json'
          ? `${JSON.stringify(report, null, 2)}\n`
          : renderProfileTerminal(report),
      );
    } catch (error) {
      process.stderr.write(
        `readme-fit profile: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    }
  });

program
  .command('list-rules')
  .description('List rule IDs, categories, and explanations')
  .option('--json', 'emit machine-readable JSON')
  .option('--format <format>', 'output format: text or json', 'text')
  .action((options: { json?: boolean; format: string }) => {
    const rules = builtinRules.map((rule) => ({
      id: rule.id,
      category: rule.category,
      description: rule.description,
    }));
    const format = options.json ? 'json' : options.format;
    if (!['text', 'json'].includes(format)) {
      process.stderr.write(`readme-fit list-rules: Unknown format: ${format}\n`);
      process.exitCode = 2;
      return;
    }
    if (format === 'json') {
      process.stdout.write(`${JSON.stringify(rules, null, 2)}\n`);
    } else {
      process.stdout.write(
        `${rules
          .map(
            (rule) =>
              `${rule.id.padEnd(42)} ${rule.category.padEnd(14)} ${rule.description}`,
          )
          .join('\n')}\n`,
      );
    }
  });

await program.parseAsync();
