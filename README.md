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
Then use `spellcheck` to enter interactive mode

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
import { Worker, MessageChannel, MessagePort } from 'worker_threads';
import { deserializeSuggestedItems } from './utils';

const wasmPath = require.resolve('spellchecker-wasm/lib/spellchecker-wasm.wasm');
const dictionaryLocation = require.resolve('spellchecker-wasm/lib/frequency_dictionary_en_82_765.txt');
// Optional bigram support for compound lookups - add only when needed
const bigramLocation = require.resolve('spellchecker-wasm/lib/frequency_bigramdictionary_en_243_342.txt');
// Get references to the MessagePorts used for bi-directional communication
const { port1, port2 } = new MessageChannel();

async function prepareWorker(): Promise<MessagePort> {
    // Create a new worker and provide it the SpellcheckerWorker.js script
    const worker = new Worker(require.resolve('spellchecker-wasm/lib/SpellcheckerWorker.js'));

    // Wait for the worker to start executing the script
    // then post a message to it containing the port we 
    // want it to use for communication and the locations 
    // of both the spellcheck-wasm.wasm and the 
    // frequency_dictionary_en_82_765.txt.
    worker.once("online", () => {
        worker.postMessage([port2, wasmPath, dictionaryLocation, bigramLocation], [port2]); // bigramLocation required only for compound lookups
    });

    // Listen for messages on port1. The "ready" message indicates
    // The worker is done loading the dictionary and the spellchecker
    // is ready for use. If the worker failed, the first message will
    // contain the details of the failure and the promise will reject.
    return new Promise((resolve, reject) => {
        port1.once('message', (data: string) => {
            if (data === 'ready') {
                return resolve(port1);
            }
            reject(data);
        });
    });
}
// When the promise resolves, the Worker is ready 
// and the MessagePort provided must be subscribed 
// to in order to receive suggestions.
prepareWorker()
    .then(messagePort => {
        messagePort.addEventListener('message', (data: Uint8Array) => {
            const results = deserializeSuggestedItems(data as Uint8Array, 0, data.length);
            process.stdout.write(results.map(r => r.term));
        });
        ['tiss', 'gves', 'practiclly', 'instent', 'relevent', 'resuts']
            .forEach(word => port1.postMessage(word));
        port1.postMessage('multaple wrds are alos acceptible')
    })
    .catch(e => {
        process.stdout.write('' + e);
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
