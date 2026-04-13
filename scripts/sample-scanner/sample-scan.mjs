#!/usr/bin/env node
import { parseArgs, requireArg } from '../../src/cli-utils.mjs';
import { readJsonFile, writeJsonFile } from '../../src/compat-core.mjs';
import { scanProjectWithSampleRegistry } from './sample-scanner-core.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = requireArg(args, 'config');
  const registryPath = requireArg(args, 'registry');
  const outPath = requireArg(args, 'out');

  const [config, registry] = await Promise.all([
    readJsonFile(configPath),
    readJsonFile(registryPath),
  ]);

  const findings = await scanProjectWithSampleRegistry(config, registry);
  await writeJsonFile(outPath, findings);
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
