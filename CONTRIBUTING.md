# Contributing to readme-fit

Thanks for helping make README review more trustworthy.

## Before opening work

- Use a bug report for deterministic contradictions or crashes.
- Use the false-positive template for a disputed finding.
- Discuss large rule, schema, scoring, or public API changes before implementation.
- Report security boundary failures privately under [SECURITY.md](SECURITY.md).

## Development

Use a supported Node.js release (22, 24, or 26) and install from the lockfile:

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run build
npm run test:package
npm run benchmark
npm run dogfood
```

Do not weaken the untrusted-repository boundary. Analysis must not run README commands, package
scripts, target code, imported target modules, containers, or Git hooks.

## Rule changes

A new or changed rule needs:

- a concrete user failure or adoption risk;
- declared project-type applicability;
- deterministic evidence or an honestly labeled heuristic;
- transparent weight, earned points, and coverage behavior;
- actionable findings for partial and failing outcomes;
- good, bad, and adversarial fixtures;
- a documented false-positive boundary.

Follow [the rule contract](docs/rule-authoring.md). Do not reward the absence of evidence, generic
images, empty headings, or hidden repository facts that the rule claims are README-visible.

## Pull requests

Keep commits scoped and explain the user-visible behavior. Update schemas, migration notes, and the
changelog when public output changes. Report test commands and platform-specific assumptions in the
PR body. Reviewers may ask for a minimal fixture rather than a broad snapshot.

All participation follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
