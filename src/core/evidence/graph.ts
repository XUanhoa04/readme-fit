import type {
  Claim,
  EvidenceGraph,
  ReadmeDocument,
  RepositoryEvidence,
  RepositorySnapshot,
  Verification,
} from '../../models/index.js';
import {
  pythonLicense,
  pythonPackageName,
  pythonRuntimeConstraint,
} from '../repository/python-metadata.js';
import { parseReadmeCommands } from '../claims/commands.js';
import { subset, validRange } from 'semver';
import parseSpdx from 'spdx-expression-parse';

function lineAt(raw: string, index: number): number {
  return raw.slice(0, index).split(/\r?\n/).length;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function addEvidence(
  evidence: RepositoryEvidence[],
  input: Omit<RepositoryEvidence, 'id'>,
): RepositoryEvidence {
  const item = { ...input, id: `evidence:${evidence.length + 1}` };
  evidence.push(item);
  return item;
}

function packageEvidence(repository: RepositorySnapshot, evidence: RepositoryEvidence[]) {
  const packageJson = repository.packageJson ?? {};
  const npmName = typeof packageJson.name === 'string' ? packageJson.name : undefined;
  const pythonName = pythonPackageName(repository.pyproject);
  const scripts = record(packageJson.scripts);
  const output: {
    npmName?: RepositoryEvidence;
    pythonName?: RepositoryEvidence;
    scripts: Map<string, RepositoryEvidence>;
  } = { scripts: new Map() };
  if (npmName) {
    output.npmName = addEvidence(evidence, {
      kind: 'package',
      subject: 'npm-package-name',
      value: npmName,
      source: { path: 'package.json' },
    });
  }
  if (pythonName) {
    output.pythonName = addEvidence(evidence, {
      kind: 'package',
      subject: 'python-package-name',
      value: pythonName,
      source: { path: 'pyproject.toml' },
    });
  }
  for (const script of Object.keys(scripts)) {
    output.scripts.set(
      script,
      addEvidence(evidence, {
        kind: 'command',
        subject: `package-script:${script}`,
        value: script,
        source: { path: 'package.json' },
      }),
    );
  }
  return output;
}

function addMetadataEvidence(
  repository: RepositorySnapshot,
  evidence: RepositoryEvidence[],
): void {
  const engines = record(repository.packageJson?.engines);
  if (typeof engines.node === 'string') {
    addEvidence(evidence, {
      kind: 'runtime',
      subject: 'node',
      value: engines.node,
      source: { path: 'package.json' },
    });
  }
  const python = pythonRuntimeConstraint(repository.pyproject) ?? repository.pythonVersion;
  if (python) {
    addEvidence(evidence, {
      kind: 'runtime',
      subject: 'python',
      value: python,
      source: {
        path: pythonRuntimeConstraint(repository.pyproject)
          ? 'pyproject.toml'
          : '.python-version',
      },
    });
  }
  const nodeLicense = repository.packageJson?.license;
  const license =
    typeof nodeLicense === 'string' ? nodeLicense : pythonLicense(repository.pyproject);
  if (license) {
    addEvidence(evidence, {
      kind: 'license',
      subject: 'project-license',
      value: license,
      source: {
        path: typeof nodeLicense === 'string' ? 'package.json' : 'pyproject.toml',
      },
    });
  }
}

function commandClaims(
  readme: ReadmeDocument,
  repository: RepositorySnapshot,
  claims: Claim[],
  evidence: RepositoryEvidence[],
  verifications: Verification[],
): void {
  const available = packageEvidence(repository, evidence);
  for (const command of parseReadmeCommands(readme)) {
    const subject = command.script
      ? `package-script:${command.script}`
      : command.packageTarget
        ? `package:${command.packageTarget}`
        : `command:${command.executable}`;
    const claim: Claim = {
      id: `claim:${claims.length + 1}`,
      kind: command.packageTarget ? 'package' : 'command',
      subject,
      raw: command.command,
      normalized: {
        executable: command.executable,
        args: command.args,
        kind: command.kind,
        manager: command.manager,
        script: command.script,
        packageTarget: command.packageTarget,
      },
      source: { path: readme.path, line: command.line },
      confidence: 'high',
    };
    claims.push(claim);

    if (command.script) {
      const matched = available.scripts.get(command.script);
      verifications.push({
        claimId: claim.id,
        state: matched ? 'verified' : 'contradicted',
        evidenceIds: matched
          ? [matched.id]
          : [...available.scripts.values()].map((item) => item.id),
        reasonCode: matched ? 'script-exists' : 'script-missing',
        message: matched
          ? `Package script ${command.script} exists.`
          : `Package script ${command.script} is not declared.`,
      });
      continue;
    }

    if (command.packageTarget) {
      const expected = ['pip', 'uv', 'poetry'].includes(command.manager ?? '')
        ? available.pythonName
        : available.npmName;
      verifications.push({
        claimId: claim.id,
        state: expected
          ? String(expected.value).toLowerCase() === command.packageTarget.toLowerCase()
            ? 'verified'
            : 'contradicted'
          : 'unverified',
        evidenceIds: expected ? [expected.id] : [],
        reasonCode: expected
          ? String(expected.value).toLowerCase() === command.packageTarget.toLowerCase()
            ? 'package-name-matches'
            : 'package-name-mismatch'
          : 'package-name-unavailable',
        message: expected
          ? `README target ${command.packageTarget}; repository package ${String(expected.value)}.`
          : `No comparable package name is available for ${command.packageTarget}.`,
      });
      continue;
    }

    verifications.push({
      claimId: claim.id,
      state: 'unverified',
      evidenceIds: [],
      reasonCode: 'static-execution-not-checked',
      message: 'Command execution is outside the static analysis boundary.',
    });
  }
}

function proseClaims(readme: ReadmeDocument, claims: Claim[]): void {
  for (const match of readme.raw.matchAll(
    /\b(Node(?:\.js)?|Python)\s*(?:version\s*)?(>=|>|<=|<|=|~\s*|\^\s*|v)?\s*(\d+(?:\.\d+){0,2})/gi,
  )) {
    const runtime = match[1]?.toLowerCase().startsWith('node') ? 'node' : 'python';
    claims.push({
      id: `claim:${claims.length + 1}`,
      kind: 'runtime',
      subject: runtime,
      raw: match[0],
      normalized: `${match[2]?.replace(/\s/g, '') ?? ''}${match[3] ?? ''}`,
      source: { path: readme.path, line: lineAt(readme.raw, match.index ?? 0) },
      confidence: 'high',
    });
  }
  for (const match of readme.raw.matchAll(
    /\b(MIT|Apache(?: License)?(?: 2\.0|-2\.0)?|ISC|AGPL(?:v?3|-3\.0)?|LGPL(?:v?3|-3\.0)?|GPL(?:v?3|-3\.0)?|BSD(?:-?[23]-Clause)?|MPL(?:-?2\.0)?|Unlicense|CC0(?:-1\.0)?)\b/gi,
  )) {
    claims.push({
      id: `claim:${claims.length + 1}`,
      kind: 'license',
      subject: 'project-license',
      raw: match[0],
      normalized: match[1],
      source: { path: readme.path, line: lineAt(readme.raw, match.index ?? 0) },
      confidence: 'medium',
    });
  }
}

function licenseIds(value: string): Set<string> {
  const normalize = (license: string) =>
    license
      .replace(/^Apache(?: License)?(?: 2\.0|-2\.0)?$/i, 'Apache-2.0')
      .replace(/^MPL(?:-?2\.0)?$/i, 'MPL-2.0')
      .replace(/^AGPL(?:v?3|-3\.0)?$/i, 'AGPL-3.0')
      .replace(/^LGPL(?:v?3|-3\.0)?$/i, 'LGPL-3.0')
      .replace(/^GPL(?:v?3|-3\.0)?$/i, 'GPL-3.0')
      .replace(/^CC0$/i, 'CC0-1.0')
      .toLowerCase();
  try {
    const output = new Set<string>();
    const collect = (node: ReturnType<typeof parseSpdx>): void => {
      if ('license' in node) output.add(normalize(node.license));
      else {
        collect(node.left);
        collect(node.right);
      }
    };
    collect(parseSpdx(value));
    return output;
  } catch {
    return new Set([normalize(value)]);
  }
}

function runtimeMatches(claim: Claim, value: unknown): boolean {
  if (typeof claim.normalized !== 'string' || typeof value !== 'string') return false;
  if (claim.subject === 'node') {
    const claimRange = validRange(claim.normalized.replace(/^v/, ''));
    const evidenceRange = validRange(value);
    return Boolean(claimRange && evidenceRange && subset(claimRange, evidenceRange));
  }
  const claimVersion = /\d+(?:\.\d+)?/.exec(claim.normalized)?.[0];
  const evidenceVersion = /\d+(?:\.\d+)?/.exec(value)?.[0];
  return Boolean(claimVersion && evidenceVersion && claimVersion === evidenceVersion);
}

function verifyRemainingClaims(graph: EvidenceGraph): void {
  const verified = new Set(graph.verifications.map((item) => item.claimId));
  for (const claim of graph.claims) {
    if (verified.has(claim.id)) continue;
    const candidates = graph.evidence.filter(
      (item) => item.kind === claim.kind && item.subject === claim.subject,
    );
    if (!candidates.length) {
      graph.verifications.push({
        claimId: claim.id,
        state: 'unverified',
        evidenceIds: [],
        reasonCode: 'comparable-evidence-unavailable',
        message: `No repository evidence is available for ${claim.subject}.`,
      });
      continue;
    }
    const matches = candidates.some((item) => {
      if (claim.kind === 'runtime') return runtimeMatches(claim, item.value);
      if (claim.kind === 'license') {
        const evidenceValue = item.value;
        return (
          typeof claim.normalized === 'string' &&
          typeof evidenceValue === 'string' &&
          [...licenseIds(claim.normalized)].some((license) =>
            licenseIds(evidenceValue).has(license),
          )
        );
      }
      return String(claim.normalized) === String(item.value);
    });
    graph.verifications.push({
      claimId: claim.id,
      state: matches ? 'verified' : 'contradicted',
      evidenceIds: candidates.map((item) => item.id),
      reasonCode: matches ? `${claim.kind}-matches` : `${claim.kind}-mismatch`,
      message: matches
        ? `Repository evidence supports ${claim.raw}.`
        : `Repository evidence conflicts with ${claim.raw}.`,
    });
  }
}

export function buildEvidenceGraph(
  repository: RepositorySnapshot,
  readme: ReadmeDocument,
): EvidenceGraph {
  const claims: Claim[] = [];
  const evidence: RepositoryEvidence[] = [];
  const verifications: Verification[] = [];
  commandClaims(readme, repository, claims, evidence, verifications);
  proseClaims(readme, claims);
  addMetadataEvidence(repository, evidence);
  const graph = { claims, evidence, verifications };
  verifyRemainingClaims(graph);
  return graph;
}
