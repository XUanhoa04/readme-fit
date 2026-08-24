# readme-fit v1 product contract

## Product promise

`readme-fit` detects README drift by connecting a claim in a README to evidence in the
repository and reporting the verification result in a form that can gate a pull request.

The v1 evidence path is:

```text
README claim -> repository evidence -> verification -> actionable finding
```

The deterministic engine owns facts. Heuristics may explain likely reader impact, but they must
never be presented as runtime verification or user research.

## Safety boundary

A repository passed to `readme-fit` is untrusted. An offline scan:

- reads bounded repository metadata and Markdown;
- never runs README commands, package scripts, project code, containers, or imported target
  modules;
- never follows network links unless the caller explicitly enables link checks;
- never reads a configured README or linked file outside the canonical repository root;
- reports inspection limits and skipped evidence instead of silently treating partial coverage as
  complete.

Network checks must reject loopback, link-local, private-network, and cloud-metadata destinations,
including redirect targets.

## Verification vocabulary

Every evaluated claim has exactly one verification state:

| State            | Meaning                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `verified`       | Available static evidence supports the normalized claim.            |
| `contradicted`   | Available static evidence conflicts with the normalized claim.      |
| `unverified`     | Evidence exists or was requested, but it cannot establish a result. |
| `not_applicable` | The rule does not apply to the selected project.                    |
| `skipped`        | A declared safety, resource, or caller policy prevented evaluation. |

`pass`, `partial`, and `fail` are scoring outcomes. They do not replace verification states.

## Stable project rubrics

The v1 stable project rubrics are:

- CLI;
- library and SDK;
- web application;
- API;
- desktop application;
- GitHub Action.

The classifier may still recognize other labels, but AI model, AI agent, mobile app, dataset,
template, tutorial, documentation, infrastructure, and editor-extension rubrics remain
experimental until their fixture corpus and coverage matrix meet the v1 quality gates.

Hybrid repositories may have one primary type and multiple secondary labels. A configured primary
type changes the rubric, but it must not erase contradictory classifier evidence.

## Compatibility contract

- CLI exit `0`: the command completed and no configured gate failed.
- CLI exit `1`: analysis completed and a configured quality gate failed.
- CLI exit `2`: invalid arguments, configuration, input, or an analysis failure.
- Machine-readable output uses a versioned JSON Schema.
- Baselines use their own versioned schema and include enough subject identity to distinguish
  multiple findings from the same rule and file.
- A major schema remains readable through a documented migration path for at least one major
  release.
- Output ordering is deterministic apart from explicitly volatile fields such as timestamps.

## Scoring invariants

- `0 <= earned <= weight` for every rule.
- Category and overall scores are either `null` or integers from 0 through 100.
- A category with no evaluated evidence is `null`, never an implicit pass.
- Overall score includes only covered categories and exposes the category weights used.
- Every deduction has a rule result; every failing or partial actionable result has a finding or a
  documented non-actionable reason.
- Unsupported and skipped checks cannot increase a score.

## Public versus experimental surfaces

Repository analysis, machine-readable output, baseline comparison, and CI integration are the core
v1 product. GitHub Profile analysis remains available as an experimental command with a distinct
schema and disclaimer. Profile scores never contribute to repository scores.

## Definition of done for v1

The stable release requires:

- adversarial regression tests for path, score, baseline, parser, and network boundaries;
- fixture-backed stable rubrics;
- validated JSON and SARIF output;
- tarball installation tests on every supported operating system and Node.js release line;
- a reproducible demo showing a real README regression on a pull request;
- a migration guide from `0.2.x` report and baseline formats;
- provenance-enabled release automation.
