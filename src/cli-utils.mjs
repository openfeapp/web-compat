export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '-h') {
      args.h = true;
      continue;
    }
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export function hasHelpFlag(args) {
  return Boolean(args.h || args.help);
}

export function requireArg(args, name) {
  if (!(name in args) || args[name] === true) {
    throw new Error(`Missing required argument --${name}`);
  }
  return args[name];
}

export function missingArgs(args, names) {
  return names.filter((name) => !(name in args) || args[name] === true);
}

export function renderCliHelp({ purpose, usage, required = [], optional = [], example }) {
  const lines = [purpose, '', `Usage: ${usage}`];

  if (required.length > 0) {
    lines.push('', 'Required:');
    for (const item of required) {
      lines.push(`  ${item}`);
    }
  }

  if (optional.length > 0) {
    lines.push('', 'Optional:');
    for (const item of optional) {
      lines.push(`  ${item}`);
    }
  }

  if (example) {
    lines.push('', 'Example:');
    lines.push(`  ${example}`);
  }

  return `${lines.join('\n')}\n`;
}

export function writeCliHelp(helpText, { error = false, message = null } = {}) {
  const stream = error ? process.stderr : process.stdout;
  if (message) {
    stream.write(`${message}\n\n`);
  }
  stream.write(helpText);
}
