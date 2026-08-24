# Configuration

`readme-fit` reads `.readme-fit.yml` or `.readme-fit.yaml`. Use exactly one.

```yaml
version: 2
project:
  type: auto
readme:
  path: README.md
scoring:
  preset: balanced
rules:
  correctness: true
  completeness: true
ignore:
  rules: []
  paths: []
```

Run `readme-fit config validate --json` to see the normalized internal model.

## Inheritance

`extends` accepts one relative local YAML path. It resolves relative to the file declaring it.
Paths and symlinks must remain inside the canonical repository root. URLs, absolute paths, cycles,
and chains deeper than eight files are rejected.

Nested mappings merge; child scalar and array values replace parent values.

## Rule groups and overrides

Group keys are `correctness`, `completeness`, `onboarding`, `clarity`, `visual_proof`,
`first_impression`, and `trust`.

```yaml
rules:
  visual_proof: false
  overrides:
    impression.proof:
      enabled: true
      weight: 30
```

Weights must be integers from 0 through 1000. A weight changes the rule's contribution while
preserving its earned ratio. Disabling a rule removes it from evaluation; it does not grant points.

## Presets

- `minimal` emphasizes first success;
- `balanced` is the general default;
- `oss` emphasizes correctness, licensing, and maintenance evidence;
- `portfolio` emphasizes positioning and visible proof.

Unknown keys and rule IDs are errors. Config v1 is migrated in memory and reported by
`config validate`; use [the migration guide](migrating-to-v1.md) to update it.
