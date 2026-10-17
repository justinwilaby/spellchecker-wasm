# Upgrade Plan: TypeScript 3.8.3 → TypeScript 7 + Node.js 12 → Node.js 24 + Webpack Removal

# Instructions to Assistant
## Code Search and Structural Matching

- Prefer `ast-grep` when a search depends on syntax: calls, method chains, implementations, control-flow shapes, or
  other structural patterns. For Rust, start with `ast-grep --lang rust -p '<pattern>'` and use metavariables such as
  `$EXPRESSION` and `$$$ARGUMENTS`.
- Use `rg` or `rg --files` for literal text, regular expressions, filenames, configuration, documentation, logs, and
  initial discovery when the desired syntax shape is unknown.
- Inspect matches before applying an `ast-grep` rewrite, scope transformations narrowly, and review the resulting diff.
  Use `ast-grep --help` for relational rules, constraints, and advanced rewrites.

## Task Planning and Sub-Agent Delegation

Use delegation to keep the primary assistant's context focused, parallelize independent investigation, and obtain
independent implementation, testing, or review perspectives. Delegation is proportional to the task: handle small,
tightly coupled changes directly, and use sub-agents when work can be separated by responsibility or file ownership.
Plans should identify useful delegation boundaries, dependencies, shared-file risks, and acceptance evidence without
requiring a fixed number of agents, fixed roles, or a prescribed sequence.

The orchestrator remains accountable for the complete result. It must:

- read the complete request, plan, and applicable repository instructions itself;
- inspect the working tree and preserve unrelated user changes;
- define scope, invariants, public contracts, completion criteria, and validation expectations before delegating;
- give each agent a bounded responsibility, explicit file access, and permission or prohibition to edit;
- avoid concurrent edits to the same file and sequence dependent work when agents share a worktree;
- independently inspect agent findings, edits, and the combined diff rather than accepting completion claims;
- resolve conflicts between implementation choices, test expectations, and review findings;
- perform or confirm final validation and report results, residual risks, and pre-existing failures.

Do not delegate interpretation of `AGENTS.md`, final scope decisions, destructive Git operations, or final acceptance.
Keep the task tree shallow and auditable; sub-agents should not create further agents unless the plan explicitly calls
for deeper delegation and the orchestrator retains clear ownership.

Every delegated task should provide the smallest context packet that allows independent work:

```text
Objective and completion criteria:
Allowed files and edit permissions:
Relevant reference files and repository instructions:
Behavioral invariants and public contracts:
Known baseline behavior or failures:
Required validation:
Explicit non-goals:
Expected handoff:
```

Keep assignments focused and avoid asking an agent to rediscover the whole architecture. Agents must read the relevant
files before editing, inspect affected call sites, preserve contracts, avoid unrelated cleanup, and never weaken a test
merely to make it pass. A handoff should list inspected or modified files, decisions, commands and results, findings,
and unresolved concerns. Review findings should be ordered by severity and include exact locations, triggering
conditions, and minimal remedies; avoid speculative style-only feedback.

Parallelize read-only investigation and edits to disjoint files. Re-read current contents before integrating advice or
patches because another agent may have changed the shared worktree. When delegation is unavailable or not worthwhile,
the primary assistant should still keep implementation, verification, and review as distinct responsibilities. If work
cannot proceed without guessing about scope, contracts, ownership, or overlapping changes, stop and report the exact
location, conflicting invariant, and smallest viable options.

## Executive Summary

This plan covers a major platform upgrade for the `spellchecker-wasm` project:

| Aspect | Current | Target |
|--------|---------|--------|
| **Node.js** | >= 12.0.0 (EOL) | >= 24.0.0 (Active LTS through Apr 2028) |
| **TypeScript** | 3.8.3 (May 2020) | 7.0 (July 2026 — Go-native compiler, 8–10x faster) |
| **Test Framework** | Mocha 7 + Expect.js + nyc | `node:test` + `assert` (zero 3rd-party test deps) |
| **Bundle Build** | webpack 4 → UMD | Zero bundler — native ESM output from `tsc` |

**Net result:** 17 devDependencies → 4 essential devDependencies. Eliminate all test frameworks, all bundlers, and all tooling that Node.js 24 provides natively.

**Important:** This plan converts the entire package to ESM-only (`"type": "module"`). Existing consumers will need to use the `exports` field or import via `<script type="module">`. See the ESM Migration section for details.

---

## Part 0: devDependency Audit — Every Package Mapped to Intrinsics

Here is a package-by-package analysis of **every `devDependency` in the current `package.json`**, mapped to whether Node.js 24 provides an intrinsic replacement.

### Current `devDependencies` (17 packages)

```json
{
  "@istanbuljs/nyc-config-typescript": "^0.1.3",
  "@types/expect.js": "^0.3.29",
  "@types/mocha": "^5.2.7",
  "@types/node": "^12.0.8",
  "coveralls": "^3.0.6",
  "expect.js": "^0.3.1",
  "http-server": "^0.12.3",
  "mocha": "^7.1.1",
  "mocha-chrome": "2.2.0",
  "nyc": "^15.0.1",
  "source-map-support": "^0.5.16",
  "ts-loader": "^6.2.2",
  "ts-node": "^8.8.1",
  "typescript": "^3.8.3",
  "webpack": "^4.42.1",
  "webpack-cli": "^3.3.11",
  "yargs": "^15.3.1"
}
```

### Package-by-Package Mapping

