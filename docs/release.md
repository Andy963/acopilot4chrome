# Releases

Releases are automated by GitHub Actions ([`.github/workflows/release.yml`](../.github/workflows/release.yml)). Pushing a version tag builds, validates, packages, and publishes the extension. No manual upload is needed.

## Branch model

- **`dev`** — integration branch. Pre-releases are cut here.
- **`main`** — formal releases only. Merge `dev` into `main` when a formal version is ready.

## Tag → channel

The workflow triggers on any `v*` tag and picks the channel from the tag name:

| Tag example                  | Channel                     | GitHub release         |
| ---------------------------- | --------------------------- | ---------------------- |
| `v0.0.2`, `v0.0.3`           | pre-release (dev)           | marked **pre-release** |
| `v0.1.0-rc.1`, `v0.2.0-beta` | pre-release (any `-suffix`) | marked **pre-release** |
| `v0.1.0`, `v0.2.0`, `v1.0.0` | formal (main)               | full release           |

Rule: a tag whose version is `0.0.x` **or** carries a semver pre-release suffix (`-…`) is published as a pre-release; every other clean `v0.y.z` (y ≥ 1) is a full release.

The workflow syncs `package.json` (and therefore the built manifest) to the tag version before building, so the packaged version always matches the tag.

## Cutting a pre-release (from `dev`)

```bash
git switch dev
# ... land work on dev ...
git tag v0.0.2
git push origin v0.0.2
```

The Action publishes a pre-release with `acopilot4chrome-0.0.2-chrome.zip` attached.

## Cutting a formal release (from `main`)

```bash
git switch main
git merge --ff-only dev      # bring dev's work to main
git tag v0.1.0
git push origin main v0.1.0
```

The Action publishes a full release with `acopilot4chrome-0.1.0-chrome.zip` attached.

## Installing a released build

1. Download the `acopilot4chrome-<version>-chrome.zip` asset from the release and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the unzipped folder.
