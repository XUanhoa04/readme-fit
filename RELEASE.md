# Release process

Releases are tag-driven, reproducible from the lockfile, and published to npm by GitHub Actions
through OpenID Connect. Maintainers do not put a long-lived npm token in repository secrets.

## One-time npm setup

Before publishing the first release, configure a trusted publisher for the `readme-fit` package on
npm with these exact values:

- organization or user: `XUanhoa04`;
- repository: `readme-fit`;
- workflow filename: `release.yml`;
- environment: leave blank unless the workflow is changed to use the same protected environment;
- allowed action: `npm publish`.

The package must remain public and `package.json#repository.url` must continue to identify the same
public GitHub repository. Protect the default branch and release tags in GitHub. Require review for
workflow, schema, security-boundary, and ownership changes.

After the first OIDC publish is verified, set npm publishing access to require two-factor
authentication and disallow tokens, then revoke obsolete automation tokens.

## Prepare

1. Start from a clean, up-to-date default branch.
2. Set the package version and lockfile version together.
3. Move release notes out of `Unreleased` into a dated version section.
4. Confirm migration notes for every breaking CLI, API, config, report, baseline, runtime, or score
   change.
5. Run the complete local gate:

   ```bash
   npm ci
   npm run typecheck
   npm run lint
   npm run format:check
   npm run test:coverage
   npm run test:package
   npm run benchmark
   npm run dogfood
   npm audit --audit-level=high
   npm run release:check
   ```

`release:check` rejects version drift, a missing changelog entry, an inconsistent major action
reference, missing tarball files, invalid schemas, an invalid CycloneDX SBOM, and a tag/version
mismatch when `README_FIT_RELEASE_TAG` is set.

## Publish

1. Merge the prepared release commit after CI and security checks pass.
2. Create an annotated `vX.Y.Z` tag at that commit and push the tag.
3. Draft a GitHub release from that tag using the matching changelog section.
4. Publish the GitHub release. Prereleases are intentionally not sent to npm.

Publishing the GitHub release runs `.github/workflows/release.yml` on Node.js 24 with an
OIDC-capable npm CLI. It repeats the full gate, validates dependency signatures, uploads the
CycloneDX SBOM, then publishes with npm provenance. There is no manual `npm publish` fallback in
the normal process.

## Verify and recover

After the workflow succeeds:

- verify the version and provenance badge on npm;
- install the exact version into an empty project and run `readme-fit --version`;
- move the maintained GitHub Action major tag (for example `v1`) to the verified release commit;
- confirm the README action example resolves successfully.

Do not overwrite an npm version or silently move a release tag. If a published version is broken,
deprecate it with a reason, restore the invariant on a new patch branch, repeat every gate, and
publish a new patch version. Use npm unpublish only when policy and incident severity require it.
