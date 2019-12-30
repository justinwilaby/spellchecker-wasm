"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const SpellcheckerWasm_1 = require("./SpellcheckerWasm");
/**
 * The SpellcheckerWorker class extends SpellcheckWasm
 * to provide the logic for preparing the wasm,
 * loading the dictionary and performing the spell
 * checking.
 */
class SpellcheckerWorker extends SpellcheckerWasm_1.SpellcheckerWasm {
    constructor() {
        super();
        /**
         * @override
         *
         * Overrides the resultTrap to write the results to the shared
         * memory buffer and message the parent process of the pointer
         * and length which contains the SuggestedItems.
         *
         * @param ptr number The pointer to the index in the shared memory where the suggested results live
         * @param length number The length of this result set in bytes.
         */
        this.resultTrap = (ptr, length) => {
            // Write the block from the wasm memory to the shared memory
            const { memory } = this.wasmSymSpell;
            const slice = new Uint8Array(memory.buffer.slice(ptr, ptr + length));
            this.port2.postMessage(slice);
        };
        this.initializationMessage = async (value) => {
            const [port2, wasmPath, dictionaryPath, bigramLocation] = value;
            this.port2 = port2;
            this.port2.addListener('message', this.inboundMessageHandler);
            try {
                await this.prepareSpellchecker(wasmPath, dictionaryPath, bigramLocation);
            }
            catch (e) {
                this.port2.postMessage(`Error: ${e.message}`);
            }
            this.port2.postMessage('ready');
        };
        this.inboundMessageHandler = (word) => {
            const trimmed = word.trim();
            if (trimmed.includes(' ')) {
                this.checkSpellingCompound(trimmed);
            }
            else {
                this.checkSpelling(trimmed);
            }
        };
        worker_threads_1.parentPort.once('message', this.initializationMessage);
    }
}
const spellcheckWorker = new SpellcheckerWorker();
