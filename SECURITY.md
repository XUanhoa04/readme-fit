# Security policy

## Supported versions

| Version | Supported                                     |
| ------- | --------------------------------------------- |
| 1.x     | Yes                                           |
| 0.2.x   | Critical fixes during the v1 migration window |
| Older   | No                                            |

## Reporting

Report vulnerabilities privately through GitHub Security Advisories for this repository. Include a
minimal reproduction, affected version, impact, and whether the issue crosses a filesystem,
network, or execution boundary. Do not open a public issue before a fix is available.

The project will acknowledge a complete report as soon as maintainers are available, validate the
affected versions, coordinate a fix and advisory, and credit reporters who want attribution. No
specific response time is guaranteed.

## Security invariants

`readme-fit` treats inspected repositories as untrusted. Default analysis must not:

- execute README commands, package scripts, Git hooks, project code, or containers;
- import modules from the target repository;
- read configured README or extended config targets outside the canonical root;
- contact the network without explicit `--check-links` consent;
- follow requests to loopback, private, link-local, or cloud metadata destinations.

Resource bounds and redirect validation are security controls, not performance hints. Changes that
weaken them require an explicit security review.
