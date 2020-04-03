# Spellchecker + WebAssembly
*When you absolutely, positively have to have the fastest spellchecker in the room, accept no substitutes.*

[![Build Status](https://travis-ci.org/justinwilaby/spellchecker-wasm.svg?branch=master)](https://travis-ci.org/justinwilaby/spellchecker-wasm)
[![Coverage Status](https://coveralls.io/repos/github/justinwilaby/spellchecker-wasm/badge.svg?branch=master)](https://coveralls.io/github/justinwilaby/spellchecker-wasm?branch=master)

* **Fast** - Based on [SymSpell](https://github.com/wolfgarbe/symspell) v6.6 with bigram support.
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
const { SpellcheckerWasm }  = require('spellchecker-wasm');

const wasmPath = require.resolve('spellchecker-wasm/lib/spellcheck-wasm.wasm');
const dictionaryLocation = require.resolve('spellchecker-wasm/lib/frequency_dictionary_en_82_765.txt');
const spellchecker = new SpellcheckerWasm();

spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation)
    .then(() => {
        let suggestions;
        spellchecker.resultsHandler = results => {
            suggestions = results;
        };

        webFrame.setSpellCheckProvider('en-US', {
            spellCheck(words, callback) {
                const misspelledWords = [];
                words.forEach(word => {
                    spellchecker.checkSpelling(word); // synchronous
                    if (suggestions.length) {
                        misspelledWords.push(word);
                    }
                });
                callback(misspelledWords);
            }
        })
    })
```

## Usage in Node
```typescript
import { SpellcheckerWasm } from 'spellchecker-wasm';
const wasmPath = require.resolve('spellchecker-wasm/lib/spellchecker-wasm.wasm');
const dictionaryLocation = require.resolve('spellchecker-wasm/lib/frequency_dictionary_en_82_765.txt');
// Optional bigram support for compound lookups - add only when needed
const bigramLocation = require.resolve('spellchecker-wasm/lib/frequency_bigramdictionary_en_243_342.txt');

const spellchecker = new SpellcheckerWasm(resultHandler);
spellChecker.prepareSpellchecker(wasmPath, dictionaryLocation, bigramLocation)
    .then(() => {
        ['tiss', 'gves', 'practiclly', 'instent', 'relevent', 'resuts'].forEach(word => spellchecker.checkSpelling(word));
        spellchecker.checkSpellingCompound('tiss cheks th entir sentance')
    });

function resultHandler(results) {
    // Results are given in the same order they are sent.
    // The most relevant results are order lower in the results index.
    process.stdout.write(results.map(r => r.term));
}
```

## Usage as a Node Worker
```typescript
const { SpellcheckerWasm } = require('../lib/nodejs/SpellcheckerWasm.js');

const wasmPath = require.resolve('spellchecker-wasm/lib/spellchecker-wasm.wasm');
const dictionaryLocation = require.resolve('spellchecker-wasm/lib/frequency_dictionary_en_82_765.txt');
// Optional bigram support for compound lookups - add only when needed
const bigramLocation = require.resolve('spellchecker-wasm/lib/frequency_bigramdictionary_en_243_342.txt');

let resultHandler = (results) => {process.stdout.write(results.map(r => r.term) + '\n');};
let spellcheckerWasm = new SpellcheckerWasm(resultHandler);
spellcheckerWasm.prepareSpellchecker(wasmPath, dictionaryLocation, bigramLocation)
    .then(() => {
        process.stdout.write('Ready\n');
        process.stdin.on('data', data => {
            spellcheckerWasm.checkSpelling('' + data);
        });
    })
    .catch((e) => {
        process.stdout.write(`Error initializing the SpellChecker\n${e}\n`);
    });
```
## Usage in the Browser
```js
import { SpellcheckerWasm } from 'spellchecker-wasm/lib/browser/index.js';

let resultHandler = (results) => console.log("Results : ", results.map(result => result.term));

async function initializeSpellchecker() {
    const wasm = await fetch('spellchecker-wasm/lib/spellchecker-wasm.wasm');
    const dictionary = await fetch('spellchecker-wasm/lib/frequency_dictionary_en_82_765.txt');
    const bigramLocation = await fetch('spellchecker-wasm/lib/frequency_bigramdictionary_en_243_342.txt'); // Optional

    const spellchecker = new SpellcheckerWasm(resultHandler);
    await spellchecker.prepareSpellchecker(wasm, dictionary, bigramLocation);
    return spellchecker;
}

initializeSpellchecker().then(spellchecker => {
    ['tiss', 'gves', 'practiclly', 'instent', 'relevent', 'resuts'].forEach(word => spellchecker.checkSpelling(word));
    spellchecker.checkSpellingCompound('tiss cheks th entir sentance');
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
