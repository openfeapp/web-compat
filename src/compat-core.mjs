import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const COMPAT_CONFIG_SCHEMA_URL = 'https://raw.githubusercontent.com/openfeapp/web-compat/main/schemas/compat.config.v1.schema.json';

export const DEFAULT_SELECTOR = Object.freeze({
  prefix: null,
  alternative_name: null,
  allow_flags: false,
  allow_partial_implementation: false,
});

export async function readJsonFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

export async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function nowIso() {
  return new Date().toISOString();
}

export function generateConfig({ targets, includeSchema = true } = {}) {
  const config = {
    format: 'compat-config/v1',
    targets: { ...(targets ?? {}) },
  };

  if (Object.keys(config.targets).length === 0) {
    throw new Error('generateConfig requires at least one browser target.');
  }

  if (includeSchema) {
    config.$schema = COMPAT_CONFIG_SCHEMA_URL;
  }

  return config;
}

export function normalizeSelector(selector) {
  return {
    prefix: selector?.prefix ?? null,
    alternative_name: selector?.alternative_name ?? null,
    allow_flags: Boolean(selector?.allow_flags),
    allow_partial_implementation: Boolean(selector?.allow_partial_implementation),
  };
}

export function makeBcdRef(key) {
  return `bcd:${key}`;
}

export function makeManualRef(id) {
  return `manual:${id}`;
}

export function ensureArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function normalizeSpecUrls(value) {
  return ensureArray(value).filter((item) => typeof item === 'string' && item.length > 0);
}

export async function loadBcd(sourcePath) {
  if (sourcePath) {
    return readJsonFile(sourcePath);
  }

  try {
    const mod = require('@mdn/browser-compat-data');
    return mod.default ?? mod;
  } catch (error) {
    throw new Error('No BCD source provided. Pass --bcd <file> or install @mdn/browser-compat-data.');
  }
}

export function getCompatEntryByKey(bcd, compatKey) {
  if (!bcd || typeof bcd !== 'object') {
    return null;
  }

  const segments = compatKey.split('.');
  let cursor = bcd;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object' || !(segment in cursor)) {
      return null;
    }
    cursor = cursor[segment];
  }

  if (!cursor || typeof cursor !== 'object' || !cursor.__compat) {
    return null;
  }

  return cursor.__compat;
}

function normalizeVersionTokenPart(part) {
  const match = String(part).match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function compareNumericVersionStrings(a, b) {
  const aa = String(a).replace(/^≤/, '').split('.');
  const bb = String(b).replace(/^≤/, '').split('.');
  const len = Math.max(aa.length, bb.length);

  for (let index = 0; index < len; index += 1) {
    const leftRaw = aa[index] ?? '0';
    const rightRaw = bb[index] ?? '0';
    const left = normalizeVersionTokenPart(leftRaw);
    const right = normalizeVersionTokenPart(rightRaw);

    if (left !== null && right !== null) {
      if (left < right) return -1;
      if (left > right) return 1;
      continue;
    }

    const lexical = String(leftRaw).localeCompare(String(rightRaw), undefined, { numeric: true, sensitivity: 'base' });
    if (lexical !== 0) {
      return lexical;
    }
  }

  return 0;
}

const releaseOrderCache = new WeakMap();

function getBrowserReleaseOrder(bcd, browser) {
  if (!bcd || !bcd.browsers || !bcd.browsers[browser] || !bcd.browsers[browser].releases) {
    return { orderedVersions: [], rank: new Map() };
  }

  let browserCache = releaseOrderCache.get(bcd);
  if (!browserCache) {
    browserCache = new Map();
    releaseOrderCache.set(bcd, browserCache);
  }

  if (browserCache.has(browser)) {
    return browserCache.get(browser);
  }

  const releases = bcd.browsers[browser].releases;
  const entries = Object.entries(releases);
  entries.sort((left, right) => {
    const leftDate = left[1]?.release_date ?? '';
    const rightDate = right[1]?.release_date ?? '';
    if (leftDate && rightDate && leftDate !== rightDate) {
      return leftDate < rightDate ? -1 : 1;
    }
    return compareNumericVersionStrings(left[0], right[0]);
  });

  const orderedVersions = entries.map(([version]) => version);
  const rank = new Map(orderedVersions.map((version, index) => [version, index]));
  const result = { orderedVersions, rank };
  browserCache.set(browser, result);
  return result;
}

export function compareVersions(bcd, browser, a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;

  const cleanA = String(a).replace(/^≤/, '');
  const cleanB = String(b).replace(/^≤/, '');
  const { rank } = getBrowserReleaseOrder(bcd, browser);

  if (rank.has(cleanA) && rank.has(cleanB)) {
    return rank.get(cleanA) - rank.get(cleanB);
  }

  return compareNumericVersionStrings(cleanA, cleanB);
}

export function maxVersion(bcd, browser, versions) {
  const filtered = versions.filter((value) => value !== null && value !== undefined);
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((best, current) => {
    if (best === null) return current;
    return compareVersions(bcd, browser, current, best) > 0 ? current : best;
  }, null);
}

export function getReleaseDate(bcd, browser, version) {
  if (version === null || version === undefined) {
    return null;
  }

  const cleanVersion = String(version).replace(/^≤/, '');
  return bcd?.browsers?.[browser]?.releases?.[cleanVersion]?.release_date ?? null;
}

export function getPreviousReleaseVersion(bcd, browser, version) {
  const cleanVersion = String(version).replace(/^≤/, '');
  const { orderedVersions, rank } = getBrowserReleaseOrder(bcd, browser);
  if (!rank.has(cleanVersion)) {
    return null;
  }
  const index = rank.get(cleanVersion);
  if (index <= 0) {
    return null;
  }
  return orderedVersions[index - 1] ?? null;
}

export function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function dedupeArrayByStableHash(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const hash = stableHash(item);
    if (!seen.has(hash)) {
      seen.add(hash);
      result.push(item);
    }
  }
  return result;
}

