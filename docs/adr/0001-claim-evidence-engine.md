# ADR 0001: Use a typed claim-evidence engine

- Status: Accepted
- Date: 2026-08-24

## Context

The original engine lets each rule independently inspect a parsed README and repository snapshot.
That is simple, but parsing, normalization, confidence, coverage, and evidence identity become
inconsistent across rules. Presence heuristics can also appear more authoritative than the static
facts support.

## Decision

The v1 engine represents analysis as four explicit layers:

1. Repository adapters produce bounded, source-located evidence.
2. README extractors produce source-located claims.
3. Verifiers compare normalized claims and evidence without executing target code.
4. Rubrics turn verification results into transparent scores and findings.

Claims and evidence have stable subject identities. Rules consume the typed graph instead of
re-parsing raw strings when a shared extractor exists. Coverage records skipped adapters, resource
limits, and unavailable evidence.

The public API uses analyzer instances and explicit rule packs. Importing the package must not
mutate a process-global registry.

## Consequences

- JSON report schema and baseline fingerprints change in v1.
- Existing v1 baseline documents need a migration command or automatic compatibility reader.
- Ecosystem support becomes adapter-driven and testable independently.
- Heuristic rules remain possible, but must declare their confidence and deterministic boundary.
- Third-party code from a scanned repository is never loaded as a rule pack.
