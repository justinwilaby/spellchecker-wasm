"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SuggestedItem_1 = require("./SuggestedItem");
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
exports.defaultOptions = {
    dictionaryEditDistance: 7,
    countThreshold: 1
};
exports.defaultCheckSpellingOptions = {
    includeUnknown: false,
    maxEditDistance: 2,
    verbosity: Verbosity.Closest
};
/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
class SpellcheckerBase {
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
            this.resultHandler(SuggestedItem_1.deserializeSuggestedItems(memory.buffer, ptr, length));
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
     * Performs a single spelling check based on the supplied word and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param word string The word to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    checkSpelling(word, options = exports.defaultCheckSpellingOptions) {
        const { lookup, memory } = this.wasmSymSpell;
        let encodedString;
        if (word instanceof Uint8Array) {
            encodedString = word;
        }
        else {
            encodedString = this.encodeString(word);
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
    checkSpellingCompound(sentence, options = exports.defaultCheckSpellingOptions) {
        const { lookup_compound, memory } = this.wasmSymSpell;
        let encodedString;
        if (sentence instanceof Uint8Array) {
            encodedString = sentence;
        }
        else {
            encodedString = this.encodeString(sentence);
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
exports.SpellcheckerBase = SpellcheckerBase;