export function aggregateFindings(findings) {
  const groups = new Map();

  for (const finding of findings ?? []) {
    if (!finding || finding.kind !== 'bcd' || !finding.key) {
      continue;
    }

    const selector = normalizeSelector(finding.selector);
    const groupKey = stableHash({ ref: makeBcdRef(finding.key), selector });
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        kind: 'bcd',
        ref: makeBcdRef(finding.key),
        key: finding.key,
        selector,
        evidence: [],
      };
      groups.set(groupKey, group);
    }

    group.evidence.push(...ensureArray(finding.evidence));
  }

  const aggregated = [...groups.values()].map((item) => ({
    ...item,
    evidence: dedupeArrayByStableHash(item.evidence),
  }));

  aggregated.sort((left, right) => left.ref.localeCompare(right.ref));
  return aggregated;
}

function statementMatchesSelector(statement, selector) {
  const normalized = normalizeSelector(selector);

  const prefix = Object.prototype.hasOwnProperty.call(statement, 'prefix') ? statement.prefix : null;
  const alternativeName = Object.prototype.hasOwnProperty.call(statement, 'alternative_name')
    ? statement.alternative_name
    : null;

  if (normalized.prefix !== prefix) {
    return false;
  }

  if (normalized.alternative_name !== alternativeName) {
    return false;
  }

  if (!normalized.allow_flags && Array.isArray(statement.flags) && statement.flags.length > 0) {
    return false;
  }

  if (!normalized.allow_partial_implementation && statement.partial_implementation === true) {
    return false;
  }

  return true;
}

function resolveMirroredSupportStatement(compat, bcd, browser, selector, seen = new Set()) {
  if (seen.has(browser)) {
    return null;
  }
  seen.add(browser);

  const support = compat?.support?.[browser];
  if (support === undefined) {
    return null;
  }

  if (support === 'mirror') {
    const upstream = bcd?.browsers?.[browser]?.upstream;
    if (!upstream) {
      return null;
    }
    return resolveMirroredSupportStatement(compat, bcd, upstream, selector, seen);
  }

  const statements = Array.isArray(support) ? support : [support];
  for (const statement of statements) {
    if (statementMatchesSelector(statement, selector)) {
      return structuredClone(statement);
    }
  }

  return null;
}

