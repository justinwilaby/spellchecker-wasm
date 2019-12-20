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
     * useful when implementing a custom dictionary where additional
     * entries are required beyond the supplied corpus.
     *
     * Caution should be used since writing multiple megabytes at once
     * often results in a memory out of bounds error. Streaming at 32-64kb
     * chunks is recommended.
     *
     * @param chunk Uint8Array The chunk containing the bytes to write
     * @param isBigram boolean Indicates whether this chunk should be written to the bigram dictionary instead.
     */
    writeToDictionary(chunk, isBigram = false) {
        this.writeToBuffer(chunk, this.wasmSymSpell.memory);
        this.wasmSymSpell.write_to_dictionary(0, chunk.byteLength, isBigram);
    }
    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmLocation
     * @param dictionaryLocation
     * @param bigramLocation
     * @param options
     */
    async prepareSpellchecker(wasmLocation, dictionaryLocation, bigramLocation = null, options = defaultOptions) {
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
        if (!result) {
            throw new Error(`Failed to instantiate the parser.`);
        }
        const { symspell, write_to_dictionary, lookup, lookup_compound, memory } = result.instance.exports;
        this.wasmSymSpell = { symspell, write_to_dictionary, lookup, lookup_compound, memory };
        symspell(2, 7);
        const newline = new Uint8Array([10]);
        await new Promise(resolve => {
            const dictionaryReadStream = fs_1.createReadStream(dictionaryLocation);
            dictionaryReadStream.on('data', (chunk) => {
                this.writeToBuffer(chunk, memory);
                write_to_dictionary(0, chunk.length, false);
            });
            dictionaryReadStream.on('close', () => {
                this.writeToBuffer(newline, memory); // Closes the stream
                write_to_dictionary(0, 1, false);
                resolve();
            });
        });
        await new Promise(resolve => {
            if (!bigramLocation) {
                return resolve();
            }
            const bigramReadStream = fs_1.createReadStream(bigramLocation);
            bigramReadStream.on('data', (chunk) => {
                this.writeToBuffer(chunk, memory);
                write_to_dictionary(0, chunk.length, true);
            });
            bigramReadStream.on('close', () => {
                this.writeToBuffer(newline, memory); // Closes the stream
                write_to_dictionary(0, 1, true);
                resolve();
            });
        });
    }
    /**
     * Performs a single spelling check based on the supplied word and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param word string The word to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    checkSpelling(word, options = defaultCheckSpellingOptions) {
        const { lookup, memory } = this.wasmSymSpell;
        let encodedString;
        if (word instanceof Uint8Array) {
            encodedString = word;
        }
        else {
            encodedString = Buffer.from(word);
        }
        this.writeToBuffer(encodedString, memory);
        lookup(0, encodedString.byteLength, options.verbosity, options.maxEditDistance, options.includeUnknown);
    }
    /**
     * Performs a spelling check based on the supplied sentence and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param sentence string The sentence to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    checkSpellingCompound(sentence, options = defaultCheckSpellingOptions) {
        const { lookup_compound, memory } = this.wasmSymSpell;
        let encodedString;
        if (sentence instanceof Uint8Array) {
            encodedString = sentence;
        }
        else {
            encodedString = Buffer.from(sentence);
        }
        this.writeToBuffer(encodedString, memory);
        lookup_compound(0, encodedString.byteLength, options.maxEditDistance);
    }
    /**
     * Allocations within the WASM process
     * detach reference to the memory buffer.
     * We check for this and create a new Uint8Array
     * with the new memory buffer reference if needed.
     *
     * @param chunk
     * @param memory
     */
    writeToBuffer(chunk, memory) {
        if (!this.writeBuffer || this.writeBuffer.buffer !== memory.buffer || this.writeBuffer.byteLength < chunk.byteLength) {
            this.writeBuffer = new Uint8Array(memory.buffer, 0, chunk.byteLength);
        }
        this.writeBuffer.set(chunk, 0);
    }
}
exports.SpellcheckerWasm = SpellcheckerWasm;
