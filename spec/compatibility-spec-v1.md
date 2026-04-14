# Long-Lived Web App Compatibility Specification (LLWACS) v1

Status: Early public profile

This specification defines a durable, machine-readable way to describe web-platform requirements, derive browser floors from those requirements, freeze the result in a lockfile, and replay or recompute that answer later.

## 1. Design principles

1. Requirement keys are concrete.
   The executable requirement unit is a canonical compatibility key, not a broad spec family name.

2. The lockfile is the durable contract.
   Scanner internals, registries, and BCD snapshots can change. The lock preserves the normalized requirements and the recorded support decisions.

3. Replay and recompute are both first-class.
   Replay uses the support data embedded in the lock. Recompute uses the raw requirement identity plus a chosen BCD snapshot.

4. Requirement kinds stay small and explicit.
   v1 defines two requirement kinds:
   - `bcd`
   - `manual`

5. Unknown future fields do not break readers.
   Readers MUST ignore unknown fields. Writers SHOULD preserve them when rewriting artifacts.

6. Monotonicity matters.
   If support was later removed, the resolver MUST report `monotonic: false`.

## 2. Artifact set

This specification defines four artifact types:

1. `compat-findings/v1`
2. `compat-requirements/v1`
3. `compat-lock/v1`
4. `compat-resolution/v1`

## 3. Canonical identifiers

Every requirement has a stable `ref`.

- BCD requirement: `bcd:<compat-key>`
- Manual requirement: `manual:<application-defined-id>`

Examples:

- `bcd:api.IDBFactory.open`
- `bcd:css.properties.text-wrap`
- `manual:behavior.structured-clone.transfer`

## 4. Requirement identity

### 4.1 `bcd`

A BCD requirement is identified by:

- `kind = "bcd"`
- `key = <BCD compat key>`
- `selector = <statement-selection constraints>`

The selector is part of the identity because one compat entry may have multiple support statements for a browser.

### 4.2 `manual`

A manual requirement is identified by:

- `kind = "manual"`
- `id = <application-defined string>`

Manual requirements are used when an application depends on behavior that is not represented cleanly by a single BCD key.

## 5. Selector model

A BCD requirement MAY contain `selector` with these fields:

- `prefix`: string or `null`
- `alternative_name`: string or `null`
- `allow_flags`: boolean
- `allow_partial_implementation`: boolean

For standard unprefixed application code, the recommended selector is:

```json
{
  "prefix": null,
  "alternative_name": null,
  "allow_flags": false,
  "allow_partial_implementation": false
}
```

A resolver MUST apply the selector before interpreting the chosen support statement.

## 6. Support normalization

For a selected browser support statement, the resolver normalizes into one of:

- `exact`
- `conservative`
- `unknown`
- `unsupported`

Normalization rules:

- `version_added: "114"` -> `state = exact`, `from = "114"`
- `version_added: "≤79"` -> `state = conservative`, `from = "79"`
- `version_added: "preview"` -> `state = unknown`
- `version_added: true` -> `state = unknown`
- `version_added: null` -> `state = unknown`
- `version_added: false` -> `state = unsupported`

If `version_removed` is present, the normalized entry MUST set `monotonic = false`. Otherwise `monotonic = true`.

## 7. Summary semantics

For one browser, the resolver reports one of:

- `exact`
- `conservative`
- `unresolved`
- `unsatisfied`

Derived fields:

- `derived_floor`
  The exact or conservative maximum of all known per-requirement floors when the browser is satisfiable.
- `known_floor`
  The maximum known floor even when the overall result is unresolved or unsatisfied.
- `compatible_with_floor`
  Comparison of the computed answer against the declared browser floor when a floor exists for that browser.

## 8. `compat-findings/v1`

Purpose: scanner output.

Required fields:

- `format`
- `generated_at`
- `tool`
- `findings`

Each finding SHOULD already use a canonical BCD key.

Example:

```json
{
  "format": "compat-findings/v1",
  "generated_at": "2026-04-13T18:20:00Z",
  "tool": {
    "scanner": "sample-scanner/1.0.0",
    "registry": "sample-scanner-registry/1"
  },
  "findings": [
    {
      "kind": "bcd",
      "ref": "bcd:api.IDBFactory.open",
      "key": "api.IDBFactory.open",
      "selector": {
        "prefix": null,
        "alternative_name": null,
        "allow_flags": false,
        "allow_partial_implementation": false
      },
      "evidence": [
        {
          "path": "dist/app.js",
          "rule": "js/member-call/IDBFactory.open"
        }
      ]
    }
  ]
}
```

## 9. `compat-requirements/v1`

Purpose: hand-authored requirements.

Required fields:

- `format`
- `requirements`

Each entry may be:

- an explicit `bcd:<compat-key>` string
- a full `bcd` requirement object
- a full `manual` requirement object

Manual requirements use `support`, not `targets`.

Example:

```json
{
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

## 10. `compat-lock/v1`

Purpose: durable generated contract.

Required top-level fields:

- `format`
- `generated_at`
- `tool`
- `floor`
- `floor_requirements`
- `requirements`
- `summary`

### 10.1 Floor semantics

`floor` is a map of declared browser floors, such as:

```json
{
  "chrome": "120",
  "firefox": "115"
}
```

These values are policy inputs for comparison. They do not change the per-requirement BCD resolution itself.

### 10.2 Floor requirements

`floor_requirements` are normalized baseline requirements that define the starting platform assumptions for the application profile.

They are always stored in the lock and always participate in summary and resolution.

### 10.3 Omitted baseline intersection

The lock omits app requirements already satisfied by the baseline intersection implied by `floor_requirements`.

That means:

- `floor_requirements` stay explicit in the lock
- top-level `requirements` only contains app requirements outside that baseline intersection

This omission is a deliberate compression rule for the lock model.

### 10.4 Requirement entries

A BCD requirement entry includes:

- `kind`
- `ref`
- `key`
- `selector`
- `evidence`
- `resolved`

A manual requirement entry includes:

- `kind`
- `ref`
- `id`
- `support`
- `resolved`

### 10.5 Replay durability

The lock SHOULD store resolved data for every browser present in the generation-time BCD dataset so replay remains available even for browsers not listed in the declared `floor`.

## 11. `compat-resolution/v1`

Purpose: single-browser resolver output.

Required fields:

- `format`
- `browser`
- `mode`
- `state`
- `monotonic`
- `requirements`

Recommended summary fields:

- `floor`
- `derived_floor`
- `known_floor`
- `compatible_with_floor`
- `blocking_requirements`

Example:

```json
{
  "format": "compat-resolution/v1",
  "browser": "chrome",
  "mode": "replay",
  "state": "exact",
  "floor": "120",
  "derived_floor": "114",
  "known_floor": "114",
  "compatible_with_floor": true,
  "monotonic": true,
  "blocking_requirements": [
    "bcd:css.properties.text-wrap"
  ],
  "requirements": [
    {
      "ref": "bcd:css.properties.text-wrap",
      "state": "exact",
      "from": "114"
    }
  ]
}
```

## 12. Long-term durability rules

1. A lockfile MUST include BCD provenance, including package `version` and `timestamp` when available.
2. A lockfile SHOULD embed the selected support statement used for each browser decision.
3. External URLs are advisory only. A compliant resolver MUST be able to operate without network access.
4. Readers MUST ignore unknown fields.
5. Writers SHOULD preserve unknown fields.
6. Writers SHOULD sort requirements by `ref` for stable diffs.

## 13. Non-goals

This specification does not standardize:

- AST formats
- scanner implementation details
- package manager conventions
- build system integration
- a broad new taxonomy of web features

## 14. Security and trust

A lockfile is only as sound as its scanner, manual requirements, floor requirements, and chosen BCD snapshot. The lock records provenance rather than claiming universal truth.

## 15. Versioning and evolution

Future versions SHOULD add fields rather than changing the meaning of existing fields.

Breaking semantic changes MUST use a new `format` value.