export function resolveBcdRequirement(requirement, browser, bcd) {
  const compat = getCompatEntryByKey(bcd, requirement.key);
  if (!compat) {
    return {
      state: 'unknown',
      reason: 'dataset-missing',
      from: null,
      release_date: null,
      removed_in: null,
      removed_release_date: null,
      last_supported: null,
      monotonic: true,
      statement: null,
    };
  }

  const statement = resolveMirroredSupportStatement(compat, bcd, browser, requirement.selector);
  if (!statement) {
    return {
      state: 'unknown',
      reason: 'no-matching-statement',
      from: null,
      release_date: null,
      removed_in: null,
      removed_release_date: null,
      last_supported: null,
      monotonic: true,
      statement: null,
    };
  }

  const removedIn = typeof statement.version_removed === 'string' ? statement.version_removed.replace(/^≤/, '') : null;
  const monotonic = statement.version_removed === undefined || statement.version_removed === null;
  const lastSupported = statement.version_last
    ?? (removedIn ? getPreviousReleaseVersion(bcd, browser, removedIn) : null);

  const base = {
    reason: null,
    from: null,
    release_date: null,
    removed_in: removedIn,
    removed_release_date: getReleaseDate(bcd, browser, removedIn),
    last_supported: lastSupported,
    monotonic,
    statement,
  };

  const versionAdded = statement.version_added;
  if (versionAdded === false) {
    return { ...base, state: 'unsupported', reason: 'version_added_false' };
  }
  if (versionAdded === true) {
    return { ...base, state: 'unknown', reason: 'version_added_true' };
  }
  if (versionAdded === null || versionAdded === undefined) {
    return { ...base, state: 'unknown', reason: 'version_added_null' };
  }
  if (versionAdded === 'preview') {
    return { ...base, state: 'unknown', reason: 'preview' };
  }
  if (typeof versionAdded === 'string' && versionAdded.startsWith('≤')) {
    const from = versionAdded.slice(1);
    return {
      ...base,
      state: 'conservative',
      from,
      release_date: getReleaseDate(bcd, browser, from),
    };
  }
  if (typeof versionAdded === 'string') {
    const from = versionAdded;
    return {
      ...base,
      state: 'exact',
      from,
      release_date: getReleaseDate(bcd, browser, from),
    };
  }

  return { ...base, state: 'unknown', reason: 'unrecognized-version-added' };
}

function buildBcdRequirementLockEntry(requirement, config, bcd) {
  const compat = getCompatEntryByKey(bcd, requirement.key);
  const entry = {
    kind: 'bcd',
    ref: requirement.ref,
    key: requirement.key,
    selector: normalizeSelector(requirement.selector),
    evidence: dedupeArrayByStableHash(requirement.evidence ?? []),
    resolved: {},
  };

  if (compat) {
    const spec = normalizeSpecUrls(compat.spec_url);
    if (spec.length > 0) {
      entry.spec = spec;
    }
  }

  for (const browser of Object.keys(config.targets ?? {})) {
    entry.resolved[browser] = resolveBcdRequirement(requirement, browser, bcd);
  }

  return entry;
}

function buildManualRequirementLockEntry(manualRequirement, config) {
  const entry = {
    kind: 'manual',
    ref: makeManualRef(manualRequirement.id),
    id: manualRequirement.id,
    title: manualRequirement.title,
    reason: manualRequirement.reason,
    targets: { ...(manualRequirement.targets ?? {}) },
    source: ensureArray(manualRequirement.source),
    resolved: {},
  };

  for (const browser of Object.keys(config.targets ?? {})) {
    const from = manualRequirement.targets?.[browser] ?? null;
    if (from) {
      entry.resolved[browser] = {
        state: 'exact',
        reason: 'manual',
        from,
        release_date: null,
        removed_in: null,
        removed_release_date: null,
        last_supported: null,
        monotonic: true,
        statement: {
          version_added: from,
          manual: true,
        },
      };
    } else {
      entry.resolved[browser] = {
        state: 'unknown',
        reason: 'manual-target-omitted',
        from: null,
        release_date: null,
        removed_in: null,
        removed_release_date: null,
        last_supported: null,
        monotonic: true,
        statement: null,
      };
    }
  }

  return entry;
}

function summarizeBrowser(requirements, browser, declaredSupportFloor, bcd) {
  const perRequirement = requirements.map((requirement) => ({
    ref: requirement.ref,
    ...(requirement.resolved?.[browser] ?? {
      state: 'unknown',
      reason: 'missing-browser-entry',
      from: null,
      release_date: null,
      removed_in: null,
      removed_release_date: null,
      last_supported: null,
      monotonic: true,
      statement: null,
    }),
  }));

  const unsupported = perRequirement.filter((item) => item.state === 'unsupported');
  const unknown = perRequirement.filter((item) => item.state === 'unknown');
  const conservative = perRequirement.filter((item) => item.state === 'conservative');
  const knownFloors = perRequirement.map((item) => item.from).filter(Boolean);
  const knownFloor = maxVersion(bcd, browser, knownFloors);
  const monotonic = perRequirement.every((item) => item.monotonic !== false);

  let state;
  let derivedTechnicalFloor = null;
  let compatibleWithDeclaredFloor = null;
  let blockingRequirements = [];

  if (unsupported.length > 0) {
    state = 'unsatisfied';
    compatibleWithDeclaredFloor = false;
    blockingRequirements = unsupported.map((item) => item.ref).sort();
  } else if (unknown.length > 0) {
    state = 'unresolved';
    blockingRequirements = unknown.map((item) => item.ref).sort();
  } else if (conservative.length > 0) {
    state = 'conservative';
    derivedTechnicalFloor = knownFloor;
    if (declaredSupportFloor && derivedTechnicalFloor) {
      compatibleWithDeclaredFloor = compareVersions(bcd, browser, derivedTechnicalFloor, declaredSupportFloor) <= 0
        ? true
        : null;
    }
    blockingRequirements = perRequirement
      .filter((item) => item.from && item.from === derivedTechnicalFloor)
      .map((item) => item.ref)
      .sort();
  } else {
    state = 'exact';
    derivedTechnicalFloor = knownFloor;
    if (declaredSupportFloor) {
      compatibleWithDeclaredFloor = derivedTechnicalFloor === null
        ? true
        : compareVersions(bcd, browser, derivedTechnicalFloor, declaredSupportFloor) <= 0;
    }
    blockingRequirements = perRequirement
      .filter((item) => item.from && item.from === derivedTechnicalFloor)
      .map((item) => item.ref)
      .sort();
  }

  return {
    state,
    declared_support_floor: declaredSupportFloor ?? null,
    derived_technical_floor: derivedTechnicalFloor,
    known_floor: knownFloor,
    compatible_with_declared_floor: compatibleWithDeclaredFloor,
    monotonic,
    blocking_requirements: blockingRequirements,
    requirements: perRequirement,
  };
}

