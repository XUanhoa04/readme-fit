# readme-fit

**Does your README fit what you built?**

Test correctness. Audit first impressions. Improve with evidence.

```bash
npx readme-fit scan
```

```text
README FIT                    81/100

Correctness                       94
Onboarding                        82
First Impression                  61

P0  Documented package script does not exist
P1  First result is not shown near Quick Start
P2  The outcome is buried below implementation detail
```

`readme-fit` audits a README as the landing page, onboarding guide, and public introduction to the
software that actually exists in its repository. It finds documentation drift and explains why a
new visitor may not understand, try, or trust the project.

> **Don't generate a prettier README. Find why the current README fails.**

## Why

Markdown linters can validate syntax. README generators can assemble familiar sections. Neither
answers whether the install command matches package metadata, the linked example still exists, the
first useful command is buried, or the visible proof is relevant to this kind of project.

`readme-fit` combines repository truth, Markdown structure, project-aware heuristics, and an
optional AI review skill. Findings follow a practical chain:

```text
Observation → Impact → Evidence → Recommendation
```

Presence is not quality. A logo is not automatically useful. A demo is not automatically relevant.
An installation section does not mean its command matches the repository.

## Quick Start

Node.js >=20 is required.

```bash
npx readme-fit scan
npx readme-fit scan ./path
npx readme-fit scan --format json
npx readme-fit impression
```

The scan is local and static by default. Source code is not uploaded, README commands are not run,
and target modules are not imported.

## What it checks

- README commands against package scripts.
- Relative links and image paths against repository files.
- npm and Python install targets against package metadata.
- documented Node.js and Python versions against manifests and version files.
- malformed package metadata that prevents trustworthy verification.
- recognizable license claims against local license evidence.
- project type from package manifests, entrypoints, dependencies, and repository layout.
- hero content, first runnable command, first-success path, and expected output.
- demo form and placement, badge noise, meaningful trust signals, and basic structure hygiene.
- project-type-aware completeness and a heuristic First 5 Seconds view.

The Markdown parser uses the unified/remark AST ecosystem. The tool does not attempt to replace a
mature Markdown style linter or grammar checker.

## Example report

```text
readme-fit
Does your README fit what you built?

PROJECT

Type        cli / developer-tool
README      README.md
Files       183
Language    TypeScript

README FIT

Correctness           94
Completeness          86
Onboarding            82
Clarity               84
First Impression      61
Visual Proof          52
Trust                 90

Overall               81

TOP PRIORITIES

P0  README command may be stale
README.md:47

The documented command references a package script that does not exist.

Impact:
A new user following the command will receive a package-manager error.

Recommendation:
Replace the command with an existing script or add the missing script.

Confidence: HIGH · deterministic
```

## Project-aware scoring

The classifier can emit a primary type plus secondary labels:

```text
cli · library · sdk · api · web-app · desktop-app · mobile-app
developer-tool · github-action · vscode-extension · ai-model · ai-agent
dataset · template · tutorial · documentation · infrastructure · unknown
```

A CLI gives substantial weight to installation, first command, and representative terminal output.
A library emphasizes installation, a minimal code example, expected result, and runtime support. A
desktop app places more value on screenshots and platform/download guidance. Rules that do not help
a project type return `not_applicable`; they do not silently become zero.

Weights live in [src/scoring/weights.ts](src/scoring/weights.ts), and every category includes its
rule-level score explanation in JSON.

## Correctness checks

The deterministic engine statically compares claims it can verify:

```text
README command       ↔ package.json scripts
relative path        ↔ repository filesystem
install target       ↔ package/project name
Node requirement     ↔ engines, .nvmrc, .node-version
Python requirement   ↔ pyproject.toml, .python-version
license claim        ↔ LICENSE and package metadata
```

A metadata match is reported as a static match—not proof that installation or execution succeeds.
Unknown licenses remain unverified instead of being guessed.

## First 5 Seconds

Run either form:

```bash
npx readme-fit impression
npx readme-fit scan --impression
```

The report asks whether a quick visitor can understand what it is, why it matters, see it working,
know how to try it, and find trust signals. The result is explicitly labeled:

