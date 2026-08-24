# Architecture

`readme-fit` is a bounded static-analysis pipeline for untrusted repositories.

```text
repository files ─┐
                  ├─> snapshot + workspace graph ─> classifier
README Markdown ──┘              │                     │
                                 └─> claim/evidence graph
                                              │
                     config + rule packs ─> analyzer ─> scores/findings
                                                          │
                                      terminal / JSON / SARIF / GitHub
```

## Boundaries

- Repository inspection reads files and metadata; it never imports or executes target code.
- Markdown parsing owns source positions and structural facts.
- The classifier emits weighted evidence, a primary type, secondary labels, confidence, and rubric
  maturity.
- Claim verification distinguishes `verified`, `contradicted`, `unverified`, `not_applicable`, and
  `skipped`.
- Rules own applicability and scoring outcomes; reporters contain no analysis logic.
- An Analyzer owns its registry. Importing the package does not mutate process-global rule state.

## Determinism

Findings are sorted by severity, priority, path, line, and rule ID. Baseline fingerprints exclude
line numbers and include stable evidence subjects. Timestamps are the only intentionally volatile
report field.

## Resource limits

Text inputs are capped at 1 MiB, repository walking at 10,000 files, and external checks at 100
unique URLs. Network checks have bounded concurrency, timeout, redirect, and destination policy.

See [ADR 0001](adr/0001-claim-evidence-engine.md) for the claim/evidence decision.
