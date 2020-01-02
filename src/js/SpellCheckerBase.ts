import {deserializeSuggestedItems, SuggestedItem} from "./SuggestedItem";

export interface WasmSymSpell extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    // ------------------------------------------
    // Exported wasm functions
    symspell: (dictionaryEditDistance: number, countThreshold: number) => void;

    lookup: (ptr: number, length: number, verbosity: Verbosity, maxEditDistance: number, includeUnknowns: boolean) => void;

    lookup_compound: (ptr: number, length: number, maxEditDistance: number) => void;

    write_to_dictionary: (prt: number, length: number, isBigram: boolean) => void;
}

export enum Verbosity {
    // Top suggestion with the highest term frequency of the suggestions of smallest edit distance found.
    Top,
    // All suggestions of smallest edit distance found, suggestions ordered by term frequency.
    Closest,
    //All suggestions within maxEditDistance, suggestions ordered by edit distance
    // , then by term frequency (slower, no early termination).</summary>
    All,
}

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
    includeUnknown: boolean
}

export type ResultsHandler = (suggestedItems: SuggestedItem[]) => void;

export const defaultOptions: SymSpellOptions = {
    dictionaryEditDistance: 7,
    countThreshold: 1
};

export const defaultCheckSpellingOptions: CheckSpellingOptions = {
    includeUnknown: false,
    maxEditDistance: 2,
    verbosity: Verbosity.Closest
};

/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
export abstract class SpellcheckerBase {
    protected wasmSymSpell: WasmSymSpell;
    protected writeBuffer: Uint8Array;

    /**
     * The handler set by the consumer to receive
     * suggested items from the wasm.
     */
    public resultHandler: ResultsHandler;

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
    public abstract async prepareSpellchecker(
        wasmLocation: string,
        dictionaryLocation: string,
        bigramLocation: string,
        options: SymSpellOptions): Promise<void>;
    public abstract async prepareSpellchecker(
        wasFetchResponse: Response,
        dictionaryFetchResponse: Response,
        bigramFetchResponse: Response,
        options: SymSpellOptions): Promise<void>

    /**
     * Performs a single spelling check based on the supplied word and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param word string The word to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    public checkSpelling(word: Uint8Array | string, options: CheckSpellingOptions = defaultCheckSpellingOptions): void {
        const {lookup, memory} = this.wasmSymSpell;
        let encodedString;
        if (word instanceof Uint8Array) {
            encodedString = word;
        } else {
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
    public checkSpellingCompound(sentence: Uint8Array | string, options: Pick<CheckSpellingOptions, 'maxEditDistance'> = defaultCheckSpellingOptions): void {
        const {lookup_compound, memory} = this.wasmSymSpell;
        let encodedString;
        if (sentence instanceof Uint8Array) {
            encodedString = sentence;
        } else {
            encodedString = this.encodeString(sentence);
        }
        this.writeToBuffer(encodedString, memory);
        lookup_compound(0, encodedString.byteLength, options.maxEditDistance);
    }

    /**
     * @internal
     *
     * Traps responses form the wasm and converts them into
     * their respective SuggestedItem instances.
     *
     * @param ptr number The pointer in memory where this result set is located
     * @param length number The number of total bytes in the set
     */
    protected resultTrap = (ptr: number, length: number): void => {
        const {memory} = this.wasmSymSpell;
        this.resultHandler(deserializeSuggestedItems(memory.buffer, ptr, length));
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
            this.writeBuffer = new Uint8Array(memory.buffer, 0, chunk.byteLength);
        }
        this.writeBuffer.set(chunk, 0);
    }
}
