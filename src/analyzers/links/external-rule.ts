import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { ReadmeLink } from '../../models/index.js';
import type { Rule } from '../../rules/types.js';
import { failScore, finding, naScore, passScore } from '../../rules/helpers.js';
import { ruleWeight } from '../../scoring/weights.js';

import { VERSION } from '../../version.js';

export type ExternalLinkStatus = 'reachable' | 'broken' | 'unverified' | 'skipped';

export interface ExternalLinkResult {
  url: string;
  status: ExternalLinkStatus;
  httpStatus?: number;
  reason?: string;
}

export interface ExternalLinkCheckOptions {
  maxLinks?: number;
  resolveHost?: (hostname: string) => Promise<string[]>;
}

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_LINKS = 100;
const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': `readme-fit/${VERSION} (+https://github.com/XUanhoa04/readme-fit)`,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

class UnsafeUrlError extends Error {}

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function blockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  const first = parts[0] ?? -1;
  const second = parts[1] ?? -1;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function blockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return blockedIpv4(normalized.slice('::ffff:'.length));
  }
  if (isIP(normalized) === 4) return blockedIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('ff')
  );
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map(
    (address) => address.address,
  );
}

async function assertSafeUrl(
  url: URL,
  resolveHost: (hostname: string) => Promise<string[]>,
): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new UnsafeUrlError(`unsupported URL protocol ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('URLs containing credentials are not checked');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new UnsafeUrlError('local-network destinations are not checked');
  }
  const addresses = isIP(hostname) ? [hostname] : await resolveHost(hostname);
  if (!addresses.length) throw new Error('DNS returned no addresses');
  if (addresses.some(blockedAddress)) {
    throw new UnsafeUrlError('private or non-routable destinations are not checked');
  }
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response may already be closed. Nothing else needs to consume it.
  }
}

async function requestFollowingRedirects(
  url: string,
  method: 'HEAD' | 'GET',
  fetcher: typeof fetch,
  resolveHost: (hostname: string) => Promise<string[]>,
): Promise<Response> {
  let current = new URL(url);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertSafeUrl(current, resolveHost);
    const response = await fetcher(current.href, {
      method,
      redirect: 'manual',
      headers: {
        ...DEFAULT_HEADERS,
        ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    await discard(response);
    if (!location) throw new Error(`redirect response ${response.status} has no location`);
    if (redirects === MAX_REDIRECTS) throw new Error('redirect limit exceeded');
    current = new URL(location, current);
  }
  throw new Error('redirect limit exceeded');
}

async function checkOne(
  url: string,
  fetcher: typeof fetch,
  resolveHost: (hostname: string) => Promise<string[]>,
): Promise<ExternalLinkResult> {
  try {
    let response = await requestFollowingRedirects(url, 'HEAD', fetcher, resolveHost);
    if (response.status === 405 || response.status === 501) {
      await discard(response);
      response = await requestFollowingRedirects(url, 'GET', fetcher, resolveHost);
    }
    const httpStatus = response.status;
    await discard(response);
    if (httpStatus === 401 || httpStatus === 403) {
      return {
        url,
        status: 'unverified',
        httpStatus,
        reason: 'the server requires authorization or blocks automated checks',
      };
    }
    if ([408, 425, 429].includes(httpStatus) || httpStatus >= 500) {
      return {
        url,
        status: 'unverified',
        httpStatus,
        reason: `transient HTTP ${httpStatus}`,
      };
    }
    if (httpStatus >= 200 && httpStatus < 400) {
      return { url, status: 'reachable', httpStatus };
    }
    return { url, status: 'broken', httpStatus, reason: `HTTP ${httpStatus}` };
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return { url, status: 'skipped', reason: error.message };
    }
    return {
      url,
      status: 'unverified',
      reason: error instanceof Error ? error.message : 'network request failed',
    };
  }
}

export async function checkExternalLinks(
  urls: string[],
  fetcher: typeof fetch = fetch,
  concurrency = 5,
  options: ExternalLinkCheckOptions = {},
): Promise<ExternalLinkResult[]> {
  const unique = [...new Set(urls.filter(isExternal))];
  const maxLinks = Math.max(0, options.maxLinks ?? DEFAULT_MAX_LINKS);
  const selected = unique.slice(0, maxLinks);
  const overflow = unique.slice(maxLinks).map((url) => ({
    url,
    status: 'skipped' as const,
    reason: `external-link limit of ${maxLinks} reached`,
  }));
  const results = new Array<ExternalLinkResult>(selected.length);
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const resolutionCache = new Map<string, Promise<string[]>>();
  const cachedResolve = (hostname: string) => {
    const existing = resolutionCache.get(hostname);
    if (existing) return existing;
    const pending = resolveHost(hostname);
    resolutionCache.set(hostname, pending);
    return pending;
  };
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < selected.length) {
      const index = nextIndex++;
      const url = selected[index];
      if (url) results[index] = await checkOne(url, fetcher, cachedResolve);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), selected.length) }, () =>
      worker(),
    ),
  );
  return [...results, ...overflow];
}

function firstSource(links: ReadmeLink[], url: string): ReadmeLink | undefined {
  return links.find((link) => link.url === url);
}

export const externalLinkRule: Rule = {
  id: 'correctness.external-link.reachable',
  category: 'correctness',
  description:
    'Optionally checks public external HTTP links with bounded requests, redirects, and timeouts.',
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
    const weight = ruleWeight(
      'correctness.external-link.reachable',
      project.primaryType,
      config.scoring.preset,
    );
    if (!links.length) {
      return {
        score: naScore(
          'correctness.external-link.reachable',
          'No external link claim was found.',
        ),
        findings: [],
        facts: { externalLinksChecked: 0 },
      };
    }
    const results = await checkExternalLinks(links.map((link) => link.url));
    const broken = results.filter((result) => result.status === 'broken');
    const unverified = results.filter((result) => result.status === 'unverified');
    const skipped = results.filter((result) => result.status === 'skipped');
    return {
      score: broken.length
        ? failScore(
            'correctness.external-link.reachable',
            weight,
            Math.max(0, weight - broken.length * 5),
            `${broken.length} external link(s) returned a persistent client error.`,
          )
        : passScore(
            'correctness.external-link.reachable',
            weight,
            results.length
              ? `${results.length - unverified.length - skipped.length} external link(s) responded successfully; ${unverified.length} unverified and ${skipped.length} skipped.`
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
          observation: `\`${result.url}\` returned a persistent failure${result.reason ? `: ${result.reason}` : '.'}`,
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
        skippedExternalLinks: skipped.length,
      },
    };
  },
};
