# Migrating from 0.2.x to v1

This document describes the compatibility boundary between `readme-fit` 0.2.x and v1.

## Reports

Repository reports move from schema version 1 to version 2. Version 2 adds explicit verification
states, coverage details, category weights, stable finding subjects, and scan diagnostics.

Consumers should:

1. branch on `schemaVersion`;
2. avoid deriving behavior from display text;
3. use rule IDs, verification states, and source locations;
4. treat unknown future enum values as non-passing until explicitly supported.

## Baselines

Baseline schema version 2 distinguishes multiple findings emitted by the same rule and file. The
v1 CLI reads a version 1 baseline, migrates it in memory, and writes only version 2 documents.

Regenerate a baseline after reviewing the migrated result:

```bash
readme-fit baseline . --output .readme-fit-baseline.json
```

## Exit codes

Exit code meanings remain `0`, `1`, and `2`, but invalid `--fail-on` values now return `2` instead
of silently passing.

New gates include `--fail-on-score`. New formats are `sarif` and `github`; `--output` writes them
atomically. Category gates treat both `partial` and `fail` as non-passing.

## Configuration

`readme-fit init` now writes config version 2. Version 1 remains readable during the v1 migration
window and `config validate --json` exposes `migratedFrom: 1`.

Config v2 adds local `extends` and per-rule `enabled`/`weight` overrides. It remains declarative:
JavaScript config and target-repository rule loading are intentionally unsupported.

```yaml
version: 2
rules:
  overrides:
    impression.proof:
      weight: 30
```

## Scoring

Rule status adds `partial`. Category objects add `weight` and `coverage`; reports add
`overallCoverage`. Overall is now a weighted average of covered categories, not a flat mean.
Generic images and ordinary code blocks are no longer accepted as visible product proof.

## Project types

Recognized labels and stable rubrics are now distinct. Experimental types remain visible in
classification output, but do not claim full project-aware coverage.

Monorepos can select a nested package with `--project` and a README within it with `--readme`.

## Public API

Use `createAnalyzer` for custom rules and packs. The v1 package has no mutable global rule registry.
Public subpaths are `readme-fit/rules`, `readme-fit/reporters`, and `readme-fit/config`.

## GitHub Profile mode

Profile mode remains a separate experimental report. It is not part of repository scoring and may
move to an optional package in a later major release.