| # | Package | Current Purpose | Node.js 24 Intrinsic? | Decision | Action |
|---|---------|----------------|----------------------|----------|--------|
| 1 | `@istanbuljs/nyc-config-typescript` | Configure nyc for TS source maps | **YES** — `node:test --experimental-test-coverage` natively handles `.ts` files with `--enable-source-maps` | **REMOVE** | Covered by intrinsic |
| 2 | `@types/expect.js` | Type definitions for `expect.js` assertions | **YES** — `node:assert/strict` replaces `expect.js` entirely; no types needed (built-in) | **REMOVE** | Replaced by `node:assert/strict` |
| 3 | `@types/mocha` | Type definitions for Mocha test framework | **YES** — `node:test` is built-in and typed; no `@types` package needed | **REMOVE** | Covered by intrinsic |
| 4 | `@types/node` | Type definitions for Node.js globals (`Buffer`, `process`, `fs`, etc.) | **NO** — Still needed for `tsc` type-checking and producing `.d.ts` output | **KEEP** | Update to latest (pin to `^22.0.0` or `^20.0.0` for TS 7 compatibility) |
| 5 | `coveralls` | Upload coverage reports to Coveralls.io | **NO** — CI-specific; not intrinsic to Node.js | **KEEPCONDITIONAL** | Keep if CI uses Coveralls; otherwise remove |
| 6 | `expect.js` | Test assertion library (`expect(...).to.eql(...)`, `expect(...).to.be.ok()`) | **YES** — `node:assert/strict` provides `deepStrictEqual()`, `notStrictEqual()`, `strictEqual()`, `ok()` | **REMOVE** | Replaced by `node:assert/strict` |
| 7 | `http-server` | Simple HTTP server for dev/testing | **PARTIAL** — Not an intrinsic, but `npx serve` or a 5-line native `http.createServer()` script can replace it | **REMOVE** | Delete; not needed for library publishing or tests |
| 8 | `mocha` | Test runner (`describe`, `it`, `beforeEach`, `afterEach`, `--recursive`, `--spec`) | **YES** — `node:test` provides identical `describe()`/`it()` syntax, plus `beforeEach()`/`afterEach()`, `--watch`, `--test`, coverage reporting | **REMOVE** | Replaced by `node:test` |
| 9 | `mocha-chrome` | Run Mocha tests in a headless Chrome browser | **NO** — Requires Puppeteer or Playwright; but this package is likely unused/deprecated | **REMOVE** | Replace with Puppeteer for browser tests if still needed |
| 10 | `nyc` | Code coverage tool (`--reporter=text`, `--reporter=lcov`) | **YES** — `--experimental-test-coverage` produces coverage reports in lcov, text, and json formats | **REMOVE** | Replaced by `node:test --experimental-test-coverage` |
| 11 | `source-map-support` | Polyfill source maps for readable stack traces | **YES** — `--enable-source-maps` flag (stable) in Node.js 24 natively handles source map support for stack traces | **REMOVE** | Replaced by `--enable-source-maps` |
| 12 | `ts-loader` | webpack loader to compile TypeScript to JavaScript | **YES** — No longer needed because webpack is being removed entirely; `tsc` alone produces production-ready ESM | **REMOVE** | Covered by webpack removal + `tsc` only |
| 13 | `ts-node` | Run TypeScript files directly without compiling | **YES** — Native type stripping enabled by default for `.ts` files in Node.js 24; run `node file.ts` directly | **REMOVE** | Replaced by native type stripping |
| 14 | `typescript` | TypeScript compiler (`tsc`) | **NO** — Still needed for `tsc --noEmit` type-checking in CI and producing `.d.ts` declaration files | **KEEP** | Update to `^7.0.0` |
| 15 | `webpack` | Module bundler (UMD output for browser) | **YES** — No bundler needed; `tsc` alone produces clean ESM; `fetch`/`TextEncoder`/`ReadableStream` are native globals | **REMOVE** | Replaced by zero-bundler approach |
| 16 | `webpack-cli` | CLI for webpack | **YES** — Covered by webpack removal | **REMOVE** | Covered by webpack removal |
| 17 | `yargs` | CLI argument parsing (`./bin/spellchecker` CLI tool) | **NO** — Still needed for the `spellcheck` CLI binary's argument parsing | **KEEP** | Update to `^17.0.0` |

### Summary: 17 Packages → 4 Essential DevDependencies

| Category | Packages | Count |
|----------|----------|-------|
| **REMOVE (intrinsic replacement)** | `@istanbuljs/nyc-config-typescript`, `@types/expect.js`, `@types/mocha`, `expect.js`, `http-server`, `mocha`, `mocha-chrome`, `nyc`, `source-map-support`, `ts-loader`, `ts-node`, `webpack`, `webpack-cli` | **13** |
| **KEEP (still needed)** | `@types/node`, `typescript`, `yargs` | **3** |
| **CONDITIONAL** | `coveralls` (keep only if CI uses Coveralls) | **0–1** |

**Net: 17 → 3–4 devDependencies (78–82% reduction)**

---

## Part 1: TypeScript 3.8.3 → TypeScript 7

### What Is TypeScript 7

TypeScript 7.0 shipped on July 8, 2026. It is a complete rewrite of the TypeScript compiler in Go (codename "Corsa").

