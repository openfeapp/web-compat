import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  COMPAT_REQUIREMENTS_SCHEMA_URL,
  normalizeRequirementsArtifact,
  readJsonFile,
  writeJsonFile,
  generateLock,
  resolveLockForBrowser,
  resolveBcdRequirement,
  makeBcdRef,
} from '../src/compat-core.mjs';
import { scanProjectWithSampleRegistry } from '../scripts/sample-scanner/sample-scanner-core.mjs';

const execFile = promisify(execFileCallback);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function runCli(relativePath, args = []) {
  try {
    const result = await execFile(
      process.execPath,
      [path.join(projectRoot, relativePath), ...args],
      { cwd: projectRoot },
    );
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

async function makeTempDir(prefix = 'web-compat-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function loadSampleScannerInputs() {
  const config = await readJsonFile(path.join(projectRoot, 'examples/sample-scanner/config.json'));
  const registry = await readJsonFile(path.join(projectRoot, 'examples/sample-scanner/registry.json'));
  return { config, registry };
}

function makeFixtureBcd() {
  return {
    __meta: {
      version: 'fixture-2026.04.14',
      timestamp: '2026-04-14T00:00:00.000Z',
    },
    browsers: {
      chrome: {
        releases: {
          '23': { release_date: '2012-11-06' },
          '37': { release_date: '2014-08-26' },
          '61': { release_date: '2017-09-05' },
          '104': { release_date: '2022-08-02' },
          '114': { release_date: '2023-05-30' },
          '120': { release_date: '2023-12-05' },
        },
      },
      firefox: {
        releases: {
          '44': { release_date: '2016-01-26' },
          '94': { release_date: '2021-11-02' },
          '98': { release_date: '2022-03-08' },
          '115': { release_date: '2023-07-04' },
          '122': { release_date: '2024-01-23' },
        },
      },
      safari: {
        releases: {
          '10.1': { release_date: '2017-03-27' },
          '12.1': { release_date: '2019-03-25' },
          '15.4': { release_date: '2022-03-14' },
          '17.0': { release_date: '2023-09-18' },
        },
      },
    },
    api: {
      IDBFactory: {
        open: {
          __compat: {
            support: {
              chrome: { version_added: '23' },
              firefox: { version_added: '44' },
              safari: { version_added: '10.1' },
            },
            status: { experimental: false, standard_track: true, deprecated: false },
          },
        },
      },
      Navigator: {
        share: {
          __compat: {
            support: {
              chrome: { version_added: '61' },
              firefox: { version_added: '115' },
              safari: { version_added: '12.1' },
            },
            status: { experimental: false, standard_track: true, deprecated: false },
          },
        },
      },
    },
    css: {
      properties: {
        'text-wrap': {
          __compat: {
            support: {
              chrome: { version_added: '114' },
              firefox: { version_added: '122' },
              safari: { version_added: '17.0' },
            },
            status: { experimental: false, standard_track: true, deprecated: false },
          },
        },
      },
    },
    html: {
      elements: {
        dialog: {
          __compat: {
            support: {
              chrome: { version_added: '37' },
              firefox: { version_added: '98' },
              safari: { version_added: '15.4' },
            },
            status: { experimental: false, standard_track: true, deprecated: false },
          },
        },
      },
    },
  };
}

function makeFindings() {
  return {
    format: 'compat-findings/v1',
    generated_at: '2026-04-14T00:00:00.000Z',
    tool: {
      scanner: 'sample-scanner/1.0.0',
      registry: 'sample-scanner-registry/1',
    },
    findings: [
      {
        kind: 'bcd',
        ref: 'bcd:api.IDBFactory.open',
        key: 'api.IDBFactory.open',
        selector: {
          prefix: null,
          alternative_name: null,
          allow_flags: false,
          allow_partial_implementation: false,
        },
        evidence: [{ path: 'app.js', rule: 'sample/indexeddb' }],
      },
      {
        kind: 'bcd',
        ref: 'bcd:api.Navigator.share',
        key: 'api.Navigator.share',
        selector: {
          prefix: null,
          alternative_name: null,
          allow_flags: false,
          allow_partial_implementation: false,
        },
        evidence: [{ path: 'app.js', rule: 'sample/share' }],
      },
      {
        kind: 'bcd',
        ref: 'bcd:css.properties.text-wrap',
        key: 'css.properties.text-wrap',
        selector: {
          prefix: null,
          alternative_name: null,
          allow_flags: false,
          allow_partial_implementation: false,
        },
        evidence: [{ path: 'app.css', rule: 'sample/text-wrap' }],
      },
      {
        kind: 'bcd',
        ref: 'bcd:html.elements.dialog',
        key: 'html.elements.dialog',
        selector: {
          prefix: null,
          alternative_name: null,
          allow_flags: false,
          allow_partial_implementation: false,
        },
        evidence: [{ path: 'index.html', rule: 'sample/dialog' }],
      },
    ],
  };
}

function makeAdditionalRequirements() {
  return [{
    kind: 'manual',
    id: 'behavior.structured-clone.transfer',
    title: 'Structured clone with transfer support',
    reason: 'Application depends on a semantic boundary not represented by a single BCD key.',
    support: {
      chrome: '104',
      firefox: '94',
      safari: '15.4',
    },
    source: [
      'https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializewithtransfer',
    ],
  }];
}

test('public CLIs support --help', async () => {
  for (const relativePath of [
    'bin/compat-generate-lock.mjs',
    'bin/compat-resolve.mjs',
  ]) {
    const result = await runCli(relativePath, ['--help']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Usage:/);
  }
});

test('public CLIs support -h', async () => {
  for (const relativePath of [
    'bin/compat-generate-lock.mjs',
    'bin/compat-resolve.mjs',
  ]) {
    const result = await runCli(relativePath, ['-h']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Usage:/);
  }
});

test('public CLIs print usage on no-arg invocation', async () => {
  for (const relativePath of [
    'bin/compat-generate-lock.mjs',
    'bin/compat-resolve.mjs',
  ]) {
    const result = await runCli(relativePath);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Usage:/);
  }
});

test('compat-generate-lock generates a lock without --floor', async () => {
  const dir = await makeTempDir();
  const outPath = path.join(dir, 'compat.lock.json');

  const result = await runCli('bin/compat-generate-lock.mjs', [
    '--findings',
    'examples/compat.findings.json',
    '--bcd',
    'examples/bcd.fixture.json',
    '--out',
    outPath,
  ]);

  assert.equal(result.code, 0);
  const lock = await readJsonFile(outPath);
  assert.equal('floor' in lock, false);
  assert.deepEqual(lock.floor_requirements, []);
});

test('compat-requirements normalization supports explicit bcd refs and manual support maps', () => {
  const requirements = normalizeRequirementsArtifact({
    $schema: COMPAT_REQUIREMENTS_SCHEMA_URL,
    format: 'compat-requirements/v1',
    requirements: [
      'bcd:api.IDBFactory.open',
      {
        kind: 'manual',
        id: 'behavior.structured-clone.transfer',
        support: {
          chrome: '104',
        },
        source: [
          'https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializewithtransfer',
        ],
      },
    ],
  }, { source: 'inline.requirements.json' });

  assert.deepEqual(requirements.map((item) => item.ref), [
    'bcd:api.IDBFactory.open',
    'manual:behavior.structured-clone.transfer',
  ]);
  assert.equal(requirements[1].support.chrome, '104');
});

test('sample scanner finds the expected BCD requirements', async () => {
  const { config, registry } = await loadSampleScannerInputs();
  assert.equal(config.format, 'sample-scanner-config/v1');
  const findings = await scanProjectWithSampleRegistry(config, registry);
  const refs = findings.findings.map((item) => item.ref).sort();
  assert.deepEqual(refs, [
    'bcd:api.IDBFactory.open',
    'bcd:api.Navigator.share',
    'bcd:css.properties.text-wrap',
    'bcd:html.elements.dialog',
  ]);
});

test('lock generation allows no floor requirements and keeps the full effective app requirement set', () => {
  const lock = generateLock({
    findings: makeFindings(),
    additionalRequirements: makeAdditionalRequirements(),
    floorRequirements: [],
    bcd: makeFixtureBcd(),
  });

  assert.equal('floor' in lock, false);
  assert.deepEqual(lock.floor_requirements, []);
  assert.deepEqual(lock.requirements.map((item) => item.ref), [
    'bcd:api.IDBFactory.open',
    'bcd:api.Navigator.share',
    'bcd:css.properties.text-wrap',
    'bcd:html.elements.dialog',
    'manual:behavior.structured-clone.transfer',
  ]);
  assert.equal(lock.summary.by_browser.chrome.state, 'exact');
  assert.equal(lock.summary.by_browser.chrome.derived_floor, '114');
  assert.equal('blocking_requirements' in lock.summary.by_browser.chrome, false);
  assert.equal('floor' in lock.summary.by_browser.chrome, false);
  assert.equal('compatible_with_floor' in lock.summary.by_browser.chrome, false);
  assert.equal(lock.summary.by_browser.firefox.derived_floor, '122');
  assert.deepEqual(lock.tool.datasets, {
    bcd: {
      version: 'fixture-2026.04.14',
      timestamp: '2026-04-14T00:00:00.000Z',
    },
  });
});

test('compat-generate-lock omits floor requirements cleanly when the flag is not passed', async () => {
  const dir = await makeTempDir();
  const findingsPath = path.join(dir, 'findings.json');
  const bcdPath = path.join(dir, 'bcd.json');
  const additionalPath = path.join(dir, 'additional.requirements.json');
  const outPath = path.join(dir, 'compat.lock.json');

  await writeJsonFile(findingsPath, makeFindings());
  await writeJsonFile(bcdPath, makeFixtureBcd());
  await writeJsonFile(additionalPath, {
    $schema: COMPAT_REQUIREMENTS_SCHEMA_URL,
    format: 'compat-requirements/v1',
    requirements: makeAdditionalRequirements(),
  });

  const result = await runCli('bin/compat-generate-lock.mjs', [
    '--findings',
    findingsPath,
    '--additional-requirements',
    additionalPath,
    '--bcd',
    bcdPath,
    '--out',
    outPath,
  ]);

  assert.equal(result.code, 0);
  const lock = await readJsonFile(outPath);
  assert.deepEqual(lock.floor_requirements, []);
  assert.deepEqual(lock.requirements.map((item) => item.ref), [
    'bcd:api.IDBFactory.open',
    'bcd:api.Navigator.share',
    'bcd:css.properties.text-wrap',
    'bcd:html.elements.dialog',
    'manual:behavior.structured-clone.transfer',
  ]);
});

test('lock generation omits app requirements already covered by explicit floor requirements', () => {
  const lock = generateLock({
    findings: makeFindings(),
    additionalRequirements: makeAdditionalRequirements(),
    floorRequirements: ['bcd:api.IDBFactory.open'],
    bcd: makeFixtureBcd(),
  });

  assert.deepEqual(lock.floor_requirements.map((item) => item.ref), ['bcd:api.IDBFactory.open']);
  assert.deepEqual(lock.requirements.map((item) => item.ref), [
    'bcd:api.Navigator.share',
    'bcd:css.properties.text-wrap',
    'bcd:html.elements.dialog',
    'manual:behavior.structured-clone.transfer',
  ]);
});

test('lock generation preserves all browsers from the BCD dataset for replay and recompute', () => {
  const bcd = makeFixtureBcd();
  const lock = generateLock({
    findings: makeFindings(),
    additionalRequirements: makeAdditionalRequirements(),
    floorRequirements: ['bcd:api.IDBFactory.open'],
    bcd,
  });

  assert.deepEqual(Object.keys(lock.summary.by_browser), ['chrome', 'firefox', 'safari']);
  assert.equal(lock.summary.by_browser.safari.derived_floor, '17.0');
  assert.equal('floor' in lock.summary.by_browser.safari, false);
  assert.equal('compatible_with_floor' in lock.summary.by_browser.safari, false);

  const replay = resolveLockForBrowser(lock, 'safari', 'replay');
  const recompute = resolveLockForBrowser(lock, 'safari', 'recompute', makeFixtureBcd());
  assert.equal(replay.state, 'exact');
  assert.equal(recompute.state, 'exact');
  assert.equal(replay.derived_floor, '17.0');
  assert.equal(recompute.derived_floor, '17.0');
  assert.equal('blocking_requirements' in replay, false);
  assert.equal('blocking_requirements' in recompute, false);
  assert.equal('floor' in replay, false);
  assert.equal('compatible_with_floor' in replay, false);
  assert.equal('floor' in recompute, false);
  assert.equal('compatible_with_floor' in recompute, false);
});

test('conservative browser results omit blocking_requirements', () => {
  const bcd = {
    browsers: {
      chrome: {
        releases: {
          '70': { release_date: '2018-10-16' },
          '79': { release_date: '2019-12-10' },
          '80': { release_date: '2020-02-04' },
        },
      },
    },
    api: {
      Example: {
        feature: {
          __compat: {
            support: {
              chrome: { version_added: '≤79' },
            },
            status: {
              experimental: false,
              standard_track: true,
              deprecated: false,
            },
          },
        },
      },
    },
  };

  const findings = {
    format: 'compat-findings/v1',
    generated_at: '2026-04-14T00:00:00.000Z',
    tool: {
      scanner: 'sample-scanner/1.0.0',
      registry: 'sample-scanner-registry/1',
    },
    findings: [
      {
        kind: 'bcd',
        ref: 'bcd:api.Example.feature',
        key: 'api.Example.feature',
        selector: {
          prefix: null,
          alternative_name: null,
          allow_flags: false,
          allow_partial_implementation: false,
        },
        evidence: [{ path: 'app.js', rule: 'sample/example-feature' }],
      },
    ],
  };

  const lock = generateLock({
    findings,
    bcd,
  });

  assert.equal(lock.summary.by_browser.chrome.state, 'conservative');
  assert.equal(lock.summary.by_browser.chrome.derived_floor, '79');
  assert.equal('blocking_requirements' in lock.summary.by_browser.chrome, false);

  const replay = resolveLockForBrowser(lock, 'chrome', 'replay');
  const recompute = resolveLockForBrowser(lock, 'chrome', 'recompute', bcd);
  assert.equal(replay.state, 'conservative');
  assert.equal(recompute.state, 'conservative');
  assert.equal('blocking_requirements' in replay, false);
  assert.equal('blocking_requirements' in recompute, false);
});

test('unresolved browser results emit blocking_requirements from unknown requirements', () => {
  const lock = generateLock({
    findings: {
      format: 'compat-findings/v1',
      generated_at: '2026-04-14T00:00:00.000Z',
      tool: {
        scanner: 'sample-scanner/1.0.0',
        registry: 'sample-scanner-registry/1',
      },
      findings: [],
    },
    additionalRequirements: [{
      kind: 'manual',
      id: 'behavior.chrome-only-manual',
      support: {
        chrome: '104',
      },
      source: ['https://example.com/manual'],
    }],
    bcd: makeFixtureBcd(),
  });

  assert.equal(lock.summary.by_browser.firefox.state, 'unresolved');
  assert.equal(lock.summary.by_browser.firefox.derived_floor, null);
  assert.deepEqual(lock.summary.by_browser.firefox.blocking_requirements, [
    'manual:behavior.chrome-only-manual',
  ]);

  const replay = resolveLockForBrowser(lock, 'firefox', 'replay');
  const recompute = resolveLockForBrowser(lock, 'firefox', 'recompute', makeFixtureBcd());
  assert.equal(replay.state, 'unresolved');
  assert.equal(recompute.state, 'unresolved');
  assert.deepEqual(replay.blocking_requirements, ['manual:behavior.chrome-only-manual']);
  assert.deepEqual(recompute.blocking_requirements, ['manual:behavior.chrome-only-manual']);
});

test('unsatisfied browser results emit blocking_requirements from unsupported requirements', () => {
  const bcd = {
    browsers: {
      chrome: {
        releases: {
          '1': { release_date: '2008-09-02' },
        },
      },
      firefox: {
        releases: {
          '1': { release_date: '2004-11-09' },
        },
      },
    },
    api: {
      Example: {
        unsupported: {
          __compat: {
            support: {
              chrome: { version_added: '1' },
              firefox: { version_added: false },
            },
            status: {
              experimental: false,
              standard_track: true,
              deprecated: false,
            },
          },
        },
      },
    },
  };

  const lock = generateLock({
    findings: {
      format: 'compat-findings/v1',
      generated_at: '2026-04-14T00:00:00.000Z',
      tool: {
        scanner: 'sample-scanner/1.0.0',
        registry: 'sample-scanner-registry/1',
      },
      findings: [
        {
          kind: 'bcd',
          ref: 'bcd:api.Example.unsupported',
          key: 'api.Example.unsupported',
          selector: {
            prefix: null,
            alternative_name: null,
            allow_flags: false,
            allow_partial_implementation: false,
          },
          evidence: [{ path: 'app.js', rule: 'sample/example-unsupported' }],
        },
      ],
    },
    bcd,
  });

  assert.equal(lock.summary.by_browser.firefox.state, 'unsatisfied');
  assert.equal(lock.summary.by_browser.firefox.derived_floor, null);
  assert.deepEqual(lock.summary.by_browser.firefox.blocking_requirements, [
    'bcd:api.Example.unsupported',
  ]);

  const replay = resolveLockForBrowser(lock, 'firefox', 'replay');
  const recompute = resolveLockForBrowser(lock, 'firefox', 'recompute', bcd);
  assert.equal(replay.state, 'unsatisfied');
  assert.equal(recompute.state, 'unsatisfied');
  assert.deepEqual(replay.blocking_requirements, ['bcd:api.Example.unsupported']);
  assert.deepEqual(recompute.blocking_requirements, ['bcd:api.Example.unsupported']);
});

test('compat-generate-lock accepts comma-separated floor and additional requirements files', async () => {
  const dir = await makeTempDir();
  const findingsPath = path.join(dir, 'findings.json');
  const bcdPath = path.join(dir, 'bcd.json');
  const floorReqAPath = path.join(dir, 'floor-a.requirements.json');
  const floorReqBPath = path.join(dir, 'floor-b.requirements.json');
  const additionalAPath = path.join(dir, 'additional-a.requirements.json');
  const additionalBPath = path.join(dir, 'additional-b.requirements.json');
  const outPath = path.join(dir, 'compat.lock.json');

  await writeJsonFile(findingsPath, makeFindings());
  await writeJsonFile(bcdPath, makeFixtureBcd());
  await writeJsonFile(floorReqAPath, {
    $schema: COMPAT_REQUIREMENTS_SCHEMA_URL,
    format: 'compat-requirements/v1',
    requirements: ['bcd:api.IDBFactory.open'],
  });
  await writeJsonFile(floorReqBPath, {
    $schema: COMPAT_REQUIREMENTS_SCHEMA_URL,
    format: 'compat-requirements/v1',
    requirements: ['bcd:html.elements.dialog'],
  });
  await writeJsonFile(additionalAPath, {
    $schema: COMPAT_REQUIREMENTS_SCHEMA_URL,
    format: 'compat-requirements/v1',
    requirements: makeAdditionalRequirements(),
  });
  await writeJsonFile(additionalBPath, {
    $schema: COMPAT_REQUIREMENTS_SCHEMA_URL,
    format: 'compat-requirements/v1',
    requirements: ['bcd:api.Navigator.share'],
  });

  const result = await runCli('bin/compat-generate-lock.mjs', [
    '--findings',
    findingsPath,
    '--floor-requirements',
    `${floorReqAPath},${floorReqBPath}`,
    '--additional-requirements',
    `${additionalAPath},${additionalBPath}`,
    '--bcd',
    bcdPath,
    '--out',
    outPath,
  ]);

  assert.equal(result.code, 0);
  const lock = await readJsonFile(outPath);
  assert.deepEqual(lock.floor_requirements.map((item) => item.ref), [
    'bcd:api.IDBFactory.open',
    'bcd:html.elements.dialog',
  ]);
  assert.deepEqual(lock.requirements.map((item) => item.ref), [
    'bcd:api.Navigator.share',
    'bcd:css.properties.text-wrap',
    'manual:behavior.structured-clone.transfer',
  ]);
});

test('BCD ranged versions become conservative requirements', () => {
  const bcd = {
    browsers: {
      chrome: {
        releases: {
          '70': { release_date: '2018-10-16' },
          '79': { release_date: '2019-12-10' },
          '80': { release_date: '2020-02-04' },
        },
      },
    },
    api: {
      Example: {
        feature: {
          __compat: {
            support: {
              chrome: { version_added: '≤79' },
            },
            status: {
              experimental: false,
              standard_track: true,
              deprecated: false,
            },
          },
        },
      },
    },
  };

  const resolved = resolveBcdRequirement({
    key: 'api.Example.feature',
    selector: {
      prefix: null,
      alternative_name: null,
      allow_flags: false,
      allow_partial_implementation: false,
    },
  }, 'chrome', bcd);

  assert.equal(resolved.state, 'conservative');
  assert.equal(resolved.from, '79');
});

test('removed features are marked non-monotonic and derive last_supported', () => {
  const bcd = {
    browsers: {
      chrome: {
        releases: {
          '20': { release_date: '2012-06-26' },
          '29': { release_date: '2013-08-20' },
          '30': { release_date: '2013-10-01' },
        },
      },
    },
    api: {
      Example: {
        legacy: {
          __compat: {
            support: {
              chrome: { version_added: '20', version_removed: '30' },
            },
            status: {
              experimental: false,
              standard_track: true,
              deprecated: true,
            },
          },
        },
      },
    },
  };

  const resolved = resolveBcdRequirement({
    key: 'api.Example.legacy',
    selector: {
      prefix: null,
      alternative_name: null,
      allow_flags: false,
      allow_partial_implementation: false,
    },
  }, 'chrome', bcd);

  assert.equal(resolved.state, 'exact');
  assert.equal(resolved.from, '20');
  assert.equal(resolved.removed_in, '30');
  assert.equal(resolved.last_supported, '29');
  assert.equal(resolved.monotonic, false);
});

test('makeBcdRef stays stable for lock references', () => {
  assert.equal(makeBcdRef('css.properties.text-wrap'), 'bcd:css.properties.text-wrap');
});
