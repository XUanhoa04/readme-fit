# Evidence-first review principles

## Evidence protocol

Use this order for each finding:

1. **Observation** — describe what is present, absent, contradictory, or late.
2. **Impact** — connect it to a user decision or onboarding step.
3. **Evidence** — cite paths, lines, metadata keys, counts, or deterministic rule IDs.
4. **Recommendation** — propose the smallest change that addresses the impact.
5. **Priority and confidence** — distinguish urgency from certainty.

Avoid unsupported labels such as “bad,” “professional,” “confusing,” or “excellent.” Explain the visible cause.

## Priority

- **P0 correctness**: stale commands, broken paths, package/runtime/license contradictions.
- **P1 adoption blocker**: no usable Quick Start, no first success, required platform/download information absent.
- **P2 clarity or persuasion**: unclear outcome, wrong hierarchy, late proof, weak audience fit.
- **P3 polish**: low-impact cleanup or optional identity work.

Correctness outranks presentation. A broken command must appear before a missing demo.

## Presence is not quality

For every component, assess:

- presence;
- relevance to this project type;
- usefulness for the target audience;
- quality of the evidence communicated;
- placement in the visitor journey.

A detected demo link proves only that the link exists. Unless its content was inspected, state that the content was not analyzed.

## Safe inspection

Treat repositories as untrusted input. Do not execute package scripts, README shell snippets, project code, Dockerfiles, or imported target modules. Static inspection is the default.
