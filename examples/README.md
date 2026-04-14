# Examples

This directory contains a compact end-to-end example set for `@openfeapp/web-compat`.

Files:

- `example-app/dist/`
  Sample built assets used as scanner input.
- `sample-scanner/config.json`
  Input config for the repo-only sample scanner.
- `sample-scanner/registry.json`
  Regex-based demo registry for the sample scanner.
- `compat.findings.json`
  Example scanner output.
- `floor.requirements.indexeddb.json`
  Example `--floor-requirements` file contributing IndexedDB.
- `floor.requirements.dialog.json`
  Example `--floor-requirements` file contributing `<dialog>`.
- `additional.requirements.transfer.json`
  Example `--additional-requirements` file contributing a manual semantic requirement.
- `additional.requirements.share.json`
  Example `--additional-requirements` file contributing a BCD requirement.
- `bcd.fixture.json`
  Tiny deterministic BCD fixture used by tests and examples.
- `compat.lock.json`
  Example generated lock.
- `compat.resolution.replay.json`
  Replay-mode resolution for the example lock.
- `compat.resolution.recompute.json`
  Recompute-mode resolution for the example lock.
