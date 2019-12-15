"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const fs_1 = require("fs");
var Verbosity;
(function (Verbosity) {
    // Top suggestion with the highest term frequency of the suggestions of smallest edit distance found.
    Verbosity[Verbosity["Top"] = 0] = "Top";
    // All suggestions of smallest edit distance found, suggestions ordered by term frequency.
    Verbosity[Verbosity["Closest"] = 1] = "Closest";
    //All suggestions within maxEditDistance, suggestions ordered by edit distance
    // , then by term frequency (slower, no early termination).</summary>
    Verbosity[Verbosity["All"] = 2] = "All";
})(Verbosity = exports.Verbosity || (exports.Verbosity = {}));
const defaultOptions = {
    dictionaryEditDistance: 7,
    countThreshold: 1
};
const defaultCheckSpellingOptions = {
    includeUnknown: false,
    maxEditDistance: 2,
    verbosity: Verbosity.Closest
};
/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
class SpellcheckerWasm {
    constructor(resultHandler) {
        /**
         * @internal
         *
         * Traps responses form the wasm and converts them into
         * their respective SuggestedItem instances.
         *
         * @param ptr number The pointer in memory where this result set is located
         * @param length number The number of total bytes in the set
         */
        this.resultTrap = (ptr, length) => {
            const { memory } = this.wasmSymSpell;
            this.resultHandler(utils_1.deserializeSuggestedItems(memory.buffer, ptr, length));
        };
        this.resultHandler = resultHandler;
    }
    /**
     * Writes a chunk of bytes to the dictionary. This operation is
     * usually called several times while streaming the dictionary
     * file using fs.createReadStream() or fetch().
     *
     * Caution should be used since writing the entire file at once
     * often results in a memory out of bounds error. Chunking at 32-64kb
     * chunks is recommended.
     *
     * @param chunk Uint8Array The chunk containing the bytes to write
     */
    writeToDictionary(chunk) {
        this.writeToBuffer(chunk);
        this.wasmSymSpell.write_to_dictionary(0, chunk.byteLength);
    }
    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmLocation
     * @param dictionaryLocation
     * @param options
     */
    async prepareSpellchecker(wasmLocation, dictionaryLocation, options = defaultOptions) {
        const wasmBytes = await fs_1.promises.readFile('' + wasmLocation);
        const result = await WebAssembly.instantiate(wasmBytes, {
            env: {
                memoryBase: 0,
                tableBase: 0,
                memory: new WebAssembly.Memory({ initial: 1 }),
                table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' }),
                result_handler: this.resultTrap
            }
        });
        if (result) {
            let t = process.hrtime();
            const { symspell, write_to_dictionary, lookup, memory } = result.instance.exports;
            this.wasmSymSpell = { symspell, write_to_dictionary, lookup, memory };
            symspell(2, 7);
            let writeBuffer;
            const dictionaryReadStream = fs_1.createReadStream(dictionaryLocation);
            let ct = 0;
            await new Promise(resolve => {
                dictionaryReadStream.on('data', (chunk) => {
                    if (!writeBuffer || writeBuffer.buffer !== memory.buffer) {
                        writeBuffer = new Uint8Array(memory.buffer, 0, chunk.length);
                        ct++;
                    }
                    writeBuffer.set(chunk);
                    write_to_dictionary(0, chunk.length);
                });
                dictionaryReadStream.on('close', resolve);
            });
            let [s, n] = process.hrtime(t);
            process.stdout.write(`Dictionary loaded in ${(s * 1000) + n / 1000 / 1000} ms\n`);
            return;
        }
        throw new Error(`Failed to instantiate the parser.`);
    }
    /**
     * Performs a single spelling check based on the supplied word and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param word string The word to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    checkSpelling(word, options = defaultCheckSpellingOptions) {
        const { lookup } = this.wasmSymSpell;
        let encodedString;
        if (word instanceof Uint8Array) {
            encodedString = word;
        }
        else {
            encodedString = utils_1.encodeString(word);
        }
        this.writeToBuffer(encodedString);
        lookup(0, encodedString.byteLength, options.verbosity, options.maxEditDistance, options.includeUnknown);
    }
    /**
     * Allocations within the WASM process
     * detach reference to the memory buffer.
     * We check for this and create a new Uint8Array
     * with the new memory buffer reference if needed.
     *
     * @param chunk
     */
    writeToBuffer(chunk) {
        new Uint8Array(this.wasmSymSpell.memory.buffer, 0, chunk.byteLength).set(chunk);
    }
}
exports.SpellcheckerWasm = SpellcheckerWasm;
