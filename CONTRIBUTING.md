# Contributing to readme-fit

Thanks for helping make README review more trustworthy.

## Development

Use Node.js 20 or newer.

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run dogfood
```

Add fixture-powered tests for new rules. A deterministic rule must identify its evidence,
confidence, applicability, score weight, and coverage limit. Never execute code from a repository
being inspected.

## Pull requests

Keep analyzers focused and reporters free of analysis logic. Include a fixture for correctness or
classification behavior and explain why the rule applies to each affected project type.
