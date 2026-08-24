# Reporting false positives

Include:

1. `readme-fit --version` and the exact command;
2. the rule ID from `readme-fit explain <id>`;
3. project type and `rubricStatus` from JSON;
4. the smallest README and manifest that reproduce the result;
5. expected evidence and actual evidence;
6. whether config, baseline, `--project`, or `--readme` was used.

Remove secrets and private URLs. Do not attach a complete private repository. If the report involves
SSRF, path traversal, command execution, or another security boundary, use the private process in
[SECURITY.md](../SECURITY.md), not a public issue.

Before filing, run `readme-fit doctor`, `readme-fit config validate`, and the latest compatible
release. Experimental rubrics may be less calibrated, but deterministic contradictions remain bugs.
