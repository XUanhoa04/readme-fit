---
name: readme-fit
description: Audit project READMEs and GitHub Profile READMEs using repository evidence, deterministic readme-fit JSON, project-type-aware rubrics, first-impression heuristics, and prioritized qualitative review. Use when an agent must review README correctness, onboarding, positioning, persuasiveness, hierarchy, visual proof, audience fit, documentation drift, or public GitHub profile presentation without blindly rewriting or rewarding decoration.
---

# Audit README fit

Treat a README as a landing page, onboarding document, and representation of the project. Do not judge it in isolation.

## Choose the workflow

- For a repository README, inspect the local repository and follow the project workflow.
- For a GitHub Profile README, inspect only public evidence and follow [profile-readme.md](references/profile-readme.md).
- If both are requested, produce separate findings and scores. Never apply the project rubric to a person’s profile.

## Audit a project README

1. Run deterministic analysis before making qualitative claims:

   ```bash
   npx readme-fit scan . --format json
   ```

   If developing inside this repository, run `node dist/cli.js scan . --format json` after building. Use [scripts/inspect.mjs](scripts/inspect.mjs) when a portable wrapper is helpful.

2. Read the evidence JSON, README, package metadata, important entrypoints, examples, docs, license, CI, and assets. Never execute commands copied from the target README or import target code.
3. Confirm the inferred project type. Read [project-types.md](references/project-types.md) for the matching rubric.
4. Separate each claim into:
   - **Verified**: established by static repository evidence.
   - **Inferred**: supported by a named heuristic or qualitative judgment.
   - **Not checked**: outside available coverage.
5. Review first impression with [first-impression.md](references/first-impression.md).
6. Review visual proof with [visual-proof.md](references/visual-proof.md). Evaluate relevance, usefulness, quality, and placement—not presence alone.
7. Apply the evidence protocol and priorities in [principles.md](references/principles.md).
8. Interpret deterministic scores with [scoring.md](references/scoring.md). Do not replace transparent rule scores with an unexplained AI score.

## Resolve contradictions

Prefer repository truth for facts the static engine can verify. If README and repository disagree:

- quote or paraphrase the README claim with its path and line;
- name the conflicting metadata or file;
- label confidence;
- prioritize the issue as P0 when it can break installation, execution, navigation, or licensing.

Do not claim a command works merely because it matches metadata. Say that the command matches available metadata and that runtime execution was not checked.

## Produce the review

Lead with:

1. Strongest aspect.
2. Biggest weakness.
3. Priority-ordered findings: P0 correctness, P1 adoption blocker, P2 clarity/persuasion, P3 polish.
4. First 5 Seconds summary.
5. Coverage: Verified, Inferred, Not checked.

For every recommendation, include as much of this chain as evidence permits:

```text
Observation
Impact
Evidence
Recommendation
Priority
Confidence
```

Do not invent capabilities, users, benchmarks, or repository facts. Do not recommend a logo, badges, screenshot, video, or before/after merely because it is common. Recommend presentation changes only when they materially improve comprehension, proof, onboarding, or trust for this project type. Do not rewrite the README unless the user asks.