- **8–10x faster** builds on real projects
- **Same language syntax** — no new TS features in 7.0, just a native compiler engine
- **Adopts all of TypeScript 6.0's breaking changes and new defaults**
- No stable programmatic API yet (coming in 7.1) — not relevant for this project

### TypeScript 7 Breaking Changes (from 6.0)

| Change | Previous Default | New Default | Impact on This Project |
|--------|-----------------|-------------|----------------------|
| `strict` | `false` | `true` | Surfaces latent type issues; codebase is clean enough to pass |
| `module` | `commonjs` | `esnext` | Affects `tsc` output; webpack removed, so output is ESM by default |
| `moduleResolution` | `node`-like | `bundler` | Appropriate for zero-bundler approach |
| `types` | auto-includes all `@types/*` | `[]` (explicit only) | Must explicitly list `@types/node` |
| `target` | ~ES2017 | latest stable before `esnext` | May affect lib selection |
| `rootDir` | inferred | defaults to `./` | Must explicitly set `rootDir: "src/js"` |
| `noUncheckedSideEffectImports` | `false` | `true` | Stricter import safety |
| `target: es5` | supported | hard error (removed) | N/A — project already uses `esnext` |
| `module: umd/amd/systemjs` | supported | hard error (removed) | N/A — webpack output is UMD, not `tsc` output |
| `downlevelIteration` | supported | hard error (removed) | N/A |
| `baseUrl` | supported | hard error (removed) | N/A |
| `moduleResolution: classic` | supported | hard error (removed) | N/A |

---

## Part 2: Node.js 12 → Node.js 24

### Node.js 24 Capabilities Relevant to This Project

| Current 3rd-Party Package | Node.js 24 Intrinsic Replacement | Status |
|---------------------------|----------------------------------|--------|
| `mocha` + `expect.js` | `node:test` + `node:assert/strict` | Replaced |
| `nyc` | `--experimental-test-coverage` | Replaced |
| `source-map-support` | `--enable-source-maps` flag | Replaced |
| `ts-node` | Native type stripping (on by default for `.ts`) | Replaced |
| `@istanbuljs/nyc-config-typescript` | Covered by `node:test --experimental-test-coverage` | Replaced |
| `@types/mocha` | `node:test` is built-in and typed | Replaced |
| `@types/expect.js` | `node:assert/strict` is built-in, no types needed | Replaced |
| `webpack` | Zero bundler — `tsc` emits clean ESM | Replaced (webpack removed) |
| `webpack-cli` | Covered by webpack removal | Replaced |
| `webpack` (ts-loader) | Covered by webpack removal | Replaced |

---

## Part 3: Webpack Removal (Zero-Bundler Approach)

### Why Remove Webpack

The project's browser code has **zero external npm dependencies**. It uses only native browser globals (`fetch`, `TextEncoder`, `TextDecoder`, `ReadableStreamDefaultReader`). There is literally nothing to bundle.

### How to Remove Webpack

1. **Delete `webpack.config.ts`** — no longer needed
2. **Delete `webpack` and `webpack-cli` from `devDependencies`** — covered by intrinsic approach
3. **Add browser-specific `tsconfig.browser.json`** — separate `tsc` invocation targeting `lib/browser/` as ESM
4. **Add `type: "module"` to `package.json`** — makes `.js` files ESM by default
5. **Add `exports` field to `package.json`** — conditional exports for `node` vs browser `default`
6. **Replace `lib/browser/index.js`** (webpack UMD output) with a simple ESM re-export file

### How Browser Consumers Would Use It After Webpack Removal

```html
<!-- Native browser (no bundler) -->
<script type="module">
  import SpellcheckerWasm from './spellchecker-wasm/lib/browser/index.js';

  async function init() {
    const spellchecker = new SpellcheckerWasm();
    await spellchecker.prepareSpellchecker(
      fetch('/spellchecker-wasm.wasm'),
      fetch('/frequency_dictionary_en_82_765.txt.gz')
    );
    spellchecker.checkSpelling('helo');
  }
  init();
</script>
```

```javascript
// Bundled consumer (Vite, esbuild, Webpack 5, etc.)
import SpellcheckerWasm from 'spellchecker-wasm';
// Works exactly as before. The bundler resolves via "default" condition.
```

---

## Part 4: Full Updated package.json

```json
{
  "name": "spellchecker-wasm",
  "version": "0.3.3",
  "repository": "https://github.com/justinwilaby/spellchecker-wasm",
  "description": "An extremely fast multi-thread capable Spellchecker written in Rust compiled to WebAssembly for Node.",
  "type": "module",
  "main": "./lib/nodejs/index.js",
  "exports": {
    ".": {
      "node": "./lib/nodejs/index.js",
      "default": "./lib/browser/index.js"
    }
  },
  "files": [
    "lib",
    "bin"
  ],
  "scripts": {
    "test": "node --test --enable-source-maps 'src/js/**/*.spec.ts'",
    "test:watch": "node --test --watch --enable-source-maps 'src/js/**/*.spec.ts'",
    "test:coverage": "node --test --enable-source-maps --experimental-test-coverage 'src/js/**/*.spec.ts'",
    "test:web-integration": "node --enable-source-maps 'src/js/__tests__/web-integration.js'",
    "build:wasm": "rustc ./src/lib.rs -Clto -O --crate-type cdylib --target wasm32-unknown-unknown -o ./lib/spellchecker-wasm.wasm",
    "bindgen": "wasm-bindgen lib/spellchecker-wasm.wasm --out-dir lib/ --remove-name-section --no-typescript --out-name spellchecker-wasm.wasm",
    "build:ts": "tsc",
    "build:browser": "tsc -p tsconfig.browser.json",
    "build": "npm run build:ts && npm run build:browser && npm run build:wasm && npm run bindgen",
    "postinstall": "node ./bin/decompress"
  },
  "keywords": [
    "spellchecker",
    "spell-checker",
    "spelling",
    "electron",
    "wasm",
    "webassembly",
    "node",
    "symspell"
  ],
  "author": "Justin Wilaby",
  "license": "MIT",
  "engines": {
    "node": ">=24.0.0"
  },
  "bin": {
    "spellcheck": "./bin/spellchecker"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^7.0.0",
    "yargs": "^17.0.0"
  }
}
```

