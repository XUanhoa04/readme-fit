# Rule authoring

Rules are isolated functions over an `AnalysisContext`.

```ts
import { defineRule } from 'readme-fit/rules';

export const supportRule = defineRule({
  id: 'team.support.visible',
  category: 'trust',
  description: 'Checks the team support contract.',
  applies: () => true,
  evaluate: () => ({
    score: {
      id: 'team.support.visible',
      status: 'pass',
      weight: 10,
      earned: 10,
      explanation: 'Support evidence is visible.',
    },
    findings: [],
  }),
});
```

## Contract

- IDs use dotted lowercase segments and must be unique inside an Analyzer.
- `applies` must not perform I/O or mutate context.
- `evaluate` must be deterministic unless explicitly opt-in network analysis.
- `0 <= earned <= weight`; invalid values fail analysis.
- A category with no applicable evidence is `null`.
- Every actionable `partial` or `fail` needs a finding with evidence and a scoped recommendation.
- Heuristics set honest confidence and `deterministic: false`.
- A rule must not execute code from the inspected repository.

Add bad, good, and adversarial fixtures plus project-type applicability tests. Exercise the public
pack through `createAnalyzer`, not a global registry.
