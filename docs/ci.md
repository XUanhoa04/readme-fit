# CI integration

```yaml
name: README
on: [pull_request]
permissions:
  contents: read
jobs:
  readme:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: XUanhoa04/readme-fit@v1
        with:
          fail-on: high
          fail-on-score: 80
          changed-since: ${{ github.event.pull_request.base.sha }}
```

`fetch-depth: 0` ensures the base revision is available for `--changed-since`.

## SARIF upload

```yaml
- run: npx readme-fit scan --format sarif --output readme-fit.sarif
- uses: github/codeql-action/upload-sarif@v4
  with:
    sarif_file: readme-fit.sarif
```

SARIF upload needs `security-events: write`. Fork pull requests may have restricted permissions;
GitHub annotations require only normal workflow log access.

## Rollout

For a repository with debt, capture a baseline and gate only new findings. For a clean repository,
combine `--fail-on high` with `--fail-on-score`. A score gate applies to the complete current
report; changed-file mode filters finding gates and annotations.

Exit code `1` is a quality failure. Exit code `2` is an input, configuration, or analysis failure.