---

## Part 5: Updated `tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "ES2020",
    "target": "ES2020",
    "outDir": "lib",
    "declaration": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "strict": true,
    "rootDir": "src/js",
    "types": ["node"],
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src/js/**/*.ts"],
  "exclude": ["src/js/**/*.spec.ts"]
}
```

Key changes:
- `module: "ES2020"` instead of `commonjs` — produces ESM output (required for `type: "module"` package)
- `moduleResolution: "node"` — modern resolution strategy
- `strict: true` — TS 7 default
- `types: ["node"]` — explicit listing (TS 7 default is `[]`)
- `rootDir: "src/js"` — explicit (TS 7 defaults `rootDir` to `./`)
- `target: "ES2020"` — modern target
- `lib: ["ES2020", "DOM"]` — includes DOM for WebAssembly + browser types

---

## Part 6: New `tsconfig.browser.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "lib/browser"
  },
  "include": ["src/js/browser/**/*.ts"]
}
```

This simply redirects the browser build output to `lib/browser/` while inheriting all other options from the base `tsconfig.json`.

---

## Part 7: New `lib/browser/index.js`

```javascript
export * from '../SuggestedItem.js';
export * from './SpellcheckerWasm.js';
```

A simple 4-line ESM re-export file, replacing the webpack UMD output.

---

## Part 8: Build Script Changes

| Old Script | New Script | Notes |
|-----------|-----------|-------|
| `"test": "nyc --reporter=text mocha"` | `"test": "node --test --enable-source-maps 'src/js/**/*.spec.ts'"` | Replaces mocha + nyc with `node:test` |
| `"test:coveralls": "npm run test && nyc report --reporter=text-lcov \| coveralls"` | `"test:coverage": "node --test --enable-source-maps --experimental-test-coverage 'src/js/**/*.spec.ts'"` | Inline coverage via `node:test`; remove `test:coveralls` |
| `"test:web-integration": "node ./src/js/__tests__/web-integration.js"` | `"test:web-integration": "node --enable-source-maps 'src/js/__tests__/web-integration.js'"` | Add source maps support |
| `"build:ts": "tsc"` | `"build:ts": "tsc"` | Unchanged |
| `"webpack": "webpack"` | `"build:browser": "tsc -p tsconfig.browser.json"` | Replace webpack with browser-specific `tsc` |
| `"build": "npm run build:ts && npm run webpack && npm run build:wasm && npm run bindgen"` | `"build": "npm run build:ts && npm run build:browser && npm run build:wasm && npm run bindgen"` | Replace `webpack` with `build:browser` |
| `"postinstall": "node ./bin/decompress"` | Unchanged | No change needed |

---

## Part 9: Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `package.json` | **Modify** | Update `engines.node` to `>=24.0.0`, add `type: "module"`, add `exports` field, replace all devDependencies (17 → 3–4), update scripts |
| `tsconfig.json` | **Rewrite** | TS 7 defaults (`strict`, `types`, `rootDir`), `module: ES2020`, `moduleResolution: node` |
| `tsconfig.browser.json` | **Create** | Browser-specific tsconfig extending base, outputting to `lib/browser/` |
| `webpack.config.ts` | **Delete** | No longer needed (zero-bundler approach) |
| `lib/browser/index.js` | **Replace** | Replace webpack UMD output with 4-line ESM re-export |

### Files to Delete

| File | Reason |
|------|--------|
| `webpack.config.ts` | webpack removed entirely |
| `.mocharc.js` | Mocha removed; replaced by `node --test` |
| `.nycrc` | nyc removed; replaced by `--experimental-test-coverage` |

### Files to Rewrite (Test File)

| File | Action | Description |
|------|--------|-------------|
| `src/js/__tests__/SpellcheckerWasm.spec.ts` | **Rewrite** | Mocha + expect.js → `node:test` + `node:assert/strict` |

### Files That Should Remain Unchanged (but regenerate on build)

| File | Reason |
|------|--------|
| `src/js/SpellCheckerBase.ts` | Clean code; should compile under TS 7 with zero changes |
| `src/js/SuggestedItem.ts` | Simple class; no changes needed |
| `src/js/nodejs/SpellcheckerWasm.ts` | Node-specific implementation; clean types |
| `src/js/browser/SpellcheckerWasm.ts` | Browser-specific implementation; clean types |
| `src/js/nodejs/index.ts` | Re-export barrel; no changes needed |
| `src/js/browser/index.ts` | Re-export barrel; no changes needed |

---

## Part 10: Test File Rewrite — Mocha/expect.js → node:test/assert

### Critical: ESM Migration Requirements

The test file currently uses **CommonJS patterns** (`require()`, `__dirname`) that **will not work in ESM**. The full test file rewrite must address:

| CJS Pattern | ESM Replacement | Notes |
|-------------|----------------|-------|
| `import expect from 'expect.js'` | `import assert from 'node:assert/strict'` | Direct replacement |
| `import { describe, it } from 'mocha'` | `import { describe, it } from 'node:test'` | Direct replacement |
| `const x = require('./file.json')` | `const x = await import('./file.json')` | Dynamic import must be `await`ed |
| `const __dirname` | `new URL('.', import.meta.url)` or `import.meta.dirname` (Node 20.11+) | `__dirname` does not exist in ESM |
| `import { resolve } from 'path'` | `import { dirname, join } from 'node:path'` | Use `dirname(fileURLToPath(import.meta.url))` |
| `this.timeout(30000)` | Remove — no `describe`-level equivalent in `node:test` | Move timeout logic per-test or use `test({ timeout })` |
| Import without `.js` extension | Must add `.js` extension | ESM requires explicit extensions |

### Node.js 24 Feature Clarifications

**Important:** Several "intrinsic replacements" in this plan are **not** actually new to Node.js 24:

| "Replacement" | Actually Available Since | Notes |
|--------------|-------------------------|-------|
| `--enable-source-maps` | Node.js 12.12.0 (stable since 15.11.0) | Not new to 24; it's a legacy feature |
| Native type stripping | Node.js 22.18.0 / 23.6.0 | Stable by Node.js 24.12.0 |
| `--experimental-test-coverage` | Node.js 18.0.0 | Covered by `node:test` intrinsics |
| `node:test` glob patterns | Node.js 23.0.0 | Target is 24 — satisfied, but worth noting |

### Mocha/expect.js → node:test/assert Mappings

| Mocha/expect.js | node:test/assert |
|----------------|-----------------|
| `import { describe, it } from 'mocha'` | `import { describe, it } from 'node:test'` |
| `import expect from 'expect.js'` | `import assert from 'node:assert/strict'` |
| `expect(x).to.eql(y)` | `assert.deepStrictEqual(x, y)` |
| `expect(x).to.be.ok()` | `assert.ok(x)` |
| `expect(x).to.not.equal(-1)` | `assert.notStrictEqual(x, -1)` |
| `expect(x).to.equal(0)` | `assert.strictEqual(x, 0)` |
| `nyc --reporter=text` | `node --test --experimental-test-coverage --reporter=text` |

### `this.timeout()` Migration — Important Detail

The current test file uses `this.timeout(30000)` at the **describe** level. Node.js `node:test` does **not** have a direct `describe`-level timeout equivalent. The fix is to move the timeout per-test:

```typescript
// Before (Mocha):
describe('SpellcheckerWasm - ' + region, function() {
  this.timeout(30000);
  it('should work', async () => { ... });
});

