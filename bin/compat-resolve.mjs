#!/usr/bin/env node
import {
  hasHelpFlag,
  missingArgs,
  parseArgs,
  renderCliHelp,
  requireArg,
  writeCliHelp,
} from '../src/cli-utils.mjs';
import { readJsonFile, writeJsonFile, loadBcd, resolveLockForBrowser } from '../src/compat-core.mjs';

const HELP_TEXT = renderCliHelp({
  purpose: 'Resolve one browser from a compat-lock/v1 in replay or recompute mode.',
  usage: 'compat-resolve --lock file --browser name [--mode replay|recompute] [--bcd file] [--out file] [-h|--help]',
  required: [
    '--lock file  Path to compat-lock/v1 JSON.',
    '--browser name  Browser key to resolve, such as chrome.',
  ],
  optional: [
    '--mode replay|recompute  Resolver mode. Defaults to replay.',
    '--bcd file  Required for recompute mode when BCD is not installed locally.',
    '--out file  Write compat-resolution/v1 JSON to a file instead of stdout.',
    '-h, --help  Show this help text.',
  ],
  example: 'compat-resolve --lock compat.lock.json --browser chrome --mode replay',
});

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (hasHelpFlag(args)) {
    writeCliHelp(HELP_TEXT);
    return;
  }

  const missing = missingArgs(args, ['lock', 'browser']);
  if (argv.length === 0 || missing.length > 0) {
    const message = argv.length === 0
      ? 'No arguments provided.'
      : `Missing required argument${missing.length > 1 ? 's' : ''} ${missing.map((name) => `--${name}`).join(', ')}`;
    writeCliHelp(HELP_TEXT, { error: true, message });
    process.exitCode = 1;
    return;
  }

  const lockPath = requireArg(args, 'lock');
  const browser = requireArg(args, 'browser');
  const mode = args.mode || 'replay';
  if (mode !== 'replay' && mode !== 'recompute') {
    throw new Error('--mode must be replay or recompute');
  }

  const lock = await readJsonFile(lockPath);
  const bcd = mode === 'recompute' ? await loadBcd(args.bcd) : null;
  const resolution = resolveLockForBrowser(lock, browser, mode, bcd);

  if (args.out) {
    await writeJsonFile(args.out, resolution);
    console.log(`Wrote ${args.out}`);
  } else {
    console.log(JSON.stringify(resolution, null, 2));
  }
}

main().catch((error) => {
  writeCliHelp(HELP_TEXT, { error: true, message: error.message || String(error) });
  process.exitCode = 1;
});