export function summarizeLock(requirements, targets, bcd) {
  const byBrowser = {};
  for (const [browser, declaredSupportFloor] of Object.entries(targets ?? {})) {
    byBrowser[browser] = summarizeBrowser(requirements, browser, declaredSupportFloor, bcd);
  }
  return { by_browser: byBrowser };
}

export function inferDatasetMeta(dataset) {
  return {
    version: dataset?.__meta?.version ?? dataset?.version ?? null,
    timestamp: dataset?.__meta?.timestamp ?? dataset?.timestamp ?? null,
  };
}

export function generateLock({ config, findings, bcd }) {
  const aggregatedFindings = aggregateFindings(findings?.findings ?? findings ?? []);
  const requirements = [];

  for (const requirement of aggregatedFindings) {
    requirements.push(buildBcdRequirementLockEntry(requirement, config, bcd));
  }

  for (const manualRequirement of ensureArray(config.manual_requirements)) {
    requirements.push(buildManualRequirementLockEntry(manualRequirement, config));
  }

  requirements.sort((left, right) => left.ref.localeCompare(right.ref));

  return {
    format: 'compat-lock/v1',
    generated_at: nowIso(),
    tool: {
      generator: 'compat-generate-lock/1.0.0',
      scanner: findings?.tool?.scanner ?? null,
      registry: findings?.tool?.registry ?? null,
      datasets: {
        bcd: inferDatasetMeta(bcd),
      },
    },
    targets: { ...(config.targets ?? {}) },
    requirements,
    summary: summarizeLock(requirements, config.targets ?? {}, bcd),
  };
}

export function resolveLockForBrowser(lock, browser, mode, bcd = null) {
  const requirements = [];

  for (const requirement of lock.requirements ?? []) {
    if (mode === 'recompute' && requirement.kind === 'bcd') {
      if (!bcd) {
        throw new Error('Recompute mode requires BCD data.');
      }
      const recomputed = resolveBcdRequirement(requirement, browser, bcd);
      requirements.push({ ref: requirement.ref, ...recomputed });
      continue;
    }

    const replayed = requirement.resolved?.[browser] ?? {
      state: 'unknown',
      reason: 'missing-browser-entry',
      from: null,
      release_date: null,
      removed_in: null,
      removed_release_date: null,
      last_supported: null,
      monotonic: true,
      statement: null,
    };
    requirements.push({ ref: requirement.ref, ...replayed });
  }

  const summary = summarizeBrowser(
    lock.requirements ?? [],
    browser,
    lock.targets?.[browser] ?? null,
    bcd ?? {
      browsers: {},
    },
  );

  if (mode === 'recompute' && bcd) {
    const fakeRequirements = (lock.requirements ?? []).map((requirement) => ({
      ref: requirement.ref,
      resolved: {
        [browser]: requirements.find((item) => item.ref === requirement.ref),
      },
    }));
    Object.assign(summary, summarizeBrowser(fakeRequirements, browser, lock.targets?.[browser] ?? null, bcd));
  }

  return {
    format: 'compat-resolution/v1',
    browser,
    mode,
    state: summary.state,
    declared_support_floor: summary.declared_support_floor,
    derived_technical_floor: summary.derived_technical_floor,
    known_floor: summary.known_floor,
    compatible_with_declared_floor: summary.compatible_with_declared_floor,
    monotonic: summary.monotonic,
    blocking_requirements: summary.blocking_requirements,
    requirements,
  };
}
