# Migrating from 0.2.x to v1

This document tracks the breaking changes planned for `readme-fit` v1. It is updated as each v1
phase lands.

## Reports

Repository reports move from schema version 1 to version 2. Version 2 adds explicit verification
states, coverage details, category weights, stable finding subjects, and scan diagnostics.

Consumers should:

1. branch on `schemaVersion`;
2. avoid deriving behavior from display text;
3. use rule IDs, reason codes, verification states, and source locations;
4. treat unknown future enum values as non-passing until explicitly supported.

## Baselines

Baseline schema version 2 distinguishes multiple findings emitted by the same rule and file. The
v1 CLI will read a version 1 baseline, migrate it in memory with a compatibility warning, and write
only version 2 documents.

Regenerate a baseline after reviewing the migrated result:

```bash
readme-fit baseline . --output .readme-fit-baseline.json
```

## Exit codes

Exit code meanings remain `0`, `1`, and `2`, but invalid `--fail-on` values now return `2` instead
of silently passing.

## Project types

Recognized labels and stable rubrics are now distinct. Experimental types remain visible in
classification output, but do not claim full project-aware coverage.

## GitHub Profile mode

Profile mode remains a separate experimental report. It is not part of repository scoring and may
move to an optional package in a later major release.
