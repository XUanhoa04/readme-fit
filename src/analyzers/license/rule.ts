import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';
import { pythonLicense } from '../../core/repository/python-metadata.js';

function detectLicense(text?: string): string | undefined {
  if (!text) return undefined;
  if (/permission is hereby granted, free of charge/i.test(text)) return 'MIT';
  if (/apache license[\s\S]{0,80}version 2\.0/i.test(text)) return 'Apache-2.0';
  if (/isc license|permission to use, copy, modify, and\/or distribute/i.test(text))
    return 'ISC';
  if (/mozilla public license[\s\S]{0,80}version 2\.0/i.test(text)) return 'MPL-2.0';
  if (/gnu affero general public license[\s\S]{0,80}version 3/i.test(text))
    return 'AGPL-3.0';
  if (/gnu lesser general public license[\s\S]{0,80}version 3/i.test(text))
    return 'LGPL-3.0';
  if (/gnu general public license[\s\S]{0,80}version 3/i.test(text)) return 'GPL-3.0';
  if (/redistribution and use in source and binary forms/i.test(text)) {
    if (/neither the name/i.test(text) || /bsd 3-clause/i.test(text)) return 'BSD-3-Clause';
    return 'BSD-2-Clause';
  }
  if (
    /this is free and unencumbered software released into the public domain/i.test(text) ||
    /unlicense/i.test(text)
  )
    return 'Unlicense';
  if (/creative commons zero|cc0 1\.0 universal/i.test(text)) return 'CC0-1.0';
  return undefined;
}

function cargoLicense(cargoToml?: string): string | undefined {
  if (!cargoToml) return undefined;
  const match = /^\s*license\s*=\s*["']([^"']+)["']/m.exec(cargoToml);
  return match?.[1];
}

function normalizeLicense(claim: string): string {
  const upper = claim.toUpperCase();
  if (upper.startsWith('APACHE')) return 'Apache-2.0';
  if (upper.startsWith('AGPL')) return 'AGPL-3.0';
  if (upper.startsWith('LGPL')) return 'LGPL-3.0';
  if (upper.startsWith('GPL')) return 'GPL-3.0';
  if (upper.startsWith('BSD-3') || upper === 'BSD 3-CLAUSE') return 'BSD-3-Clause';
  if (upper.startsWith('BSD-2') || upper === 'BSD 2-CLAUSE' || upper === 'BSD')
    return 'BSD-2-Clause';
  if (upper === 'MPL-2.0' || upper === 'MPL 2.0') return 'MPL-2.0';
  if (upper === 'CC0' || upper === 'CC0-1.0') return 'CC0-1.0';
  if (upper === 'UNLICENSE') return 'Unlicense';
  return claim.toUpperCase();
}

export const licenseRule: Rule = {
  id: 'correctness.license.matches',
  category: 'correctness',
  description:
    'Compares recognizable README license claims with a confidently detected local license.',
  applies: () => true,
  evaluate: ({ repository, readme, project, config }) => {
    const weight = ruleWeight(
      'correctness.license.matches',
      project.primaryType,
      config.scoring.preset,
    );
    const fileLicense = detectLicense(repository.licenseText);
    const nodeLicense =
      typeof repository.packageJson?.license === 'string'
        ? repository.packageJson.license
        : undefined;
    const pyLicense = pythonLicense(repository.pyproject);
    const rustLicense = cargoLicense(repository.cargoToml);
    const metadataLicense = nodeLicense ?? pyLicense ?? rustLicense;
    const metadataPath = nodeLicense
      ? 'package.json'
      : pyLicense
        ? 'pyproject.toml'
        : rustLicense
          ? 'Cargo.toml'
          : 'package.json';

    const detected = fileLicense ?? metadataLicense;
    const match = readme.raw.match(
      /\b(MIT|Apache(?: License)?(?: 2\.0|-2\.0)?|ISC|AGPL(?:v?3|-3\.0)?|LGPL(?:v?3|-3\.0)?|GPL(?:v?3|-3\.0)?|BSD(?:-?[23]-Clause)?|MPL(?:-?2\.0)?|Unlicense|CC0(?:-1\.0)?)\b/i,
    );
    if (!match?.[1] || !detected)
      return {
        score: naScore(
          'correctness.license.matches',
          'License claim or confident local detection is unavailable.',
        ),
        findings: [],
        facts: { detectedLicense: detected ?? 'unverified' },
      };
    const normalized = normalizeLicense(match[1]);
    if (normalized.toLowerCase() === detected.toLowerCase())
      return {
        score: passScore(
          'correctness.license.matches',
          weight,
          'README license matches local evidence.',
        ),
        findings: [],
        facts: { detectedLicense: detected },
      };
    const line = readme.raw.slice(0, match.index).split(/\r?\n/).length;
    return {
      score: failScore(
        'correctness.license.matches',
        weight,
        0,
        'README license differs from local evidence.',
      ),
      findings: [
        finding({
          id: 'correctness.license.matches',
          category: 'correctness',
          severity: 'critical',
          priority: 'P0',
          title: 'License claim conflicts with repository',
          source: { path: readme.path, line },
          observation: `The README claims ${normalized}, while local metadata indicates ${detected}.`,
          impact: 'Conflicting license information creates legal uncertainty for adopters.',
          recommendation:
            'Confirm the intended license and make README, package metadata, and LICENSE agree.',
          evidence: [
            { type: 'readme-license', message: normalized, path: readme.path, line },
            {
              type: 'license-file',
              message: detected,
              path: fileLicense ? 'LICENSE' : metadataPath,
            },
          ],
        }),
      ],
      facts: { detectedLicense: detected },
    };
  },
};
