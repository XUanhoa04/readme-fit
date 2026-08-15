#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { analyzeRepository } from './core/analysis.js';
import { compareBaseline, createBaseline, loadBaseline } from './core/baseline.js';
import { explainRule, getRules } from './rules/registry.js';
import { renderJson } from './reporters/json.js';
import {
  renderImpressionJson,
  renderImpressionTerminal,
  renderTerminal,
} from './reporters/terminal.js';
import { GitHubProfileProvider } from './profile/github/github-provider.js';
import { analyzeProfile } from './profile/analyzer/analyze-profile.js';
import { renderProfileTerminal } from './profile/reporter.js';
import { VERSION } from './version.js';

const program = new Command();
program
  .name('readme-fit')
  .description('Does your README fit what you built?')
  .version(VERSION);

program
  .command('scan')
  .description('Statically audit a repository README')
  .argument('[path]', 'repository path', '.')
  .option('--json', 'emit machine-readable JSON')
  .option('--format <format>', 'output format: text or json', 'text')
  .option('--impression', 'show only the first-impression report')
  .option('--check-links', 'check external HTTP links with bounded network requests')
  .option('--baseline <file>', 'compare against a previously captured baseline')
  .option('--verbose', 'show every applicable rule result')
  .option('--quiet', 'show only the overall score and critical findings')
  .option('--fail-on <level>', 'exit non-zero on a category or severity')
  .action(
    async (
      repositoryPath: string,
      options: {
        json?: boolean;
        format: string;
        impression?: boolean;
        checkLinks?: boolean;
        baseline?: string;
        verbose?: boolean;
        quiet?: boolean;
        failOn?: string;
      },
    ) => {
      try {
        const report = await analyzeRepository(repositoryPath, {
          checkLinks: Boolean(options.checkLinks),
        });
        if (options.baseline) {
          report.baseline = compareBaseline(
            report,
            await loadBaseline(path.resolve(options.baseline)),
          );
        }
        const format = options.json ? 'json' : options.format;
        if (!['text', 'json'].includes(format))
          throw new Error(`Unknown format: ${format}`);
        if (options.verbose && options.quiet)
          throw new Error('--verbose and --quiet cannot be used together.');
        process.stdout.write(
          options.impression
            ? format === 'json'
              ? renderImpressionJson(report)
              : renderImpressionTerminal(report)
            : format === 'json'
              ? renderJson(report)
              : renderTerminal(report, {
                  verbose: Boolean(options.verbose),
                  quiet: Boolean(options.quiet),
                }),
        );
        if (options.failOn) {
          const candidateFindings = report.baseline?.newFindings ?? report.findings;
          const severities = ['critical', 'high', 'medium', 'low', 'info'];
          if (severities.includes(options.failOn)) {
            const threshold = severities.indexOf(options.failOn);
            if (
              candidateFindings.some(
                (finding) => severities.indexOf(finding.severity) <= threshold,
              )
            )
              process.exitCode = 1;
          } else {
            const hasFailure = report.baseline
              ? candidateFindings.some((finding) => finding.category === options.failOn)
              : report.scores[options.failOn as keyof typeof report.scores]?.rules.some(
                  (rule) => rule.status === 'fail',
                );
            if (hasFailure) process.exitCode = 1;
          }
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
  .action(async (repositoryPath: string, options: { checkLinks?: boolean }) => {
    try {
      const report = await analyzeRepository(repositoryPath, {
        checkLinks: Boolean(options.checkLinks),
      });
      process.stdout.write(`${JSON.stringify(createBaseline(report), null, 2)}\n`);
    } catch (error) {
      process.stderr.write(
        `readme-fit baseline: ${error instanceof Error ? error.message : String(error)}\n`,
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
  .action((ruleId: string) => {
    const rule = explainRule(ruleId);
    if (!rule) {
      process.stderr.write(`Unknown rule: ${ruleId}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`${rule.id}\n\n${rule.description}\n`);
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
  .action(() => {
    process.stdout.write(
      `${getRules()
        .map(
          (rule) => `${rule.id.padEnd(42)} ${rule.category.padEnd(14)} ${rule.description}`,
        )
        .join('\n')}\n`,
    );
  });

await program.parseAsync();
