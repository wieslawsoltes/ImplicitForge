# GitHub Pages deployment

Live application: https://wieslawsoltes.github.io/ImplicitForge/

Portable edition: https://wieslawsoltes.github.io/ImplicitForge/ImplicitForge.html

The complete application, standalone packages, examples, documentation, tests and generated distributions are checked into `main`. This is not an archive-only repository.

## Deployment pipeline

`.github/workflows/pages.yml` runs on pushes to `main` and supports manual dispatch. It builds all twelve standalone ESM packages and the portable HTML application, checks source syntax, runs the regression suite, and publishes `dist/` using GitHub's Pages artifact deployment. The `github-pages` environment records the deployed URL. Deployment has concurrency control and uses only the built-in GitHub token and OIDC; it does not need an npm token, personal access token or third-party host.

The site uses relative URLs and includes documentation, screenshots, example projects, package sources and bundles, and the GPU verification harness. `scripts/build.mjs` copies these files into `dist/`, including `.nojekyll`. No server-side services are required.

After publishing, `scripts/verify-pages.mjs` checks that `deployment.json` identifies the exact expected commit and verifies 24 public entry points and assets. It verifies HTTP status, nonempty responses, JavaScript/CSS/image MIME types, and parseable example project JSON. Bounded propagation retries tolerate a temporarily stale CDN edge without silently accepting an old deployment.

## Source import and verification

The supplied source ZIP has SHA-256 `ea2886ff9dae96e9adcd6d2f2ad1ef56f7be452f714312d69d96e28dff2b114c`. Its text sources were transferred using a SHA-256-verified compressed archive, expanded into ordinary repository files, and the temporary transfer files and workflow were removed after import. Bundles and the portable application were rebuilt from those sources. The five documentation screenshots were refreshed by the actual 21-step Chromium workbench regression, rather than copied as unverified images.

The import run passed all 96 unit/package tests and all 21 browser checks. Reports are in `docs/unit-tests.tap`, `docs/browser-tests.json`, and `docs/browser-tests.log`. The browser regression deliberately used software rendering; this is not a claim of hardware WebGPU validation. `tests/gpu.html` remains the explicit GPU validation harness.

The original Node 20/22 validation matrix is retained in `.github/workflows/validate.yml`.

## Local reproduction

```sh
npm run build
npm run check
npm test
npm start
```

To reproduce the browser check with Python Playwright and an installed Chromium executable:

```sh
CHROMIUM=/path/to/chromium CHROMIUM_ARGS='--disable-gpu --disable-webgl' python tests/browser_smoke.py
```

To independently verify a published commit:

```sh
node scripts/verify-pages.mjs https://wieslawsoltes.github.io/ImplicitForge/ EXPECTED_COMMIT_SHA
```