// After (node:test):
describe('SpellcheckerWasm - ' + region, async function() {
  // Remove this.timeout() — not supported at describe level
  it('should work', { timeout: 30000 }, async () => { ... });
});
```

### Full Test File Rewrite

**Complete before/after for the entire test file** (`src/js/__tests__/SpellcheckerWasm.spec.ts`):

**Before (Current — Mocha + expect.js + CJS patterns):**
```typescript
import { SpellcheckerWasm } from '../nodejs/SpellcheckerWasm';
import { resolve } from 'path';
import expect from 'expect.js';
import testMap from './language_tests_map.json';

const wasmPath = resolve(__dirname, '../../../lib/spellchecker-wasm.wasm');
const russianDictionaryLocation = resolve(__dirname, `./small_dictionary_ru.txt`);

for (const region in testMap) {
    const regionConfig = testMap[region];
    const commonMisspellings: { correctSpelling: string, misspellings: string[] }[] = require(`./commonMisspellings${regionConfig.filesuffix}.json`);
    const dictionaryLocation = resolve(__dirname, `../../../lib/frequency_dictionary${regionConfig.filesuffix}.txt`);
    const bigramLocation = resolve(__dirname, '../../../lib/frequency_bigramdictionary_en_243_342.txt');

    describe(`SpellcheckerWasm - ${region}`, function() {
        this.timeout(30000);
        // ... tests using expect()
    });
}

