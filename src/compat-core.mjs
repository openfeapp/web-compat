import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

export const COMPAT_REQUIREMENTS_SCHEMA_URL = 'https://raw.githubusercontent.com/openfeapp/web-compat/main/schemas/compat.requirements.v1.schema.json';
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

export function normalizeStringArray(value) {
  return ensureArray(value).filter((item) => typeof item === 'string' && item.length > 0);
}

export function normalizeSpecUrls(value) {
  return normalizeStringArray(value);
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

function normalizeVersionMap(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object mapping browser names to versions.`);
  }

  const result = {};
  for (const [browser, version] of Object.entries(value)) {
    const normalizedBrowser = String(browser ?? '').trim();
    const normalizedVersion = String(version ?? '').trim();
    if (!normalizedBrowser || !normalizedVersion) {
      throw new Error(`${label} entries must use non-empty browser names and versions.`);
    }
    result[normalizedBrowser] = normalizedVersion;
  }

  return result;
}

export function parseCommaSeparatedList(rawValue) {
  if (!rawValue) {
    return [];
  }

  return String(rawValue)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEvidenceList(evidence) {
  return ensureArray(evidence)
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ ...item }));
}

function normalizeBcdRequirementEntry(entry, { source, index }) {
  const refValue = typeof entry.ref === 'string' ? entry.ref.trim() : null;
  const keyValue = typeof entry.key === 'string' ? entry.key.trim() : null;
  const key = keyValue ?? (refValue?.startsWith('bcd:') ? refValue.slice(4) : null);
  if (!key) {
    throw new Error(`${source} requirements[${index}] must declare a BCD key.`);
  }

  const ref = refValue ?? makeBcdRef(key);
  if (ref !== makeBcdRef(key)) {
    throw new Error(`${source} requirements[${index}] ref must match key ${makeBcdRef(key)}.`);
  }

  return {
    kind: 'bcd',
    ref,
    key,
    selector: normalizeSelector(entry.selector),
    evidence: normalizeEvidenceList(entry.evidence),
  };
}

function normalizeManualRequirementEntry(entry, { source, index }) {
  const refValue = typeof entry.ref === 'string' ? entry.ref.trim() : null;
  const idValue = typeof entry.id === 'string' ? entry.id.trim() : null;
  const id = idValue ?? (refValue?.startsWith('manual:') ? refValue.slice(7) : null);
  if (!id) {
    throw new Error(`${source} requirements[${index}] manual entries must declare an id.`);
  }

  const ref = refValue ?? makeManualRef(id);
  if (ref !== makeManualRef(id)) {
    throw new Error(`${source} requirements[${index}] ref must match id ${makeManualRef(id)}.`);
  }

  const support = normalizeVersionMap(entry.support ?? {}, `${source} requirements[${index}] support`);
  if (Object.keys(support).length === 0) {
    throw new Error(`${source} requirements[${index}] support must contain at least one browser version.`);
  }

  return {
    kind: 'manual',
    ref,
    id,
    title: typeof entry.title === 'string' ? entry.title : undefined,
    reason: typeof entry.reason === 'string' ? entry.reason : undefined,
    support,
    source: normalizeStringArray(entry.source),
  };
}

function normalizeRequirementEntry(entry, context) {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) {
      throw new Error(`${context.source} requirements[${context.index}] string shorthand must be non-empty.`);
    }
    if (trimmed.startsWith('bcd:')) {
      return {
        kind: 'bcd',
        ref: trimmed,
        key: trimmed.slice(4),
        selector: { ...DEFAULT_SELECTOR },
        evidence: [],
      };
    }
    throw new Error(`${context.source} requirements[${context.index}] string shorthand must use an explicit supported ref like bcd:api.IDBFactory.open.`);
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${context.source} requirements[${context.index}] must be an object or explicit ref string.`);
  }

  if (entry.kind === 'bcd') {
    return normalizeBcdRequirementEntry(entry, context);
  }

  if (entry.kind === 'manual') {
    return normalizeManualRequirementEntry(entry, context);
  }

  throw new Error(`${context.source} requirements[${context.index}] has unsupported kind ${JSON.stringify(entry.kind)}.`);
}