> First-impression score is a heuristic based on README structure and content, not actual user
> testing.

No eye-tracking or behavioral measurement is implied.

`impression` and `scan --impression` intentionally produce a focused report containing only the
five heuristic answers, their transparent rule score, and impression priorities. A normal `scan`
keeps the complete repository audit.

## Visual proof

The visual category asks whether a visitor can see the project work—not whether the page is pretty.
Proof may be terminal output, a screenshot, GIF, recording, before/after, diagram, or interactive
demo. Relevance and placement matter. Terminal output can be enough for a CLI; a tiny library is not
penalized for lacking a video or logo.

Linked video content is not inspected by the MVP. The report only states that a link was detected.

## AI Skill

The deterministic CLI owns facts. The bundled [AI Agent Skill](skills/readme-fit/SKILL.md) consumes
its evidence JSON and adds qualitative review for clarity, positioning, persuasion, information
hierarchy, storytelling, audience fit, and prioritization.

```text
Repository → deterministic CLI → evidence JSON → AI Skill → qualitative review
```

The skill is client-independent and includes focused references for principles, project types,
scoring, first impression, profile README analysis, and visual proof. It instructs Codex, Claude Code,
and other skill-capable agents to inspect the repository, keep verified facts separate from
heuristics, prioritize correctness before polish, and avoid decorative advice without a user impact.

## GitHub Profile README

Audit the evidence visible on a public GitHub profile:

```bash
npx readme-fit profile xuanhoa04
npx readme-fit profile xuanhoa04 --format json
```

Profile mode has a separate 100-point rubric: Positioning, Proof of Work, Project Selection,
Scanability, Technical Narrative, and Contact. It inspects the profile README, public bio,
repository descriptions, topics, languages, and visible repository links through a replaceable
provider interface.

It never equates GitHub evidence with human ability:

> This report describes what the public GitHub profile visibly demonstrates. It does not measure
> the person’s actual skills, identity, or professional experience.

The GitHub public REST API does not expose pinned repository selection, so the MVP reports pinned
repositories as not checked instead of substituting recent projects.

## Configuration

Create `.readme-fit.yml` or `.readme-fit.yaml` in the repository root:

```yaml
version: 1

project:
  type: auto

readme:
  path: README.md

rules:
  correctness: true
  onboarding: true
  visual_proof: true
  first_impression: true

ignore:
  rules:
    - trust.badges.signal-to-noise
  paths:
    - examples/generated/**

scoring:
  preset: balanced
```

Configuration is validated strictly: unknown keys, project types, presets, non-boolean rule values,
and unknown ignored rule IDs produce a clear error instead of being silently accepted. Presets
change weights for different operating contexts:

- `minimal`: emphasize first success and reduce optional presentation weight;
- `balanced`: use the default project-aware weights;
- `oss`: emphasize correctness, licensing, maintenance, and contribution evidence;
- `portfolio`: emphasize positioning, visible proof, and first impression.

## CI

Fail on a severity threshold:

```bash
npx readme-fit scan --fail-on critical
```

Or fail when any rule in a category fails:

```bash
npx readme-fit scan --fail-on correctness
```

GitHub Actions example:

```yaml
- run: npx readme-fit scan --fail-on critical
```

The CLI exits with code `1` for a configured finding threshold and `2` for scan/configuration errors.

For an existing documentation backlog, capture a baseline and fail only on new regressions:

```bash
npx readme-fit baseline > .readme-fit-baseline.json
npx readme-fit scan --baseline .readme-fit-baseline.json --fail-on critical
```

Fingerprints use the rule, source path, and finding title—not the line number—so ordinary README
line movement does not create a new regression. The report also shows resolved and unchanged
findings plus category score deltas.

## External links

Default scans never require a network connection. Opt in when URL availability matters:

```bash
npx readme-fit scan --check-links
```

External checks use bounded concurrency, a five-second request timeout, redirects, and a GET
fallback for servers that reject HEAD. Authentication-blocked responses are `unverified`, not
fabricated as reachable. Response status is checked; linked page or video quality is not analyzed.

## JSON API