describe('SpellcheckerWasm - Multi-byte UTF-8', function() {
    // ... tests using expect()
});
```

**After (node:test + assert/strict + ESM):**
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SpellcheckerWasm } from '../nodejs/SpellcheckerWasm.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import testMap from './language_tests_map.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = join(__dirname, '../../../lib/spellchecker-wasm.wasm');
const russianDictionaryLocation = join(__dirname, `./small_dictionary_ru.txt`);

for (const region of Object.keys(testMap)) {
    const regionConfig = testMap[region as keyof typeof testMap];
    // Dynamic import — must be awaited in loop
    const { default: commonMisspellings } = await import(
        `./commonMisspellings${regionConfig.filesuffix}.json`
    ) as { default: { correctSpelling: string; misspellings: string[] }[] };
    const dictionaryLocation = join(__dirname, `../../../lib/frequency_dictionary${regionConfig.filesuffix}.txt`);
    const bigramLocation = join(__dirname, '../../../lib/frequency_bigramdictionary_en_243_342.txt');

    describe(`SpellcheckerWasm - ${region}`, async function() {
        // Note: this.timeout(30000) removed — not supported at describe level
        it('should read from the supplied dictionary and perform lookups',
            { timeout: 30000 },
            async () => {
                let lastResults: {
                    count: number;
                    distance: number;
                    term: string;
                }[];
                const resultsHandler = (results: { count: number; distance: number; term: string }[]) => {
                    lastResults = results;
                };
                const spellchecker = new SpellcheckerWasm(resultsHandler);

                let t = process.hrtime();
                await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
                let [s, n] = process.hrtime(t);
                process.stdout.write(
                    `standard dictionary loaded in ${(s * 1000) + n / 1000 / 1000} ms\n`
                );
                let lookupTimes: number[] = [];
                commonMisspellings.forEach(({ correctSpelling, misspellings }) => {
                    misspellings.forEach(word => {
                        t = process.hrtime();
                        spellchecker.checkSpelling(word.toLowerCase());
                        let [s, n] = process.hrtime(t);
                        lookupTimes.push((s * 1000) + n / 1000 / 1000);
                        const terms = lastResults!.map(result => result.term);
                        assert.notStrictEqual(
                            terms.indexOf(correctSpelling.toLowerCase()),
                            -1
                        );
                    });
                });
                const totalTime = lookupTimes.reduce(
                    (previousValue, currentValue) =>
                        (previousValue += currentValue)
                );
                process.stdout.write(
                    `Average lookup time: ${totalTime / lookupTimes.length} ms\n`
                );
            }
        );

        it('should read from the bigram dictionary and perform compound lookups',
            { timeout: 30000 },
            async () => {
                let lastResults: {
                    count: number;
                    distance: number;
                    term: string;
                }[];
                const resultsHandler = (results: { count: number; distance: number; term: string }[]) => {
                    lastResults = results;
                };
                const spellchecker = new SpellcheckerWasm(resultsHandler);

                let t = process.hrtime();
                await spellchecker.prepareSpellchecker(
                    wasmPath,
                    dictionaryLocation,
                    bigramLocation
                );
                let [s, n] = process.hrtime(t);
                process.stdout.write(
                    `standard dictionary and bigram dictionary loaded in ` +
                        `${(s * 1000) + n / 1000 / 1000} ms\n`
                );
                t = process.hrtime();
                spellchecker.checkSpellingCompound(
                    'begining sentances with misspeled words is outragous and mischievious'
                );
                [s, n] = process.hrtime(t);
                process.stdout.write(`compound lookup time: ${(s * 1000) + n / 1000 / 1000} ms\n`);
                assert.deepStrictEqual(
                    lastResults![0].toJSON(),
                    {
                        count: 0,
                        distance: 5,
                        term:
                            'beginning sentences with misspelled words is outrageous and mischievous',
                    }
                );
            }
        );

        it('should provide SuggestedItems that serialize to JSON properly',
            { timeout: 30000 },
            async () => {
                let lastResults: {
                    count: number;
                    distance: number;
                    term: string;
                }[];
                const resultsHandler = (results: { count: number; distance: number; term: string }[]) => {
                    lastResults = results;
                };
                const spellchecker = new SpellcheckerWasm(resultsHandler);

                await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
                spellchecker.checkSpelling('acheive!');
                assert.deepStrictEqual(
                    lastResults![0].toJSON(),
                    regionConfig.verifyJsonSerializationResponse
                );
            }
        );

        it('should write custom words to the dictionary',
            { timeout: 30000 },
            async () => {
                let lastResults: {
                    count: number;
                    distance: number;
                    term: string;
                }[];
                const resultsHandler = (results: { count: number; distance: number; term: string }[]) => {
                    lastResults = results;
                };
                const spellchecker = new SpellcheckerWasm(resultsHandler);

                await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
                spellchecker.checkSpelling('asdf');
                assert.strictEqual(
                    lastResults!.length,
                    regionConfig.writeCustomWordsResultLength
                );
                spellchecker.writeToDictionary(Buffer.from('asdf 10000\n'));
                spellchecker.checkSpelling('asdf');
                assert.strictEqual(lastResults!.length, 0);
            }
        );

        it('should perform lookups on words containing accented chars',
            { timeout: 30000 },
            async () => {
                let lastResults: {
                    count: number;
                    distance: number;
                    term: string;
                }[];
                const resultsHandler = (results: { count: number; distance: number; term: string }[]) => {
                    lastResults = results;
                };
                const spellchecker = new SpellcheckerWasm(resultsHandler);

                await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
                spellchecker.checkSpelling('crèche');
                assert.deepStrictEqual(
                    lastResults![0].toJSON(),
                    regionConfig.verifyAccentedCharResponse
                );
            }
        );

        it('should perform lookups using custom lookup options',
            { timeout: 30000 },
            async () => {
                let lastResults: {
                    count: number;
                    distance: number;
                    term: string;
                }[];
                const resultsHandler = (results: { count: number; distance: number; term: string }[]) => {
                    lastResults = results;
                };
                const spellchecker = new SpellcheckerWasm(resultsHandler);

                await spellchecker.prepareSpellchecker(
                    wasmPath,
                    dictionaryLocation,
                    null,
                    {
                        countThreshold: 2,
                        dictionaryEditDistance: 7,
                    }
                );
                spellchecker.checkSpelling('cofvfee', {
                    includeUnknown: false,
                    maxEditDistance: 4,
                    verbosity: 1,
                    includeSelf: false,
                });
                assert.deepStrictEqual(
                    lastResults![0].toJSON(),
                    regionConfig.customLookupResponse
                );
            }
        );

        it('should return self for correct terms',
            { timeout: 30000 },
            async () => {
                let lastResults: {
                    count: number;
                    distance: number;
                    term: string;
                }[];
                const resultsHandler = (results: { count: number; distance: number; term: string }[]) => {
                    lastResults = results;
                };
                const spellchecker = new SpellcheckerWasm(resultsHandler);

                await spellchecker.prepareSpellchecker(
                    wasmPath,
                    dictionaryLocation,
                    null,
                    {
                        countThreshold: 2,
                        dictionaryEditDistance: 7,
                    }
                );
                spellchecker.checkSpelling('eradicate', {
                    includeUnknown: false,
                    maxEditDistance: 4,
                    verbosity: 1,
                    includeSelf: true,
                });
                assert.deepStrictEqual(
                    lastResults![0].toJSON(),
                    regionConfig.correctTermResponse
                );
            }
        );
    });
}

// Multi-byte UTF-8 tests (no loop, single describe)
describe('SpellcheckerWasm - Multi-byte UTF-8', function() {
    it('should support dictionaries in other languages with UTF-8 characters',
        { timeout: 30000 },
        async () => {
            let lastResults: {
                count: number;
                distance: number;
                term: string;
            }[];
            const resultsHandler = (results: { count: number; distance: number; term: string }[]) => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(wasmPath, russianDictionaryLocation);
            spellchecker.checkSpelling('свойй');
            assert.deepStrictEqual(
                lastResults![0].toJSON(),
                { count: 28678, distance: 1, term: 'свой' }
            );
        }
    );
});
```