function mergeManualRequirement(existing, next) {
  const existingShape = stableHash({
    kind: existing.kind,
    ref: existing.ref,
    id: existing.id,
    title: existing.title ?? null,
    reason: existing.reason ?? null,
    support: existing.support,
  });
  const nextShape = stableHash({
    kind: next.kind,
    ref: next.ref,
    id: next.id,
    title: next.title ?? null,
    reason: next.reason ?? null,
    support: next.support,
  });

  if (existingShape !== nextShape) {
    throw new Error(`Conflicting manual requirement definitions for ${existing.ref}.`);
  }

  existing.source = dedupeArrayByStableHash([...existing.source, ...next.source]);
}

export function mergeRequirements(requirements) {
  const groups = new Map();

  for (const requirement of requirements ?? []) {
    if (!requirement || typeof requirement !== 'object') {
      continue;
    }

    if (requirement.kind === 'bcd' && requirement.key) {
      const selector = normalizeSelector(requirement.selector);
      const groupKey = stableHash({ kind: 'bcd', ref: makeBcdRef(requirement.key), selector });
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          kind: 'bcd',
          ref: makeBcdRef(requirement.key),
          key: requirement.key,
          selector,
          evidence: [],
        };
        groups.set(groupKey, group);
      }
      group.evidence.push(...normalizeEvidenceList(requirement.evidence));
      continue;
    }

    if (requirement.kind === 'manual' && requirement.id) {
      const ref = makeManualRef(requirement.id);
      const groupKey = stableHash({ kind: 'manual', ref });
      let group = groups.get(groupKey);
      const normalized = {
        kind: 'manual',
        ref,
        id: requirement.id,
        title: requirement.title,
        reason: requirement.reason,
        support: normalizeVersionMap(requirement.support ?? {}, `${ref} support`),
        source: normalizeStringArray(requirement.source),
      };
      if (!group) {
        groups.set(groupKey, normalized);
      } else {
        mergeManualRequirement(group, normalized);
      }
    }
  }

  const merged = [...groups.values()].map((requirement) => {
    if (requirement.kind === 'bcd') {
      return {
        ...requirement,
        evidence: dedupeArrayByStableHash(requirement.evidence),
      };
    }
    return {
      ...requirement,
      source: dedupeArrayByStableHash(requirement.source),
    };
  });

  merged.sort((left, right) => left.ref.localeCompare(right.ref));
  return merged;
}

