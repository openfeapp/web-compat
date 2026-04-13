# Long-Lived Web App Compatibility Specification (LLWACS) v1

Status: Early public profile

This specification defines a durable, machine-readable way to describe the browser-platform requirements of a web application, to freeze the compatibility decision made at one point in time, and to replay or recompute that decision later.

The design goal is not to replace Browser Compatibility Data (BCD), specifications, or web-platform-tests. Instead, it defines how an application should reference them and how a lockfile should preserve enough evidence to be useful decades later.

## 1. Design principles

1. **Executable requirement keys must be concrete.**
   The primary requirement unit is a canonical compatibility key, not a broad specification name. In v1, the canonical key is an `@mdn/browser-compat-data` compat key such as `api.IDBFactory.open`, `css.properties.text-wrap`, or `html.elements.dialog`.

2. **Specification URLs are provenance, not the executable lookup key.**
   A lockfile may record `spec_url` values or immutable snapshots for archival reasons, but a resolver MUST NOT depend on dereferencing those URLs in order to compute a browser version.

3. **The generated lockfile is the durable contract.**
   The scanner registry, AST rules, and BCD snapshots may evolve. The lockfile MUST preserve the concrete requirements and the exact support statements used at generation time.

4. **The system must support replay and recomputation.**
   - **Replay** uses the support statements embedded in the lockfile.
   - **Recompute** uses the raw requirement keys and a chosen external dataset snapshot.

5. **The format should avoid invented taxonomies.**
   Only two normative requirement kinds are defined in v1:
   - `bcd`: a requirement identified by a BCD compat key
   - `manual`: an application-defined requirement used when behavior cannot be captured by a single BCD key

6. **Unknown future fields must not break old tooling.**
   Readers MUST ignore unknown fields. Writers SHOULD preserve unknown fields when rewriting an artifact.

7. **A resolver must report monotonicity.**
   A "minimum version" is only a complete answer when support is monotonic after introduction. If a requirement was later removed, the resolver MUST report `monotonic: false`.

## 2. Artifacts

This specification defines four artifact types:

1. `compat-config/v1`
   Human-authored policy for lock generation.

2. `compat-findings/v1`
   Scanner output describing concrete detected requirements before lock generation.

3. `compat-lock/v1`
   The durable, generated lockfile. This is the primary long-lived artifact.

4. `compat-resolution/v1`
   Resolver output for one browser.

## 3. Canonical identifiers

### 3.1 Requirement reference string

Every requirement MUST have a stable reference string in the `ref` field.

- For BCD requirements: `bcd:<compat-key>`
- For manual requirements: `manual:<application-defined-id>`

Examples:

- `bcd:api.IDBFactory.open`
- `bcd:html.elements.dialog`
- `manual:behavior.structured-clone.transfer`

### 3.2 BCD requirement identity

A BCD requirement is identified by:

- `kind = "bcd"`
- `key = <BCD compat key>`
- `selector = <statement-selection constraints>`

The `selector` is part of the identity for recomputation because a BCD compat entry may contain multiple support statements for the same browser.

### 3.3 Manual requirement identity

A manual requirement is identified by:

- `kind = "manual"`
- `id = <application-defined string>`

A manual requirement SHOULD be used only when the application depends on behavior that cannot be reasonably represented by a single BCD compat key, such as a known semantic requirement tied to web-platform-tests or a browser bug boundary.

## 4. Requirement selection model

### 4.1 Why a selector exists

BCD browser support can be represented by:

- a single support statement
- an array of support statements
- `"mirror"` to indicate support mirroring an upstream browser

Where multiple statements exist, a resolver needs a deterministic way to pick the applicable one. For example, one statement may describe standard support while another describes a prefixed or flagged implementation.

### 4.2 Selector fields

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

## 5. Support interpretation model

For a selected browser support statement, the resolver MUST normalize it into one of four states:

- `exact`
  The earliest supporting version is known exactly.
- `conservative`
  A conservative floor is known, but the true first supporting version may be earlier. In BCD v1 practice this is caused by ranged versions such as `≤79`.
