# Spellchecker + WebAssembly
*When you absolutely, positively have to have the fastest spellchecker in the room, accept no substitutes.*

[![Tests](https://github.com/justinwilaby/spellchecker-wasm/actions/workflows/test.yml/badge.svg)](https://github.com/justinwilaby/spellchecker-wasm/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/justinwilaby/spellchecker-wasm/badge.svg?branch=master)](https://coveralls.io/github/justinwilaby/spellchecker-wasm?branch=master)

* **Fast** - Based on [SymSpell](https://github.com/wolfgarbe/symspell) v6.7.3 with bigram support.
* **Plug and play** - Ready to go out of the box (batteries included).

Spellcheck-wasm is an extremely fast spellchecker for [WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly) complete with
tooling for leveraging Worker threads to guarantee lightning fast processing of a single word or very large documents *without* the use
of native Node plugins. Sub-millisecond benchmarks bring **near native speeds** to spellchecking in Node.

Spellcheck-wasm uses a zero dependency [Rust](https://www.rust-lang.org/en-US/) port of the extremely popular [SymSpell](https://github.com/wolfgarbe/symspell)
engine with several optimizations for WebAssembly.

|               |            |
|---------------|-----------:|
| Electron      |      ✓     |
| Node          |      ✓     |
| Browsers      |      ✓     |
| Workers       |      ✓     |
| Cli           |      ✓     |

## Installation
```bash
npm i -s spellchecker-wasm
```
## As an interactive CLI
```bash
npm i -g spellchecker-wasm
```
Then use `spellcheck` to enter interactive mode. For supported arguments, run `spellcheck --help`.

## Usage in Electron
```js
// Within the preload script of your BrowserWindow instance
const { webFrame } = require('electron');
const { dirname, join } = require('node:path');

(async () => {
    const { SpellcheckerWasm } = await import('spellchecker-wasm');
    const libDir = join(dirname(require.resolve('spellchecker-wasm')), '..');
    const spellchecker = new SpellcheckerWasm();
    await spellchecker.prepareSpellchecker(
        join(libDir, 'spellchecker-wasm.wasm'),
        join(libDir, 'frequency_dictionary_en_82_765.txt')
    );

    webFrame.setSpellCheckProvider('en-US', {
        spellCheck(words, callback) {
            const misspelledWords = words.filter(word => spellchecker.suggest(word).length > 0);
            callback(misspelledWords);
        }
    });
})();
```

## Usage in Node
```typescript
import { SpellcheckerWasm } from 'spellchecker-wasm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = join(dirname(fileURLToPath(import.meta.resolve('spellchecker-wasm'))), '..');
const wasmPath = join(libDir, 'spellchecker-wasm.wasm');
const dictionaryLocation = join(libDir, 'frequency_dictionary_en_82_765.txt');
// Optional bigram support for compound lookups - add only when needed
const bigramLocation = join(libDir, 'frequency_bigramdictionary_en_243_342.txt');

const spellchecker = new SpellcheckerWasm();
await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation, bigramLocation);
for (const word of ['tiss', 'gves', 'practiclly']) {
    console.log(word, spellchecker.suggest(word).map(item => item.term));
}
console.log(spellchecker.suggestCompound('tiss cheks th entir sentance'));
```

Preparation is asynchronous. Once it completes, `suggest` and `suggestCompound`
return results synchronously for the supplied input. The existing
`checkSpelling` and `checkSpellingCompound` methods still call an optional
`resultHandler` synchronously and return `void`.

## Usage as a Node Worker
```js
// spellchecker-worker.mjs
import { parentPort } from 'node:worker_threads';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpellcheckerWasm } from 'spellchecker-wasm';

const libDir = join(dirname(fileURLToPath(import.meta.resolve('spellchecker-wasm'))), '..');
const spellchecker = new SpellcheckerWasm();
await spellchecker.prepareSpellchecker(
    join(libDir, 'spellchecker-wasm.wasm'),
    join(libDir, 'frequency_dictionary_en_82_765.txt')
);
parentPort.on('message', word => {
    parentPort.postMessage(spellchecker.suggest(word).map(item => item.toJSON()));
});
```
## Usage in the Browser
```js
// Serve the package's lib directory at /spellchecker-wasm/lib/.
import { SpellcheckerWasm } from '/spellchecker-wasm/lib/esm/index.js';

async function initializeSpellchecker() {
    const wasm = await fetch('/spellchecker-wasm/lib/spellchecker-wasm.wasm');
    const dictionary = await fetch('/spellchecker-wasm/lib/frequency_dictionary_en_82_765.txt');
    const bigramLocation = await fetch('/spellchecker-wasm/lib/frequency_bigramdictionary_en_243_342.txt'); // Optional

    const spellchecker = new SpellcheckerWasm();
    await spellchecker.prepareSpellchecker(wasm, dictionary, bigramLocation);
    return spellchecker;
}

initializeSpellchecker().then(spellchecker => {
    for (const word of ['tiss', 'gves', 'practiclly']) {
        console.log(word, spellchecker.suggest(word).map(item => item.term));
    }
    console.log(spellchecker.suggestCompound('tiss cheks th entir sentance'));
});
```
## Common use cases
### Differentiating between a correct word and a word with no suggestions
By default, the spellchecker will return no results for both 'there' and 'thereeeee'. 
The former is correct and so will not produce suggestions. The latter word is obviously a mistake, 
but its distance from any word in the dictionary is greater than the maxEditDistance.

To distinguish between the two, one can use the `includeUnknown` option :
```js
let lastResults;
const resultsHandler = results => {
    lastResults = results;
};

spellchecker.checkSpelling('there');
// lastResults.length === 0

spellchecker.checkSpelling('thereeeee');
// lastResults.length === 0

spellchecker.checkSpelling('thereeeee', {
    includeUnknown: true,
    maxEditDistance: 2,
    verbosity: 2,
    includeSelf: false
});
// lastResults.length === 1
```
### Allowing for deeper word searches
Given that the default `maxEditDistance`, which controls up to which edit distance words from the dictionary should be treated as suggestions, is 2, words such as `cofvvvfee` will not return suggestions.

This can be remedied as follows:
```js
let lastResults;
const resultsHandler = results => {
    lastResults = results;
};

spellchecker.checkSpelling('cofvvvfee');
// lastResults.length === 0

spellchecker.checkSpelling('cofvvvfee', {
    includeUnknown: false,
    maxEditDistance: 4,
    verbosity: 1,
    includeSelf: false
});
// lastResults.length === 1, lastResults[0] --> 'coffee'
```
*Caveat* : the `maxEditDistance` parameter that is passed to `checkSpelling` must be less-than-or-equal to the `dictionaryEditDistance` parameter of `prepareSpellchecker`. E.g. : 
```js
// BAD!
await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation); // Default value of dictionaryEditDistance is 2
let lastResults;
const resultsHandler = results => {
    lastResults = results;
};
spellchecker.checkSpelling('cofvvvfee', {
    includeUnknown: false,
    maxEditDistance: 4,
    verbosity: 1,
    includeSelf: false
});
// ERROR!
```

```js
// Good
await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation, null, {countThreshold: 2, dictionaryEditDistance: 4});
let lastResults;
const resultsHandler = results => {
    lastResults = results;
};
spellchecker.checkSpelling('cofvvvfee', {
    includeUnknown: false,
    maxEditDistance: 4,
    verbosity: 1,
    includeSelf: false
});
// lastResults.length === 1
```
### Controlling the amount and ordering of returned suggestions
The `verbosity` parameter to `checkSpelling` can be used to tweak the amount of suggestions returned. Its supported values are :
```js
verbosity:
    0: (top) returns only the suggestion with the highest term frequency of the suggestions of smallest edit distance found,
    1: (closest) returns all suggestions of smallest edit distance found, suggestions ordered by term frequency,
    2: (all) returns all suggestions within maxEditDistance, suggestions ordered by edit distance, then by term frequency,

```

## Building from source
### Prerequisites

This project requires rust v1.30+ since it contains the `wasm32-unknown-unknown` target out of the box.

Install rust:
```bash
curl https://sh.rustup.rs -sSf | sh
```
Install the stable compiler and switch to it.
```bash
rustup install stable
rustup default stable
```
Install the wasm32-unknown-unknown target.
```bash
rustup target add wasm32-unknown-unknown --toolchain stable
```
Install [node with npm](https://nodejs.org/en/) then run the following command from the project root.
```bash
npm install
```
Install the wasm-bindgen-cli tool
```bash
cargo install wasm-bindgen-cli
```
The project can now be built using:
```bash
npm run build
```
The artifacts from the build will be located in the `/libs` directory.
