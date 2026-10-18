import {deserializeSuggestedItems, SuggestedItem} from "./SuggestedItem.ts";

export interface WasmSymSpell extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    // ------------------------------------------
    // Exported wasm functions
    symspell: (dictionaryEditDistance: number, countThreshold: number) => void;

    lookup: (ptr: number, length: number, verbosity: Verbosity, maxEditDistance: number, includeUnknowns: boolean, includeSelf: boolean) => void;

    lookup_compound: (ptr: number, length: number, maxEditDistance: number) => void;

    write_to_dictionary: (prt: number, length: number, isBigram: boolean) => boolean;
}

export const Verbosity = {
    // Top suggestion with the highest term frequency of the suggestions of smallest edit distance found.
    Top: 0,
    // All suggestions of smallest edit distance found, suggestions ordered by term frequency.
    Closest: 1,
    //All suggestions within maxEditDistance, suggestions ordered by edit distance
    // , then by term frequency (slower, no early termination).</summary>
    All: 2,
} as const;

export type Verbosity = typeof Verbosity[keyof typeof Verbosity];

export interface SymSpellOptions {

    /**
     * The maximum Levenshtein distance to consider
     * when matching the input against the dictionary.
     * default=2 (0: no correction, word segmentation only)
     */
    dictionaryEditDistance: number

    /**
     * The minimum frequency count for dictionary words
     * to be considered correct spellings.
     */
    countThreshold: number
}

export interface CheckSpellingOptions {
    verbosity: Verbosity,
    maxEditDistance: number,
    // when true, input terms not contained in the dictionary,
    // and with no suggestions in the dictionary within the
    // maximum edit distance will be still included in the output
    includeUnknown: boolean,
    // when true, and Verbosity is not set to All,
    // include the input word in the suggestions when an
    // exact match is found in the dictionary.
    includeSelf: boolean
}

export type ResultsHandler = (suggestedItems: SuggestedItem[]) => void;

export const defaultOptions: SymSpellOptions = {
    dictionaryEditDistance: 2,
    countThreshold: 1
};

export const defaultCheckSpellingOptions: CheckSpellingOptions = {
    includeUnknown: false,
    includeSelf: false,
    maxEditDistance: 2,
    verbosity: Verbosity.Closest
};

/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
export abstract class SpellcheckerBase {
    protected wasmSymSpell!: WasmSymSpell;
    protected writeBuffer!: Uint8Array;
    protected prepared = false;
    protected dictionaryEditDistance?: number;

    /**
     * The handler set by the consumer to receive
     * suggested items from the wasm.
     */
    public resultHandler?: ResultsHandler;
    private readonly resultFrames: { results: SuggestedItem[] }[] = [];

    protected constructor(resultHandler?: ResultsHandler) {
        this.resultHandler = resultHandler;
    }

    protected abstract encodeString(str: string): Uint8Array;

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
    public writeToDictionary(chunk: Uint8Array, isBigram = false): void {
        this.writeToBuffer(chunk, this.wasmSymSpell.memory);
        if (!this.wasmSymSpell.write_to_dictionary(0, chunk.byteLength, isBigram)) {
            throw new TypeError('Dictionary contains invalid UTF-8');
        }
    }

    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmLocation
     * @param dictionaryLocation
     * @param bigramLocation
     * @param options
     */
    public abstract prepareSpellchecker(
        wasmLocation: string,
        dictionaryLocation: string,
        bigramLocation?: string,
        options?: Partial<SymSpellOptions>): Promise<void>;
    public abstract prepareSpellchecker(
        wasFetchResponse: Response,
        dictionaryFetchResponse: Response,
        bigramFetchResponse?: Response,
        options?: Partial<SymSpellOptions>): Promise<void>

    /**
     * Performs a single spelling check based on the supplied word and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param word string The word to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    public checkSpelling(word: Uint8Array | string, options: Partial<CheckSpellingOptions> = defaultCheckSpellingOptions): void {
        const resolvedOptions = {...defaultCheckSpellingOptions, ...options};
        this.validateLookupDistance(resolvedOptions.maxEditDistance);
        const {lookup, memory} = this.wasmSymSpell;
        let encodedString;
        if (word instanceof Uint8Array) {
            encodedString = word;
        } else {
            encodedString = this.encodeString(word);
        }
        this.writeToBuffer(encodedString, memory);
        lookup(0, encodedString.byteLength, resolvedOptions.verbosity, resolvedOptions.maxEditDistance, resolvedOptions.includeUnknown, resolvedOptions.includeSelf);
    }

    /** Returns the suggestions for this word synchronously after preparation. */
    public suggest(word: Uint8Array | string, options?: Partial<CheckSpellingOptions>): SuggestedItem[] {
        return this.captureResults(() => this.checkSpelling(word, options));
    }

    /**
     * Performs a spelling check based on the supplied sentence and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param sentence string The sentence to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    public checkSpellingCompound(sentence: Uint8Array | string, options: Partial<Pick<CheckSpellingOptions, 'maxEditDistance'>> = defaultCheckSpellingOptions): void {
        const resolvedOptions = {...defaultCheckSpellingOptions, ...options};
        this.validateLookupDistance(resolvedOptions.maxEditDistance);
        const {lookup_compound, memory} = this.wasmSymSpell;
        let encodedString;
        if (sentence instanceof Uint8Array) {
            encodedString = sentence;
        } else {
            encodedString = this.encodeString(sentence);
        }
        this.writeToBuffer(encodedString, memory);
        lookup_compound(0, encodedString.byteLength, resolvedOptions.maxEditDistance);
    }

    protected validateLookupDistance(distance: number): void {
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
    public suggestCompound(sentence: Uint8Array | string, options?: Pick<CheckSpellingOptions, 'maxEditDistance'>): SuggestedItem[] {
        return this.captureResults(() => this.checkSpellingCompound(sentence, options));
    }

    private captureResults(lookup: () => void): SuggestedItem[] {
        if (!this.prepared) {
            throw new Error('Spellchecker is not ready. Await prepareSpellchecker() before calling suggest or suggestCompound.');
        }
        const frame = { results: [] as SuggestedItem[] };
        this.resultFrames.push(frame);
        try {
            lookup();
            return frame.results;
        } finally {
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
    protected resultTrap = (ptr: number, length: number): void => {
        const {memory} = this.wasmSymSpell;
        const results = deserializeSuggestedItems(memory.buffer, ptr, length);
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
    protected writeToBuffer(chunk: Uint8Array, memory: WebAssembly.Memory): void {
        if (!this.writeBuffer || this.writeBuffer.buffer !== memory.buffer || this.writeBuffer.byteLength < chunk.byteLength) {
            if (memory.buffer.byteLength < chunk.byteLength) {
                const delta = Math.ceil((chunk.byteLength - memory.buffer.byteLength) / 65536) // 64 * 1024;
                memory.grow(delta);
            }
            this.writeBuffer = new Uint8Array(memory.buffer, 0, chunk.byteLength);
        }
        this.writeBuffer.set(chunk, 0);
    }
}