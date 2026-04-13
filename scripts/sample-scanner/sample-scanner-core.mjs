import fs from 'node:fs/promises';
import path from 'node:path';
import {
  aggregateFindings,
  DEFAULT_SELECTOR,
  makeBcdRef,
  normalizeSelector,
  nowIso,
} from '../../src/compat-core.mjs';

function computeLocFromIndex(content, start, length) {
  const upToStart = content.slice(0, start);
  const startLines = upToStart.split('\n');
  const line = startLines.length;
  const column = startLines[startLines.length - 1].length + 1;

  const matched = content.slice(start, start + length);
  const matchedLines = matched.split('\n');
  const endLine = line + matchedLines.length - 1;
  const endColumn = matchedLines.length === 1
    ? column + matched.length - 1
    : matchedLines[matchedLines.length - 1].length + 1;

  return `${line}:${column}-${endLine}:${endColumn}`;
}

function normalizeRuleSelector(rule) {
  if (!rule || typeof rule !== 'object') {
    return normalizeSelector(DEFAULT_SELECTOR);
  }
  return normalizeSelector(rule.selector);
}

function inferRuleBucket(extension) {
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    return 'js';
  }
  if (extension === '.css') {
    return 'css';
  }
  if (extension === '.html' || extension === '.htm') {
    return 'html';
  }
  return null;
}

export async function walkFiles(rootPaths, extensions, excludeSubstrings) {
  const results = [];
  const normalizedExtensions = new Set(extensions.map((ext) => ext.toLowerCase()));

  async function visit(currentPath) {
    let stat;
    try {
      stat = await fs.stat(currentPath);
    } catch {
      return;
    }

    if (stat.isDirectory()) {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        await visit(path.join(currentPath, entry.name));
      }
      return;
    }

    if (!stat.isFile()) {
      return;
    }

    const normalizedPath = currentPath.split(path.sep).join('/');
    if (excludeSubstrings.some((item) => normalizedPath.includes(item))) {
      return;
    }

    const ext = path.extname(currentPath).toLowerCase();
    if (normalizedExtensions.has(ext)) {
      results.push(currentPath);
    }
  }

  for (const rootPath of rootPaths) {
    await visit(rootPath);
  }

  results.sort();
  return results;
}

export async function scanProjectWithSampleRegistry(config, registry) {
  if (config?.format && config.format !== 'sample-scanner-config/v1') {
    throw new Error(`Expected sample-scanner-config/v1, received ${config.format}`);
  }

  const roots = config?.roots ?? ['dist'];
  const extensions = config?.extensions ?? ['.js', '.css', '.html'];
  const excludeSubstrings = config?.exclude_substrings ?? [];
  const files = await walkFiles(roots, extensions, excludeSubstrings);
  const findings = [];

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    const bucket = inferRuleBucket(extension);
    if (!bucket) {
      continue;
    }

    const rules = registry?.[bucket] ?? [];
    if (!Array.isArray(rules) || rules.length === 0) {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const normalizedPath = filePath.split(path.sep).join('/');

    for (const rule of rules) {
      if (!rule || typeof rule !== 'object' || !rule.pattern || !rule.emit?.key || !rule.id) {
        continue;
      }

      const flags = rule.flags && rule.flags.includes('g') ? rule.flags : `${rule.flags ?? ''}g`;
      const regex = new RegExp(rule.pattern, flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const matchedText = match[0] ?? '';
        const loc = computeLocFromIndex(content, match.index, matchedText.length);
        findings.push({
          kind: 'bcd',
          ref: makeBcdRef(rule.emit.key),
          key: rule.emit.key,
          selector: normalizeRuleSelector(rule),
          evidence: [
            {
              path: normalizedPath,
              loc,
              rule: rule.id,
              snippet: matchedText.slice(0, 160),
            },
          ],
        });

        if (matchedText.length === 0) {
          regex.lastIndex += 1;
        }
      }
    }
  }

  return {
    format: 'compat-findings/v1',
    generated_at: nowIso(),
    tool: {
      scanner: 'sample-scanner/1.0.0',
      registry: registry?.version ?? 'unknown',
    },
    findings: aggregateFindings(findings),
  };
}
