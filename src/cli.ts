#!/usr/bin/env node
import { Command } from 'commander';
import { analyzeRepository } from './core/analysis.js';
import { explainRule } from './rules/registry.js';
import { renderJson } from './reporters/json.js';
import { renderTerminal } from './reporters/terminal.js';
import { GitHubProfileProvider } from './profile/github/github-provider.js';
import { analyzeProfile } from './profile/analyzer/analyze-profile.js';
import { renderProfileTerminal } from './profile/reporter.js';

const program = new Command();
program.name('readme-fit').description('Does your README fit what you built?').version('0.1.0');

program
  .command('scan')
  .description('Statically audit a repository README')
  .argument('[path]', 'repository path', '.')
  .option('--json', 'emit machine-readable JSON')
  .option('--format <format>', 'output format: text or json', 'text')
  .option('--impression', 'include the first-impression summary')
  .option('--fail-on <level>', 'exit non-zero on a category or severity')
  .action(async (repositoryPath: string, options: { json?: boolean; format: string; impression?: boolean; failOn?: string }) => {
    try {
      const report = await analyzeRepository(repositoryPath);
      const format = options.json ? 'json' : options.format;
      if (!['text', 'json'].includes(format)) throw new Error(`Unknown format: ${format}`);
      process.stdout.write(format === 'json' ? renderJson(report) : renderTerminal(report));
      if (options.failOn) {
        const severities = ['critical', 'high', 'medium', 'low', 'info'];
        if (severities.includes(options.failOn)) {
          const threshold = severities.indexOf(options.failOn);
          if (report.findings.some((finding) => severities.indexOf(finding.severity) <= threshold)) process.exitCode = 1;
        } else {
          const category = report.scores[options.failOn as keyof typeof report.scores];
          if (category?.rules.some((rule) => rule.status === 'fail')) process.exitCode = 1;
        }
      }
    } catch (error) {
      process.stderr.write(`readme-fit: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    }
  });

program
  .command('impression')
  .description('Show the heuristic first-impression audit')
  .argument('[path]', 'repository path', '.')
  .action(async (repositoryPath: string) => {
    const report = await analyzeRepository(repositoryPath);
    process.stdout.write(renderTerminal(report));
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
      process.stdout.write(format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderProfileTerminal(report));
    } catch (error) {
      process.stderr.write(`readme-fit profile: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    }
  });

await program.parseAsync();
