import type { ReadmeLink } from '../../models/index.js';
import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

export type ExternalLinkStatus = 'reachable' | 'broken' | 'unverified';

export interface ExternalLinkResult {
  url: string;
  status: ExternalLinkStatus;
  httpStatus?: number;
  reason?: string;
}

const REQUEST_TIMEOUT_MS = 5_000;

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function checkOne(url: string, fetcher: typeof fetch): Promise<ExternalLinkResult> {
  try {
    let response = await fetcher(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 405 || response.status === 501) {
      response = await fetcher(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }
    if (response.status === 401 || response.status === 403) {
      return {
        url,
        status: 'unverified',
        httpStatus: response.status,
        reason: 'the server requires authorization or blocks automated checks',
      };
    }
    if (response.ok || (response.status >= 300 && response.status < 400)) {
      return { url, status: 'reachable', httpStatus: response.status };
    }
    return {
      url,
      status: 'broken',
      httpStatus: response.status,
      reason: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      url,
      status: 'broken',
      reason: error instanceof Error ? error.message : 'network request failed',
    };
  }
}

export async function checkExternalLinks(
  urls: string[],
  fetcher: typeof fetch = fetch,
  concurrency = 5,
): Promise<ExternalLinkResult[]> {
  const unique = [...new Set(urls.filter(isExternal))];
  const results = new Array<ExternalLinkResult>(unique.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < unique.length) {
      const index = nextIndex++;
      const url = unique[index];
      if (url) results[index] = await checkOne(url, fetcher);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), unique.length) }, () =>
      worker(),
    ),
  );
  return results;
}

function firstSource(links: ReadmeLink[], url: string): ReadmeLink | undefined {
  return links.find((link) => link.url === url);
}

export const externalLinkRule: Rule = {
  id: 'correctness.external-link.reachable',
  category: 'correctness',
  description:
    'Optionally checks external HTTP links with bounded requests, redirects, and timeouts.',
  applies: () => true,
  evaluate: async ({ readme, project, config, options }) => {
    if (!options.checkLinks) {
      return {
        score: naScore(
          'correctness.external-link.reachable',
          'External URL checks require --check-links.',
        ),
        findings: [],
        facts: { externalLinksChecked: 0 },
      };
    }
    const links = readme.links.filter((link) => isExternal(link.url));
    const results = await checkExternalLinks(links.map((link) => link.url));
    const broken = results.filter((result) => result.status === 'broken');
    const unverified = results.filter((result) => result.status === 'unverified');
    const weight = ruleWeight(
      'correctness.external-link.reachable',
      project.primaryType,
      config.scoring.preset,
    );
    return {
      score: broken.length
        ? failScore(
            'correctness.external-link.reachable',
            weight,
            Math.max(0, weight - broken.length * 5),
            `${broken.length} external link(s) did not respond successfully.`,
          )
        : passScore(
            'correctness.external-link.reachable',
            weight,
            results.length
              ? `${results.length - unverified.length} external link(s) responded successfully; ${unverified.length} could not be verified.`
              : 'No external links found.',
          ),
      findings: broken.map((result) => {
        const source = firstSource(links, result.url);
        return finding({
          id: 'correctness.external-link.reachable',
          category: 'correctness',
          severity: 'high',
          priority: 'P0',
          confidence: 'medium',
          title: 'External link may be broken',
          ...(source ? { source: { path: readme.path, line: source.line } } : {}),
          observation: `\`${result.url}\` could not be verified${result.reason ? `: ${result.reason}` : '.'}`,
          impact: 'Visitors may be sent to an unavailable destination.',
          recommendation:
            'Confirm the URL manually, then update or remove it if the failure is persistent.',
          evidence: [
            {
              type: 'external-link-check',
              message: result.reason ?? 'request failed',
              path: readme.path,
              ...(source ? { line: source.line } : {}),
              value: { url: result.url, httpStatus: result.httpStatus },
            },
          ],
        });
      }),
      facts: {
        externalLinksChecked: results.length,
        brokenExternalLinks: broken.length,
        unverifiedExternalLinks: unverified.length,
      },
    };
  },
};