---

## Part 11: Full Dependency Audit — Before → After

### Before (17 devDependencies)

| Category | Packages |
|----------|----------|
| Test framework | `mocha` (7.1), `expect.js` (0.3), `mocha-chrome` (2.2) |
| Test coverage | `nyc` (15), `@istanbuljs/nyc-config-typescript` (0.1) |
| Test types | `@types/mocha` (5), `@types/expect.js` (0.3) |
| Source maps | `source-map-support` (0.5) |
| TS execution | `ts-node` (8), `ts-loader` (6) |
| Module bundling | `webpack` (4), `webpack-cli` (3) |
| Type definitions | `@types/node` (12) |
| Dev utilities | `http-server` (0.12) |
| CLI | `yargs` (15) |
| CI | `coveralls` (3) |
| TypeScript | `typescript` (3) |

### After (3–4 devDependencies)

| Category | Packages | Node.js 24 Intrinsic? |
|----------|----------|----------------------|
| Type definitions | `@types/node` (22) | No (still needed for `tsc`) |
| TypeScript | `typescript` (7) | No (still needed for `tsc --noEmit`) |
| CLI | `yargs` (17) | No (needed for `bin/spellchecker`) |
| CI | `coveralls` (3) | Conditional (keep only if CI uses Coveralls) |

**@types/node version pin:** Pin to `^22.0.0` which is compatible with `typescript@7.0.0`. Verify with `npm i -D @types/node@^22.0.0 typescript@^7.0.0` before committing — both versions share the same `tsc` binary.

### What Was Replaced by Intrinsics

| Intrinsic Replacement | Replaced Packages |
|----------------------|-------------------|
| `node:test` + `node:assert/strict` | `mocha`, `expect.js`, `@types/mocha`, `@types/expect.js` |
| `--experimental-test-coverage` | `nyc`, `@istanbuljs/nyc-config-typescript` |
| `--enable-source-maps` | `source-map-support` |
| Native type stripping | `ts-node` |
| Zero bundler (ESM from `tsc`) | `webpack`, `webpack-cli`, `ts-loader` |
| Deleted (not needed) | `mocha-chrome`, `http-server` |

---

## Part 12: Implementation Order

1. **Update `package.json`** — new `engines.node`, replace all devDependencies, add `type: "module"`, add `exports` field, update scripts
2. **Rewrite `tsconfig.json`** — TS 7 defaults, `module: ES2020`, `types: ["node"]`, `rootDir: "src/js"`
3. **Create `tsconfig.browser.json`** — extends base tsconfig, outputs to `lib/browser/`
4. **Delete `webpack.config.ts`** — no longer needed
5. **Update `lib/browser/index.js`** — replace webpack UMD with 4-line ESM re-export
6. **`npm install`** — install updated deps, verify `node --version` ≥ 24
7. **Verify `@types/node` compatibility** — confirm `@types/node@^22.0.0` works with `typescript@^7.0.0` (`tsc --version` and `tsc --noEmit`)
8. **`npm run build:ts`** — run `tsc`, address any type errors
9. **`npm run build:browser`** — run `tsc -p tsconfig.browser.json`, verify `lib/browser/` output
10. **Rewrite `src/js/__tests__/SpellcheckerWasm.spec.ts`** — Mocha + expect.js → `node:test` + `assert` (see Part 10 for full ESM migration details)
11. **`npm test`** — verify all tests pass with `node:test`
12. **`npm run build`** — verify full build pipeline works
13. **Validate ESM output** — check `lib/**/*.js` use `export`, not `module.exports`
14. **Delete `.mocharc.js` and `.nycrc`** — no longer needed
15. **Validate `.d.ts` output** in `lib/` — ensure declaration files haven't diverged

---

## Part 13: Validation Checklist

