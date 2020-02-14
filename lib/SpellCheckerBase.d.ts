import { SuggestedItem } from "./SuggestedItem";
export interface WasmSymSpell extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    symspell: (dictionaryEditDistance: number, countThreshold: number) => void;
    lookup: (ptr: number, length: number, verbosity: Verbosity, maxEditDistance: number, includeUnknowns: boolean, includeSelf: boolean) => void;
    lookup_compound: (ptr: number, length: number, maxEditDistance: number) => void;
    write_to_dictionary: (prt: number, length: number, isBigram: boolean) => void;
}
export declare enum Verbosity {
    Top = 0,
    Closest = 1,
    All = 2
}
export interface SymSpellOptions {
    /**
     * The maximum Levenshtein distance to consider
     * when matching the input against the dictionary.
     * default=2 (0: no correction, word segmentation only)
     */
    dictionaryEditDistance: number;
    /**
     * The minimum frequency count for dictionary words
     * to be considered correct spellings.
     */
    countThreshold: number;
}
export interface CheckSpellingOptions {
    verbosity: Verbosity;
    maxEditDistance: number;
    includeUnknown: boolean;
    includeSelf: boolean;
}
export declare type ResultsHandler = (suggestedItems: SuggestedItem[]) => void;
export declare const defaultOptions: SymSpellOptions;
export declare const defaultCheckSpellingOptions: CheckSpellingOptions;
/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
export declare abstract class SpellcheckerBase {
    protected wasmSymSpell: WasmSymSpell;
    protected writeBuffer: Uint8Array;
    /**
     * The handler set by the consumer to receive
     * suggested items from the wasm.
     */
    resultHandler: ResultsHandler;
    protected constructor(resultHandler?: ResultsHandler);
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
    writeToDictionary(chunk: Uint8Array, isBigram?: boolean): void;
    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmLocation
     * @param dictionaryLocation
     * @param bigramLocation
     * @param options
     */
    abstract prepareSpellchecker(wasmLocation: string, dictionaryLocation: string, bigramLocation: string, options: SymSpellOptions): Promise<void>;
    abstract prepareSpellchecker(wasFetchResponse: Response, dictionaryFetchResponse: Response, bigramFetchResponse: Response, options: SymSpellOptions): Promise<void>;
    /**
     * Performs a single spelling check based on the supplied word and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param word string The word to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    checkSpelling(word: Uint8Array | string, options?: CheckSpellingOptions): void;
    /**
     * Performs a spelling check based on the supplied sentence and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param sentence string The sentence to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    checkSpellingCompound(sentence: Uint8Array | string, options?: Pick<CheckSpellingOptions, 'maxEditDistance'>): void;
    /**
     * @internal
     *
     * Traps responses form the wasm and converts them into
     * their respective SuggestedItem instances.
     *
     * @param ptr number The pointer in memory where this result set is located
     * @param length number The number of total bytes in the set
     */
    protected resultTrap: (ptr: number, length: number) => void;
    /**
     * Allocations within the WASM process
     * detach reference to the memory buffer.
     * We check for this and create a new Uint8Array
     * with the new memory buffer reference if needed.
     *
     * @param chunk
     * @param memory
     */
    protected writeToBuffer(chunk: Uint8Array, memory: WebAssembly.Memory): void;
}