export function normalizeRequirementsArtifact(input, { source = '<input>' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${source} must be a compat-requirements/v1 object.`);
  }

  if (input.format !== 'compat-requirements/v1') {
    throw new Error(`${source} must declare format "compat-requirements/v1".`);
  }

  if (!Array.isArray(input.requirements)) {
    throw new Error(`${source} must contain a requirements array.`);
  }

  return mergeRequirements(
    input.requirements.map((entry, index) => normalizeRequirementEntry(entry, { source, index })),
  );
}

export function normalizeRequirementsInput(input, { source = '<input>' } = {}) {
  if (input === null || input === undefined) {
    return [];
  }

  if (Array.isArray(input)) {
    return mergeRequirements(
      input.map((entry, index) => normalizeRequirementEntry(entry, { source, index })),
    );
  }

  if (typeof input === 'object' && !Array.isArray(input)) {
    return normalizeRequirementsArtifact(input, { source });
  }

  throw new Error(`${source} must be a compat-requirements/v1 document or an array of requirement entries.`);
}

export async function loadRequirementsFile(filePath) {
  const document = await readJsonFile(filePath);
  return normalizeRequirementsArtifact(document, { source: filePath });
}

export async function loadRequirementsFiles(filePaths) {
  const loaded = [];
  for (const filePath of filePaths) {
    loaded.push(...await loadRequirementsFile(filePath));
  }
  return mergeRequirements(loaded);
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

    group.evidence.push(...normalizeEvidenceList(finding.evidence));
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

function resolveManualRequirement(requirement, browser) {
  const rawValue = requirement.support?.[browser] ?? null;
  if (!rawValue) {
    return {
      state: 'unknown',
      reason: 'manual-support-omitted',
      from: null,
      release_date: null,
      removed_in: null,
      removed_release_date: null,
      last_supported: null,
      monotonic: true,
      statement: null,
    };
  }

  const versionAdded = String(rawValue);
  const from = versionAdded.startsWith('≤') ? versionAdded.slice(1) : versionAdded;
  return {
    state: versionAdded.startsWith('≤') ? 'conservative' : 'exact',
    reason: 'manual',
    from,
    release_date: null,
    removed_in: null,
    removed_release_date: null,
    last_supported: null,
    monotonic: true,
    statement: {
      version_added: versionAdded,
      manual: true,
    },
  };
}

function resolveRequirement(requirement, browser, bcd) {
  if (requirement.kind === 'manual') {
    return resolveManualRequirement(requirement, browser);
  }
  return resolveBcdRequirement(requirement, browser, bcd);
}

function buildBcdRequirementLockEntry(requirement, browsers, bcd) {
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

  for (const browser of browsers) {
    entry.resolved[browser] = resolveBcdRequirement(requirement, browser, bcd);
  }

  return entry;
}

function buildManualRequirementLockEntry(requirement, browsers) {
  const entry = {
    kind: 'manual',
    ref: requirement.ref,
    id: requirement.id,
    title: requirement.title,
    reason: requirement.reason,
    support: { ...requirement.support },
    source: normalizeStringArray(requirement.source),
    resolved: {},
  };

  for (const browser of browsers) {
    entry.resolved[browser] = resolveManualRequirement(requirement, browser);
  }

  return entry;
}

function buildRequirementLockEntry(requirement, browsers, bcd) {
  if (requirement.kind === 'manual') {
    return buildManualRequirementLockEntry(requirement, browsers);
  }
  return buildBcdRequirementLockEntry(requirement, browsers, bcd);
}

function resolvedRequirementEntries(requirements, browsers, bcd) {
  return requirements
    .map((requirement) => buildRequirementLockEntry(requirement, browsers, bcd))
    .sort((left, right) => left.ref.localeCompare(right.ref));
}

function isResolvedSupportedAtVersion(resolved, browser, version, bcd) {
  if (!version || !resolved.from) {
    return false;
  }

  if (resolved.state === 'unsupported' || resolved.state === 'unknown') {
    return false;
  }

  if (compareVersions(bcd, browser, resolved.from, version) > 0) {
    return false;
  }

  if (resolved.removed_in && compareVersions(bcd, browser, resolved.removed_in, version) <= 0) {
    return false;
  }

  return true;
}

function summarizeBrowser(requirements, browser, bcd) {
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
  let derivedFloor = null;
  let blockingRequirements = null;

  if (unsupported.length > 0) {
    state = 'unsatisfied';
    blockingRequirements = unsupported.map((item) => item.ref).sort();
  } else if (unknown.length > 0) {
    state = 'unresolved';
    blockingRequirements = unknown.map((item) => item.ref).sort();
  } else if (conservative.length > 0) {
    state = 'conservative';
    derivedFloor = knownFloor;
  } else {
    state = 'exact';
    derivedFloor = knownFloor;
  }

  return {
    state,
    derived_floor: derivedFloor,
    known_floor: knownFloor,
    monotonic,
    ...(blockingRequirements ? { blocking_requirements: blockingRequirements } : {}),
    requirements: perRequirement,
  };
}

function collectBrowsers({ bcd, requirements }) {
  const browsers = new Set([
    ...Object.keys(bcd?.browsers ?? {}),
  ]);

  for (const requirement of requirements ?? []) {
    if (requirement.kind === 'manual') {
      for (const browser of Object.keys(requirement.support ?? {})) {
        browsers.add(browser);
      }
    }
  }

  return [...browsers].sort((left, right) => left.localeCompare(right));
}

function deriveIntersectionFloorByBrowser(floorRequirementEntries, browsers, bcd) {
  const result = {};
  for (const browser of browsers) {
    const summary = summarizeBrowser(floorRequirementEntries, browser, bcd);
    result[browser] = summary.derived_floor;
  }
  return result;
}

function isRequirementInBaselineIntersection(requirement, baselineByBrowser, browsers, bcd) {
  if (browsers.length === 0) {
    return false;
  }

  return browsers.every((browser) => {
    const baseline = baselineByBrowser[browser] ?? null;
    if (!baseline) {
      return false;
    }
    const resolved = resolveRequirement(requirement, browser, bcd);
    return isResolvedSupportedAtVersion(resolved, browser, baseline, bcd);
  });
}

export function summarizeLock(requirements, bcd, browsers = collectBrowsers({ bcd, requirements })) {
  const byBrowser = {};
  for (const browser of browsers) {
    byBrowser[browser] = summarizeBrowser(requirements, browser, bcd);
  }
  return { by_browser: byBrowser };
}

export function inferDatasetMeta(dataset) {
  return {
    version: dataset?.__meta?.version ?? dataset?.version ?? null,
    timestamp: dataset?.__meta?.timestamp ?? dataset?.timestamp ?? null,
  };
}

export function generateLock({
  findings,
  additionalRequirements = [],
  floorRequirements = [],
  bcd,
}) {
  const aggregatedFindings = aggregateFindings(findings?.findings ?? findings ?? []);
  const normalizedAdditionalRequirements = normalizeRequirementsInput(additionalRequirements, {
    source: 'additionalRequirements',
  });
  const normalizedFloorRequirements = normalizeRequirementsInput(floorRequirements, {
    source: 'floorRequirements',
  });

  const effectiveRequirements = mergeRequirements([
    ...aggregatedFindings,
    ...normalizedAdditionalRequirements,
  ]);

  const browsers = collectBrowsers({
    bcd,
    requirements: [...effectiveRequirements, ...normalizedFloorRequirements],
  });
  const floorRequirementEntries = resolvedRequirementEntries(normalizedFloorRequirements, browsers, bcd);
  const baselineByBrowser = deriveIntersectionFloorByBrowser(floorRequirementEntries, browsers, bcd);

  const keptRequirements = effectiveRequirements.filter((requirement) => (
    !isRequirementInBaselineIntersection(requirement, baselineByBrowser, browsers, bcd)
  ));
  const requirementEntries = resolvedRequirementEntries(keptRequirements, browsers, bcd);
  const combinedRequirements = [...floorRequirementEntries, ...requirementEntries];

  return {
    format: 'compat-lock/v1',
    generated_at: nowIso(),
    tool: {
      generator: `compat-generate-lock/${packageJson.version}`,
      scanner: findings?.tool?.scanner ?? null,
      registry: findings?.tool?.registry ?? null,
      datasets: {
        bcd: inferDatasetMeta(bcd),
      },
    },
    floor_requirements: floorRequirementEntries,
    requirements: requirementEntries,
    summary: summarizeLock(combinedRequirements, bcd, browsers),
  };
}

function toReplayResolution(requirement, browser) {
  return requirement.resolved?.[browser] ?? {
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
}

export function resolveLockForBrowser(lock, browser, mode, bcd = null) {
  const lockRequirements = [
    ...ensureArray(lock.floor_requirements),
    ...ensureArray(lock.requirements),
  ];
  const requirements = [];

  for (const requirement of lockRequirements) {
    if (mode === 'recompute' && requirement.kind === 'bcd') {
      if (!bcd) {
        throw new Error('Recompute mode requires BCD data.');
      }
      const recomputed = resolveBcdRequirement(requirement, browser, bcd);
      requirements.push({ ref: requirement.ref, ...recomputed });
      continue;
    }

    if (mode === 'recompute' && requirement.kind === 'manual') {
      requirements.push({ ref: requirement.ref, ...resolveManualRequirement(requirement, browser) });
      continue;
    }

    requirements.push({ ref: requirement.ref, ...toReplayResolution(requirement, browser) });
  }

  let summary;
  if (mode === 'recompute' && bcd) {
    const recomputedRequirements = lockRequirements.map((requirement) => ({
      ref: requirement.ref,
      resolved: {
        [browser]: requirements.find((item) => item.ref === requirement.ref),
      },
    }));
    summary = summarizeBrowser(recomputedRequirements, browser, bcd);
  } else {
    summary = summarizeBrowser(lockRequirements, browser, bcd ?? { browsers: {} });
  }

  return {
    format: 'compat-resolution/v1',
    browser,
    mode,
    state: summary.state,
    derived_floor: summary.derived_floor,
    known_floor: summary.known_floor,
    monotonic: summary.monotonic,
    ...(summary.blocking_requirements ? { blocking_requirements: summary.blocking_requirements } : {}),
    requirements,
  };
}
