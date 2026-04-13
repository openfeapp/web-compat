# `@openfeapp/web-compat`

This is an early public `0.1.0` release of the lock-generation and resolution tooling.

`web-compat` owns the durable artifact model and the tooling for:

- `compat-findings/v1 -> compat-lock/v1`
- `compat-lock/v1 -> compat-resolution/v1`

This package does not define or publish a production scanner. Scanners are expected to be replaceable, and the only durable contract is the artifact model described by the spec and schemas in this repository.

## Public package surface

Published package contents:

- `spec/compatibility-spec-v1.md`
- `schemas/`
- `bin/compat-generate-config.mjs`
- `bin/compat-generate-lock.mjs`
- `bin/compat-resolve.mjs`
- `src/`

`src/` is shipped as implementation detail for the CLIs and artifact helpers, not as a separately versioned import API.

Published CLI commands:

- `compat-generate-config`
- `compat-generate-lock`
- `compat-resolve`

Each public CLI supports `-h` and `--help`.

## Install

```bash
npm install -D @openfeapp/web-compat @mdn/browser-compat-data
```

## Core workflow

Generate a starter config:

```bash
compat-generate-config \
  --target chrome=120,firefox=115 \
  --out path/to/compat.config.json
```

If `--out` is omitted, the config is printed to stdout. `--target` is required.

Generate a lockfile from an existing findings artifact:

```bash
compat-generate-lock \
  --config path/to/compat.config.json \
  --findings path/to/findings.json \
  --bcd path/to/bcd.json \
  --out path/to/compat.lock.json
```

Replay the recorded answer:

```bash
compat-resolve \
  --lock path/to/compat.lock.json \
  --browser chrome \
  --mode replay
```

Recompute from BCD:

```bash
compat-resolve \
  --lock path/to/compat.lock.json \
  --browser chrome \
  --mode recompute \
  --bcd path/to/bcd.json
```

## Config and artifacts

Normative artifacts:

- `compat-config/v1`
- `compat-findings/v1`
- `compat-lock/v1`
- `compat-resolution/v1`

`compat-config/v1` is policy for lock generation. In this repo that means browser targets plus optional `manual_requirements`. Scanner-specific input selection is intentionally outside the public config contract.

## Repo-only sample scanner

This repo includes a regex-based sample scanner for tests and examples only. It is not part of the npm package surface and it is not normative.

Repo-only sample scanner files:

- `scripts/sample-scanner/sample-scan.mjs`
- `scripts/sample-scanner/sample-scanner-core.mjs`
- `scripts/sample-scanner/sample-scanner.config.v1.schema.json`
- `examples/sample-scanner.config.json`
- `examples/sample-scanner.registry.json`

Run it from the repository root to produce sample findings:

```bash
node scripts/sample-scanner/sample-scan.mjs \
  --config examples/sample-scanner.config.json \
  --registry examples/sample-scanner.registry.json \
  --out examples/out.findings.json
```

That sample scanner exists to show one way findings can be produced before they are handed to the published lock/resolution tooling. A production scanner may use regexes, ASTs, HTML/CSS parsers, build graph metadata, or imported findings from another tool.

## Using real BCD

The lock generator and resolver are designed to work with a real `@mdn/browser-compat-data` dataset.

You can either:

- pass `--bcd path/to/bcd.json`
- install `@mdn/browser-compat-data` and omit `--bcd`

The included fixture files are intentionally tiny so examples and tests remain deterministic.

## Testing

```bash
npm test
```