Use `--json` or `--format json` for a stable, machine-readable report:

```json
{
  "schemaVersion": 1,
  "project": {},
  "scores": {
    "onboarding": {
      "category": "onboarding",
      "score": 76,
      "maxScore": 100,
      "rules": [
        {
          "id": "onboarding.quick-start.present",
          "status": "pass",
          "weight": 35,
          "earned": 35,
          "explanation": "A labeled onboarding path contains runnable guidance."
        }
      ]
    }
  },
  "findings": [],
  "facts": {},
  "coverage": {},
  "limitations": []
}
```

Programmatic use is available from the package root:

```js
import { analyzeRepository } from 'readme-fit';

const report = await analyzeRepository('.');
```

## How scoring works

Analyzers emit facts and findings. Modular rules decide applicability and return `pass`, `fail`, or
`not_applicable` with explicit weight and earned points. Category scores normalize only applicable
rules to 100. Overall is the mean of applicable category scores.

Confidence and source are separate dimensions:

```text
Confidence: HIGH   Source: deterministic metadata comparison
Confidence: MEDIUM Source: documented heuristic
```

Use the built-in explanation command to inspect a rule:

```bash
npx readme-fit explain correctness.command.exists
npx readme-fit list-rules
```

Use `--verbose` to show every applicable rule result or `--quiet` for a compact CI summary. These
two display modes are mutually exclusive.

## Architecture

```text
src/
  cli.ts                 command routing and exit codes
  core/                  config, repository inspection, Markdown AST, orchestration
  classifiers/           project-type inference
  analyzers/             focused facts and findings
  rules/                 registry and rule contracts
  scoring/               project-aware weight data
  profile/               provider, GitHub adapter, analyzer, rubric, reporter
  reporters/             terminal and JSON presentation
  models/                stable evidence/report types
skills/readme-fit/        AI workflow and reference rubrics
fixtures/                 good, stale, library, desktop, and profile cases
tests/                    unit, integration, profile, schema, and skill safeguards
```

Analysis stays out of reporters. The GitHub provider stays out of profile scoring so tests use
fixtures without a network dependency.

## Privacy and safety

Project scans are local by default. `readme-fit` does not upload source, execute scripts, run project
code, import target modules, or build containers. It follows external links only when the user
passes `--check-links`. Profile mode reads public GitHub information and may use `GITHUB_TOKEN` to
increase API limits.

Repository text files used as metadata and READMEs are limited to 1 MiB. Relative links are checked
against canonical paths so a symlink cannot make a README target appear to remain inside the repo.

There is no `--execute` mode in the MVP.

## Limitations

- static metadata matching does not prove commands succeed;
- external URL health is not checked unless `--check-links` is provided;
- video and remote demo content is not analyzed;
- license recognition intentionally covers only a small, confident set;
- Python metadata parsing is section-aware but deliberately conservative;
- flags, runtime API behavior, generated docs, and configuration drift are not verified;
- profile REST data does not include pinned repository selection;
- first-impression and semantic recommendations are heuristics, not user research.

Every report repeats its applicable coverage limitations.

## Roadmap

- [x] README structure audit
- [x] repository-aware correctness checks
- [x] project-type classification
- [x] first-impression audit
- [x] JSON report
- [x] AI Agent Skill
- [x] GitHub Profile mode
- [x] baseline regression mode
- [x] opt-in external link checking
- [x] Node.js and Python metadata adapters
- [ ] automatic PR suggestions
- [ ] README diff regression mode
- [ ] scheduled external link monitoring
- [ ] Rust, Go, and additional ecosystem metadata adapters
- [ ] VS Code integration
- [ ] dedicated GitHub Action package
- [ ] team-specific rubrics

## Development

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
npm run demo
npm run dogfood
```

The stale fixture intentionally contains a wrong package command, broken link, runtime/license
contradictions, delayed onboarding, late visual proof, and badge clutter. The good CLI fixture should
produce substantially fewer findings.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a rule. New rules need fixture evidence,
project-type applicability, transparent scoring, and an explicit coverage boundary. Security issues
should follow [SECURITY.md](SECURITY.md).

## License

MIT
