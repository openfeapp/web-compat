import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  COMPAT_CONFIG_SCHEMA_URL,
  generateConfig,
  readJsonFile,
  loadBcd,
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

async function loadExampleCoreInputs() {
  const config = await readJsonFile(path.join(projectRoot, 'examples/compat.config.json'));
  const findings = await readJsonFile(path.join(projectRoot, 'examples/out.findings.json'));
  const bcd = await loadBcd(path.join(projectRoot, 'examples/bcd.fixture.json'));
  return { config, findings, bcd };
}

async function loadSampleScannerInputs() {
  const config = await readJsonFile(path.join(projectRoot, 'examples/sample-scanner.config.json'));
  const registry = await readJsonFile(path.join(projectRoot, 'examples/sample-scanner.registry.json'));
  return { config, registry };
}

test('config generator builds a starter compat-config document', () => {
  const config = generateConfig({
    targets: {
      chrome: '120',
      firefox: '115',
    },
  });

  assert.deepEqual(config, {
    $schema: COMPAT_CONFIG_SCHEMA_URL,
    format: 'compat-config/v1',
    targets: {
      chrome: '120',
      firefox: '115',
    },
  });
});

test('public CLIs support --help', async () => {
  for (const relativePath of [
    'bin/compat-generate-config.mjs',
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
    'bin/compat-generate-config.mjs',
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
    'bin/compat-generate-config.mjs',
    'bin/compat-generate-lock.mjs',
    'bin/compat-resolve.mjs',
  ]) {
    const result = await runCli(relativePath);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Usage:/);
  }
});

test('compat-generate-config requires --target', async () => {
  const result = await runCli('bin/compat-generate-config.mjs', ['--out', 'tmp.json']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Missing required argument --target/);
  assert.match(result.stderr, /Usage:/);
});

test('compat-generate-config emits starter config JSON', async () => {
  const result = await runCli('bin/compat-generate-config.mjs', [
    '--target',
    'chrome=120,firefox=115',
  ]);
  assert.equal(result.code, 0);

  const config = JSON.parse(result.stdout);
  assert.equal(config.$schema, COMPAT_CONFIG_SCHEMA_URL);
  assert.equal(config.format, 'compat-config/v1');
  assert.deepEqual(config.targets, {
    chrome: '120',
    firefox: '115',
  });
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

test('core config stays scanner-agnostic', async () => {
  const { config } = await loadExampleCoreInputs();
  assert.equal('scan' in config, false);
});

test('lock generation computes the expected exact Chrome floor', async () => {
  const { config, findings, bcd } = await loadExampleCoreInputs();
  const lock = generateLock({ config, findings, bcd });
  const summary = lock.summary.by_browser.chrome;
  assert.equal(summary.state, 'exact');
  assert.equal(summary.derived_technical_floor, '114');
  assert.equal(summary.compatible_with_declared_floor, true);
  assert.deepEqual(summary.blocking_requirements, [makeBcdRef('css.properties.text-wrap')]);
  assert.deepEqual(lock.tool.datasets, {
    bcd: {
      version: 'fixture-2026.04.13',
      timestamp: '2026-04-13T00:00:00.000Z',
    },
  });
  assert.equal('aliases' in lock.requirements[0], false);
});

test('resolver can replay and recompute the same answer', async () => {
  const { config, findings, bcd } = await loadExampleCoreInputs();
  const lock = generateLock({ config, findings, bcd });
  const replay = resolveLockForBrowser(lock, 'chrome', 'replay');
  const recompute = resolveLockForBrowser(lock, 'chrome', 'recompute', bcd);
  assert.equal(replay.state, 'exact');
  assert.equal(recompute.state, 'exact');
  assert.equal(replay.derived_technical_floor, '114');
  assert.equal(recompute.derived_technical_floor, '114');
});

test('BCD ranged versions become conservative requirements', () => {
  const bcd = {
    browsers: {
      chrome: {
        releases: {
          '70': { release_date: '2018-10-16' },
          '79': { release_date: '2019-12-10' },
          '80': { release_date: '2020-02-04' }
        }
      }
    },
    api: {
      Example: {
        feature: {
          __compat: {
            support: {
              chrome: { version_added: '≤79' }
            },
            status: {
              experimental: false,
              standard_track: true,
              deprecated: false
            }
          }
        }
      }
    }
  };

  const resolved = resolveBcdRequirement({
    key: 'api.Example.feature',
    selector: {
      prefix: null,
      alternative_name: null,
      allow_flags: false,
      allow_partial_implementation: false,
    }
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
          '30': { release_date: '2013-10-01' }
        }
      }
    },
    api: {
      Example: {
        legacy: {
          __compat: {
            support: {
              chrome: { version_added: '20', version_removed: '30' }
            },
            status: {
              experimental: false,
              standard_track: true,
              deprecated: true
            }
          }
        }
      }
    }
  };

  const resolved = resolveBcdRequirement({
    key: 'api.Example.legacy',
    selector: {
      prefix: null,
      alternative_name: null,
      allow_flags: false,
      allow_partial_implementation: false,
    }
  }, 'chrome', bcd);

  assert.equal(resolved.state, 'exact');
  assert.equal(resolved.monotonic, false);
  assert.equal(resolved.last_supported, '29');
  assert.equal(resolved.removed_in, '30');
});
