# Release Runbook

This repository currently uses a manual release process.

Current constraints:

- There is no CI workflow in this repository.
- There is no automated release script.
- npm publishing and GitHub release creation are manual steps.

## Prerequisites

- npm access for `@openfeapp/web-compat`
- git push access to `https://github.com/openfeapp/web-compat`
- a clean local checkout of the release branch

## Release Steps

1. Verify the working tree is clean.

```bash
git status --short
```

2. Update `package.json` to the intended release version.

3. Run the full test suite.

```bash
npm test
```

4. Inspect the publish tarball.

```bash
npm pack --dry-run
```

Confirm the tarball contains the expected public surface:

- `LICENSE`
- `README.md`
- `package.json`
- `bin/`
- `src/`
- `schemas/`
- `spec/`

5. Optionally smoke-check the public CLIs locally.

```bash
node bin/compat-generate-config.mjs --help
node bin/compat-generate-lock.mjs --help
node bin/compat-resolve.mjs --help
```

6. Commit the release changes.

```bash
git add .
git commit -m "release: v0.1.x"
```

7. Create an annotated tag matching the npm version.

```bash
git tag -a v0.1.x -m "v0.1.x"
```

8. Publish to npm.

```bash
npm publish
```

9. Push the release commit and tag.

```bash
git push origin main
git push origin v0.1.x
```

10. Create the GitHub release.

- Open the tag in the GitHub Releases UI.
- Title the release `v0.1.x`.
- Summarize the user-facing CLI/schema/doc changes.

11. Optionally smoke-check the published package from a clean directory.

```bash
npm install @openfeapp/web-compat@0.1.x
npx compat-generate-config --help
npx compat-generate-lock --help
npx compat-resolve --help
```

## Notes

- If `npm pack --dry-run` fails because of a local npm cache permissions issue, rerun it with a temporary cache:

```bash
npm_config_cache=/tmp/openfeapp-npm-cache npm pack --dry-run
```

- Keep the version in `package.json`, the git tag, and the published npm version aligned.