- `unknown`
  Support exists or may exist, but a dependable floor cannot be computed from the available data. This includes `true`, `null`, `preview`, dataset-missing keys, or failure to find a matching support statement.
- `unsupported`
  The requirement has no supported version in the chosen browser.

### 5.1 Normalization rules

Given the selected support statement for a browser:

- `version_added: "114"` -> `state = exact`, `from = "114"`
- `version_added: "≤79"` -> `state = conservative`, `from = "79"`
- `version_added: "preview"` -> `state = unknown`
- `version_added: true` -> `state = unknown`
- `version_added: null` -> `state = unknown`
- `version_added: false` -> `state = unsupported`

If `version_removed` is present, the normalized entry MUST set `monotonic = false`. Otherwise `monotonic = true`.

If `version_last` is absent and `version_removed` is exact, a resolver MAY derive `last_supported` from browser release ordering data.

## 6. Browser version ordering

A resolver SHOULD order versions using the browser release metadata from BCD when available. If release metadata is unavailable, a resolver MAY fall back to dotted numeric comparison.

For Chrome-like browsers, exact comparison by version number is usually sufficient, but BCD release metadata is preferred because it provides explicit release ordering and dates.

## 7. Resolver modes

### 7.1 Replay mode

Replay mode reads the `resolved` support statements embedded in the lockfile. It does not require external datasets.

Replay mode MUST be the default for long-term archival use.

### 7.2 Recompute mode

Recompute mode uses the raw requirement identity (`kind`, `key`, `selector`) from the lockfile and a chosen external BCD snapshot to compute a fresh answer.

Recompute mode SHOULD be used to detect compatibility drift or improvements in the external dataset.

## 8. Summary semantics

For one browser, the resolver MUST classify the overall result as one of:

- `exact`
  Every requirement is supported and every floor is exact.
- `conservative`
  Every requirement is supported, at least one floor is conservative, and no requirement is unknown.
- `unresolved`
  No requirement is unsupported, but at least one requirement is unknown.
- `unsatisfied`
  At least one requirement is unsupported.

### 8.1 Derived technical floor

If the overall state is `exact` or `conservative`, the resolver MUST compute `derived_technical_floor` as the maximum of all known per-requirement `from` versions.

If the overall state is `unresolved` or `unsatisfied`, `derived_technical_floor` MAY be omitted and `known_floor` MAY be provided instead.

### 8.2 Declared support floor

A config file may declare a browser support floor, such as `chrome >= 120`.

Resolver interpretation:

- If the overall state is `exact`, `compatible_with_declared_floor` MUST be `true` or `false`.
- If the overall state is `conservative`:
  - if `derived_technical_floor <= declared_support_floor`, `compatible_with_declared_floor` MUST be `true`
  - otherwise it MUST be `null` because the conservative floor may overestimate the real minimum
- If the overall state is `unresolved`, `compatible_with_declared_floor` MUST be `null`
- If the overall state is `unsatisfied`, `compatible_with_declared_floor` MUST be `false`

## 9. Long-term durability rules

1. A lockfile MUST include the BCD provenance used to generate it, including at minimum the BCD package `version` and `timestamp` when available.
2. A lockfile SHOULD embed the exact selected support statement used for each browser decision.
3. A lockfile MAY include specification URLs copied from BCD.
4. A lockfile MAY include archival specification snapshot URLs, but a resolver MUST NOT require them.
5. External URLs are advisory only. A compliant resolver MUST be able to operate without network access.
6. Readers MUST ignore unknown fields.
7. Writers SHOULD preserve unknown fields.
8. Writers SHOULD sort requirements by `ref` for stable diffs.

## 10. Why specs alone are insufficient

A broad statement such as "requires IndexedDB" is useful for humans but generally insufficient for exact version replay. Browser compatibility datasets are keyed at more specific feature granularity. Therefore v1 uses the concrete BCD key as the executable unit and treats specification URLs as provenance.

## 11. Recommended v1 profile