- [ ] `node --version` returns ≥ 24.x
- [ ] `tsc --noEmit` passes with zero errors
- [ ] `npm run build:ts` produces clean `.js` and `.d.ts` output in `lib/`
- [ ] `npm run build:browser` produces `lib/browser/index.js` (4-line ESM re-export)
- [ ] `npm run build:wasm` compiles Rust → WASM successfully
- [ ] `npm run bindgen` generates WASM bindings
- [ ] `npm run build` completes end-to-end
- [ ] `npm test` — all test scenarios pass (all regions from `testMap` + multi-byte UTF-8)
- [ ] `.d.ts` files in `lib/` are functionally equivalent to pre-migration
- [ ] `node -e "import('spellchecker-wasm')"` loads without errors
- [ ] `node:test --experimental-test-coverage` produces coverage report
- [ ] `node --test --watch` works for iterative development
- [ ] **All compiled `.js` files in `lib/` use `export`, not `module.exports`**
- [ ] **All compiled `.js` files in `lib/` use `.js` extensions in imports**
- [ ] **`lib/browser/index.js` is valid ESM with correct re-export paths**
- [ ] **ESM consumer smoke test: `node -e "import Spellchecker from './lib/nodejs/index.js'; console.log('loaded')"` succeeds**
- [ ] Browser UMD replaced by `lib/browser/index.js` (ESM re-export)
- [ ] `lib/browser/SpellcheckerWasm.js` compiled as ESM (uses `export` not `require`)
- [ ] `node -e "import('spellchecker-wasm')"` loads without errors
- [ ] `node:test --experimental-test-coverage` produces coverage report
- [ ] `node --test --watch` works for iterative development
- [ ] Browser UMD replaced by `lib/browser/index.js` (ESM re-export)
- [ ] `lib/browser/SpellcheckerWasm.js` compiled as ESM (uses `export` not `require`)

---

## Part 14: Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `strict: true` surfaces latent type issues | Medium | Codebase is clean; likely zero errors. Fix incrementally if needed |
| `module: ES2020` changes output format | Low | ESM is the standard; browser and Node.js 24 fully support it |
| `rootDir: ./` changes output paths | Low | Explicit `rootDir: "src/js"` fixes this |
| `types: []` breaks ambient type loading | Low | Explicit `"types": ["node"]` in tsconfig |
| `@types/node` version incompatibility | Medium | Pin to latest 22.x; audit after install. Verify with `tsc --noEmit` |
| **ESM-only package breaking existing consumers** | **High** | **Add `exports` field for conditional resolution; document ESM-only requirement** |
| **Test file CJS → ESM migration** | **High** | **Full rewrite required; see Part 10 for detailed ESM migration** |
| `node:test` test migration issues | Medium | Careful rewrite of test assertions; verify all scenarios |
| `--enable-source-maps` vs `source-map-support` | Low | Node 24 handles this natively; verify stack traces (note: not a new feature) |
| CI pipeline needs updates | Medium | Update CI to use Node 24 + `node --test` |
| `coveralls` package may still be needed | Low | Keep in devDeps if CI uses Coveralls |
| `yargs` CLI tool may need updates | Low | yargs v17 is backward compatible |
| **Browser consumers may need updated import syntax** | **Medium** | **Package is now ESM-only; consumers must use `import ... from 'spellchecker-wasm'` (resolves via `exports` field) or `<script type="module">`** |

---

## Part 15: Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: `package.json` rewrite (deps + scripts + exports) | 20 min |
| Phase 2: `tsconfig.json` rewrite | 15 min |
| Phase 3: `tsconfig.browser.json` creation | 5 min |
| Phase 4: Delete `webpack.config.ts` | 1 min |
| Phase 5: Update `lib/browser/index.js` | 1 min |
| Phase 6: `npm install` + initial build | 15 min |
| Phase 7: Test file rewrite (Mocha/expect.js → node:test/assert) | 45 min |
| Phase 8: ESM migration validation (`.js` extensions, exports, `import.meta.url`) | 15 min |
| Phase 9: Validation + fixing type errors | 30 min |
| Phase 10: Cleanup (delete `.mocharc.js`, `.nycrc`) | 5 min |
| **Total** | **~2.5 hours** |

---

## Part 16: Summary

This plan achieves three major upgrades in a single pass:

1. **TypeScript 3.8 → 7.0** — Go-native compiler, 8–10x faster builds, same language
2. **Node.js 12 → 24** — Active LTS through Apr 2028, modern platform with native test runner, native type stripping, native source maps, native coverage, native fetch/TextEncoder/ReadableStream
3. **Eliminate all third-party test frameworks** — mocha, expect.js, nyc, source-map-support, ts-node, @types/mocha, @types/expect.js, @istanbuljs/nyc-config-typescript → all replaced by built-in Node.js 24 capabilities
4. **Remove webpack entirely** — zero-bundler approach; `tsc` emits clean ESM, browser consumers use `<script type="module">` or their own bundler
5. **Convert package to ESM-only** — `"type": "module"` + `exports` field for conditional resolution (Node.js vs browser)

**Net result: 17 → 3–4 devDependencies (78–82% reduction). Zero test infrastructure overhead. Zero bundler overhead.**

**ESM-only note:** After this upgrade, the package becomes ESM-only. Existing consumers must use the `exports` field for resolution (`import Spellchecker from 'spellchecker-wasm'`), or use `<script type="module">` for browser usage. CommonJS consumers will need to use `import(...)` dynamic import or migrate to ESM.
