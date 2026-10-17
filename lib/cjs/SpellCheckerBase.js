"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpellcheckerBase = exports.defaultCheckSpellingOptions = exports.defaultOptions = exports.Verbosity = void 0;
const SuggestedItem_ts_1 = require("./SuggestedItem.js");
exports.Verbosity = {
    // Top suggestion with the highest term frequency of the suggestions of smallest edit distance found.
    Top: 0,
    // All suggestions of smallest edit distance found, suggestions ordered by term frequency.
    Closest: 1,
    //All suggestions within maxEditDistance, suggestions ordered by edit distance
    // , then by term frequency (slower, no early termination).</summary>
    All: 2,
};
exports.defaultOptions = {
    dictionaryEditDistance: 2,
    countThreshold: 1
};
exports.defaultCheckSpellingOptions = {
    includeUnknown: false,
    includeSelf: false,
    maxEditDistance: 2,
    verbosity: exports.Verbosity.Closest
};
/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
class SpellcheckerBase {
    wasmSymSpell;
    writeBuffer;
    prepared = false;
    dictionaryEditDistance;
    /**
     * The handler set by the consumer to receive
     * suggested items from the wasm.
     */
    resultHandler;
    resultFrames = [];
    constructor(resultHandler) {
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
        if (!this.wasmSymSpell.write_to_dictionary(0, chunk.byteLength, isBigram)) {
            throw new TypeError('Dictionary contains invalid UTF-8');
        }
    }
    /**
     * Performs a single spelling check based on the supplied word and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param word string The word to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    checkSpelling(word, options = exports.defaultCheckSpellingOptions) {
        const resolvedOptions = { ...exports.defaultCheckSpellingOptions, ...options };
        this.validateLookupDistance(resolvedOptions.maxEditDistance);
        const { lookup, memory } = this.wasmSymSpell;
        let encodedString;
        if (word instanceof Uint8Array) {
            encodedString = word;
        }
        else {
            encodedString = this.encodeString(word);
        }
        this.writeToBuffer(encodedString, memory);
        lookup(0, encodedString.byteLength, resolvedOptions.verbosity, resolvedOptions.maxEditDistance, resolvedOptions.includeUnknown, resolvedOptions.includeSelf);
    }
    /** Returns the suggestions for this word synchronously after preparation. */
    suggest(word, options) {
        return this.captureResults(() => this.checkSpelling(word, options));
    }
    /**
     * Performs a spelling check based on the supplied sentence and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param sentence string The sentence to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    checkSpellingCompound(sentence, options = exports.defaultCheckSpellingOptions) {
        const resolvedOptions = { ...exports.defaultCheckSpellingOptions, ...options };
        this.validateLookupDistance(resolvedOptions.maxEditDistance);
        const { lookup_compound, memory } = this.wasmSymSpell;
        let encodedString;
        if (sentence instanceof Uint8Array) {
            encodedString = sentence;
        }
        else {
            encodedString = this.encodeString(sentence);
        }
        this.writeToBuffer(encodedString, memory);
        lookup_compound(0, encodedString.byteLength, resolvedOptions.maxEditDistance);
    }
    validateLookupDistance(distance) {
        if (!Number.isSafeInteger(distance) || distance < 0 || distance > 0xffffffff) {
            throw new RangeError('maxEditDistance must be an integer between 0 and 4294967295');
        }
        if (this.dictionaryEditDistance === undefined) {
            throw new Error('Call prepareSpellchecker before checking spelling');
        }
        if (distance > this.dictionaryEditDistance) {
            throw new RangeError(`maxEditDistance (${distance}) must be less than or equal to dictionaryEditDistance (${this.dictionaryEditDistance})`);
        }
    }
    /** Returns the compound suggestions synchronously after preparation. */
    suggestCompound(sentence, options) {
        return this.captureResults(() => this.checkSpellingCompound(sentence, options));
    }
    captureResults(lookup) {
        if (!this.prepared) {
            throw new Error('Spellchecker is not ready. Await prepareSpellchecker() before calling suggest or suggestCompound.');
        }
        const frame = { results: [] };
        this.resultFrames.push(frame);
        try {
            lookup();
            return frame.results;
        }
        finally {
            this.resultFrames.pop();
        }
    }
    /**
     * @internal
     *
     * Traps responses form the wasm and converts them into
     * their respective SuggestedItem instances.
     *
     * @param ptr number The pointer in memory where this result set is located
     * @param length number The number of total bytes in the result set
     */
    resultTrap = (ptr, length) => {
        const { memory } = this.wasmSymSpell;
        const results = (0, SuggestedItem_ts_1.deserializeSuggestedItems)(memory.buffer, ptr, length);
        const frame = this.resultFrames[this.resultFrames.length - 1];
        if (frame) {
            frame.results = results;
        }
        this.resultHandler?.(results);
    };
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
            if (memory.buffer.byteLength < chunk.byteLength) {
                const delta = Math.ceil((chunk.byteLength - memory.buffer.byteLength) / 65536); // 64 * 1024;
                memory.grow(delta);
            }
            this.writeBuffer = new Uint8Array(memory.buffer, 0, chunk.byteLength);
        }
        this.writeBuffer.set(chunk, 0);
    }
}
exports.SpellcheckerBase = SpellcheckerBase;