For the best balance of simplicity and long-term reversibility, a v1 implementation SHOULD:

1. when producing findings, prefer scanning built runtime assets (`.js`, `.css`, `.html`) rather than authoring-time source when practical
2. emit BCD requirement keys
3. include a selector for every BCD requirement, even when it is the default unprefixed selector
4. copy `spec_url` and the selected support statement into the lockfile
5. store BCD package `version` and `timestamp`
6. allow a small, explicit `manual_requirements` escape hatch
7. support both replay and recompute resolver modes

## 12. Artifact definitions

### 12.1 `compat-config/v1`

Purpose: human-authored policy.

Scanner configuration is intentionally out of scope for this artifact. Tools MAY colocate scanner settings alongside this document, but compliant lock generators MUST only depend on the fields defined here.

Required fields:

- `format`
- `targets`

Recommended fields:

- `manual_requirements`

Example:

```json
{
  "format": "compat-config/v1",
  "targets": {
    "chrome": "120"
  },
  "manual_requirements": [
    {
      "kind": "manual",
      "id": "behavior.structured-clone.transfer",
      "title": "Structured clone transfer semantics",
      "targets": {
        "chrome": "104"
      },
      "reason": "Depends on behavior tracked by WPT.",
      "source": [
        "wpt:html/webappapis/structured-clone/..."
      ]
    }
  ]
}
```

### 12.2 `compat-findings/v1`

Purpose: scanner output.

How a scanner is configured, how it traverses inputs, and whether it uses regexes, ASTs, parsers, or build metadata are all intentionally out of scope for this specification.

Required fields:

- `format`
- `generated_at`
- `tool`
- `findings`

Each finding SHOULD already use the canonical BCD key.

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
          "loc": "120:17-120:32",
          "rule": "js/member-call/IDBFactory.open"
        }
      ]
    }
  ]
}
```

### 12.3 `compat-lock/v1`

Purpose: durable generated contract.

Required fields:

- `format`
- `generated_at`
- `tool`
- `targets`
- `requirements`
- `summary`

A BCD requirement entry MUST include:

- `kind`
- `ref`
- `key`
- `selector`
- `evidence`
- `resolved`

A manual requirement entry MUST include:

- `kind`
- `ref`
- `id`
- `targets`
- `resolved`

Example BCD requirement entry:

```json
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
  "spec": [
    "https://w3c.github.io/IndexedDB/#dom-idbfactory-open"
  ],
  "evidence": [
    {
      "path": "dist/app.js",
      "loc": "120:17-120:32",
      "rule": "js/member-call/IDBFactory.open"
    }
  ],
  "resolved": {
    "chrome": {
      "state": "exact",
      "from": "23",
      "monotonic": true,
      "statement": {
        "version_added": "23"
      }
    }
  }
}
```

### 12.4 `compat-resolution/v1`

Purpose: a single-browser resolver result.

Required fields:

- `format`
- `browser`
- `mode`
- `state`
- `monotonic`
- `requirements`

Example:

```json
{
  "format": "compat-resolution/v1",
  "browser": "chrome",
  "mode": "replay",
  "state": "exact",
  "derived_technical_floor": "114",
  "declared_support_floor": "120",
  "compatible_with_declared_floor": true,
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

## 13. Non-goals

This specification deliberately does not standardize:

- AST formats
- scanner implementation details
- package manager conventions
- build system integration
- a broad new taxonomy of web features

## 14. Security and trust

A lockfile can only be as sound as its scanner, manual overrides, and chosen BCD snapshot. The lockfile therefore records provenance rather than claiming universal truth.

Resolvers SHOULD treat `manual` requirements as trusted input from the application author.

## 15. Versioning and evolution

Future versions of this specification SHOULD add fields rather than changing the meaning of existing fields.

Breaking semantic changes MUST use a new `format` value.


## 16. Informative references

- MDN Browser Compatibility Data (BCD)
- WHATWG Living Standards and snapshot links
- W3C standards and dated snapshots
- web-platform-tests and wpt.fyi
