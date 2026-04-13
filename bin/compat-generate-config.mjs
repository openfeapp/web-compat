#!/usr/bin/env node
import {
  hasHelpFlag,
  parseArgs,
  renderCliHelp,
  writeCliHelp,
} from '../src/cli-utils.mjs';
import { generateConfig, writeJsonFile } from '../src/compat-core.mjs';

const HELP_TEXT = renderCliHelp({
  purpose: 'Generate a starter compat-config/v1 document.',
  usage: 'compat-generate-config --target browser=version[,browser=version...] [--out file] [--no-schema] [-h|--help]',
  required: [
    '--target browser=version[,browser=version...]  One or more browser support floors.',
  ],
  optional: [
    '--out file  Write JSON to a file instead of stdout.',
    '--no-schema  Omit the $schema field.',
    '-h, --help  Show this help text.',
  ],
  example: 'compat-generate-config --target chrome=120,firefox=115 --out compat.config.json',
});

function parseTargets(rawValue) {
  if (!rawValue) {
    throw new Error('Missing required argument --target');
  }

  const input = rawValue;
  const targets = {};

  for (const pair of input.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator <= 0 || separator === trimmed.length - 1) {
      throw new Error(`Invalid --target entry "${trimmed}". Expected browser=version.`);
    }

    const browser = trimmed.slice(0, separator).trim();
    const version = trimmed.slice(separator + 1).trim();
    if (!browser || !version) {
      throw new Error(`Invalid --target entry "${trimmed}". Expected browser=version.`);
    }
    targets[browser] = version;
  }

  if (Object.keys(targets).length === 0) {
    throw new Error('compat-generate-config requires at least one target.');
  }

  return targets;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (hasHelpFlag(args)) {
    writeCliHelp(HELP_TEXT);
    return;
  }

  if (argv.length === 0) {
    writeCliHelp(HELP_TEXT, { error: true, message: 'No arguments provided.' });
    process.exitCode = 1;
    return;
  }

  const targets = parseTargets(args.target);
  const config = generateConfig({
    targets,
    includeSchema: !args['no-schema'],
  });

  if (args.out) {
    await writeJsonFile(args.out, config);
    console.log(`Wrote ${args.out}`);
    return;
  }

  console.log(JSON.stringify(config, null, 2));
}

main().catch((error) => {
  writeCliHelp(HELP_TEXT, { error: true, message: error.message || String(error) });
  process.exitCode = 1;
});
