#!/usr/bin/env node
import {
  hasHelpFlag,
  missingArgs,
  parseArgs,
  renderCliHelp,
  requireArg,
  writeCliHelp,
} from '../src/cli-utils.mjs';
import { readJsonFile, writeJsonFile, loadBcd, generateLock } from '../src/compat-core.mjs';

const HELP_TEXT = renderCliHelp({
  purpose: 'Generate a compat-lock/v1 from config, findings, and BCD.',
  usage: 'compat-generate-lock --config file --findings file --out file [--bcd file] [-h|--help]',
  required: [
    '--config file  Path to compat-config/v1 JSON.',
    '--findings file  Path to compat-findings/v1 JSON.',
    '--out file  Where to write compat-lock/v1 JSON.',
  ],
  optional: [
    '--bcd file  Use a BCD JSON file instead of installed @mdn/browser-compat-data.',
    '-h, --help  Show this help text.',
  ],
  example: 'compat-generate-lock --config compat.config.json --findings findings.json --bcd bcd.json --out compat.lock.json',
});

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (hasHelpFlag(args)) {
    writeCliHelp(HELP_TEXT);
    return;
  }

  const missing = missingArgs(args, ['config', 'findings', 'out']);
  if (argv.length === 0 || missing.length > 0) {
    const message = argv.length === 0
      ? 'No arguments provided.'
      : `Missing required argument${missing.length > 1 ? 's' : ''} ${missing.map((name) => `--${name}`).join(', ')}`;
    writeCliHelp(HELP_TEXT, { error: true, message });
    process.exitCode = 1;
    return;
  }

  const configPath = requireArg(args, 'config');
  const findingsPath = requireArg(args, 'findings');
  const outPath = requireArg(args, 'out');

  const [config, findings, bcd] = await Promise.all([
    readJsonFile(configPath),
    readJsonFile(findingsPath),
    loadBcd(args.bcd),
  ]);

  const lock = generateLock({ config, findings, bcd });
  await writeJsonFile(outPath, lock);
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  writeCliHelp(HELP_TEXT, { error: true, message: error.message || String(error) });
  process.exitCode = 1;
});
