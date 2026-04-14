# `@openfeapp/web-compat`

STATUS: v0 WIP

`@openfeapp/web-compat` owns the durable compatibility artifacts and the floor derivation logic for OpenFE-style web apps.

This package turns:

- `compat-findings/v1` + floor requirements + additional requirements + BCD into `compat-lock/v1`
- `compat-lock/v1` into `compat-resolution/v1`

It does not define a production scanner. Scanners stay replaceable. The stable contract is the artifact model in this repository.

## Public package surface

Published package contents:

- `spec/compatibility-spec-v1.md`
- `schemas/`
- `bin/compat-generate-lock.mjs`
- `bin/compat-resolve.mjs`
- `src/`

Published CLI commands:

- `compat-generate-lock`
- `compat-resolve`

Each public CLI supports `-h` and `--help`.

## Install

```bash
npm install -D @openfeapp/web-compat @mdn/browser-compat-data
```

## Core workflow

Generate a lock from findings:

```bash
compat-generate-lock \
  --findings path/to/compat.findings.json \
  --floor chrome=120,firefox=115 \
  --floor-requirements path/to/floor-a.requirements.json,path/to/floor-b.requirements.json \
  --additional-requirements path/to/additional-a.requirements.json,path/to/additional-b.requirements.json \
  --out path/to/compat.lock.json
```

`--floor-requirements` is optional. If omitted, no floor requirements are applied. `--floor-requirements` and `--additional-requirements` both accept comma-separated file lists.

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

## Artifact model

Normative artifacts:

- `compat-findings/v1`
- `compat-requirements/v1`
- `compat-lock/v1`
- `compat-resolution/v1`

### `compat-findings/v1`

Scanner output. Findings are concrete BCD requirements plus evidence.

### `compat-requirements/v1`

Hand-authored requirements that are not coming directly from the scanner.

This artifact accepts:

- explicit string refs such as `bcd:api.IDBFactory.open`
- full `bcd` requirement objects
- full `manual` requirement objects with a `support` map

Example:

```json
{
  "$schema": "https://raw.githubusercontent.com/openfeapp/web-compat/main/schemas/compat.requirements.v1.schema.json",
  "format": "compat-requirements/v1",
  "requirements": [
    "bcd:api.IDBFactory.open",
    {
      "kind": "manual",
      "id": "behavior.structured-clone.transfer",
      "support": {
        "chrome": "104",
        "firefox": "94"
      },
      "source": [
        "https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializewithtransfer"
      ]
    }
  ]
}
```

### `compat-lock/v1`

The generated lock stores:

- the declared browser `floor`
- the normalized `floor_requirements`
- the remaining app `requirements`
- per-browser summaries and replay data
- BCD provenance

`floor_requirements` are stored separately and always participate in resolution. App requirements already satisfied by the baseline intersection implied by those floor requirements are omitted from the top-level `requirements` list.

### `compat-resolution/v1`

Resolver output for one browser. It reports:

- `floor`
- `derived_floor`
- `known_floor`
- `compatible_with_floor`
- `blocking_requirements`
- per-requirement replay or recompute details

## Examples

Example files in `examples/`:

- `compat.findings.json`
- `floor.requirements.indexeddb.json`
- `floor.requirements.dialog.json`
- `additional.requirements.transfer.json`
- `additional.requirements.share.json`
- `bcd.fixture.json`
- `compat.lock.json`
- `compat.resolution.replay.json`
- `compat.resolution.recompute.json`
- `sample-scanner/config.json`
- `sample-scanner/registry.json`

Generate the sample lock:

```bash
node bin/compat-generate-lock.mjs \
  --findings examples/compat.findings.json \
  --floor chrome=120 \
  --floor-requirements examples/floor.requirements.indexeddb.json,examples/floor.requirements.dialog.json \
  --additional-requirements examples/additional.requirements.transfer.json,examples/additional.requirements.share.json \
  --bcd examples/bcd.fixture.json \
  --out examples/compat.lock.json
```

## Repo-only sample scanner

This repo includes a regex-based sample scanner for tests and examples only. It is not part of the npm package surface.

Run it from the repository root:

```bash
node scripts/sample-scanner/sample-scan.mjs \
  --config examples/sample-scanner/config.json \
  --registry examples/sample-scanner/registry.json \
  --out examples/compat.findings.json
```

## Using real BCD

You can either:

- pass `--bcd path/to/bcd.json`
- install `@mdn/browser-compat-data` and omit `--bcd`

The included fixture files stay intentionally small so examples and tests remain deterministic.

## Testing

```bash
npm test
```
