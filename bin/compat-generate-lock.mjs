#!/usr/bin/env node
import {
  hasHelpFlag,
  missingArgs,
  parseArgs,
  renderCliHelp,
  requireArg,
  writeCliHelp,
} from '../src/cli-utils.mjs';
import {
  generateLock,
  loadBcd,
  loadRequirementsFiles,
  parseBrowserVersionMap,
  parseCommaSeparatedList,
  readJsonFile,
  writeJsonFile,
} from '../src/compat-core.mjs';

const HELP_TEXT = renderCliHelp({
  purpose: 'Generate a compat-lock/v1 from findings, floor requirements, additional requirements, and BCD.',
  usage: 'compat-generate-lock --findings file --floor browser=version[,browser=version...] --out file [--floor-requirements files] [--additional-requirements files] [--bcd file] [-h|--help]',
  required: [
    '--findings file  Path to compat-findings/v1 JSON.',
    '--floor browser=version[,browser=version...]  Declared browser floors used for comparison.',
    '--out file  Where to write compat-lock/v1 JSON.',
  ],
  optional: [
    '--floor-requirements files  Comma-separated compat-requirements/v1 files merged into floor_requirements.',
    '--additional-requirements files  Comma-separated compat-requirements/v1 files merged into findings.',
    '--bcd file  Use a BCD JSON file instead of installed @mdn/browser-compat-data.',
    '-h, --help  Show this help text.',
  ],
  example: 'compat-generate-lock --findings findings.json --floor chrome=120,firefox=115 --floor-requirements indexeddb.json,dialog.json --additional-requirements transfer.json,share.json --out compat.lock.json',
});

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (hasHelpFlag(args)) {
    writeCliHelp(HELP_TEXT);
    return;
  }

  const missing = missingArgs(args, ['findings', 'floor', 'out']);
  if (argv.length === 0 || missing.length > 0) {
    const message = argv.length === 0
      ? 'No arguments provided.'
      : `Missing required argument${missing.length > 1 ? 's' : ''} ${missing.map((name) => `--${name}`).join(', ')}`;
    writeCliHelp(HELP_TEXT, { error: true, message });
    process.exitCode = 1;
    return;
  }

  const findingsPath = requireArg(args, 'findings');
  const floor = parseBrowserVersionMap(requireArg(args, 'floor'));
  const outPath = requireArg(args, 'out');
  const floorRequirementPaths = parseCommaSeparatedList(args['floor-requirements']);
  const additionalRequirementPaths = parseCommaSeparatedList(args['additional-requirements']);

  const [findings, floorRequirements, additionalRequirements, bcd] = await Promise.all([
    readJsonFile(findingsPath),
    loadRequirementsFiles(floorRequirementPaths),
    loadRequirementsFiles(additionalRequirementPaths),
    loadBcd(args.bcd),
  ]);

  const lock = generateLock({
    floor,
    findings,
    floorRequirements,
    additionalRequirements,
    bcd,
  });
  await writeJsonFile(outPath, lock);
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  writeCliHelp(HELP_TEXT, { error: true, message: error.message || String(error) });
  process.exitCode = 1;
});
