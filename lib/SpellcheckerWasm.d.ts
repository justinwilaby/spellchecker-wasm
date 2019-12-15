import { SuggestedItem } from "./SuggestedItem";
export interface WasmSymSpell extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    symspell: (dictionaryEditDistance: number, countThreshold: number) => void;
    lookup: (ptr: number, length: number, verbosity: Verbosity, maxEditDistance: number, includeUnknowns: boolean) => void;
    write_to_dictionary: (prt: number, offset: number) => void;
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
}
export declare type ResultsHandler = (suggestedItems: SuggestedItem[]) => void;
/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
export declare class SpellcheckerWasm {
    protected wasmSymSpell: WasmSymSpell;
    protected writeBuffer: Uint8Array;
    /**
     * The handler set by the consumer to receive
     * suggested items from the wasm.
     */
    resultHandler: ResultsHandler;
    constructor(resultHandler?: ResultsHandler);
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
    writeToDictionary(chunk: Uint8Array): void;
    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmLocation
     * @param dictionaryLocation
     * @param options
     */
    prepareSpellchecker(wasmLocation: string, dictionaryLocation: string, options?: SymSpellOptions): Promise<boolean>;
    /**
     * Performs a single spelling check based on the supplied word and options.
     * The suggestions list will be provided to the resultHandler().
     *
     * @param word string The word to perform spell checking on.
     * @param options CheckSpellingOptions The options to use for this spell check lookup
     */
    checkSpelling(word: Uint8Array | string, options?: CheckSpellingOptions): void;
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
     */
    protected writeToBuffer(chunk: Uint8Array): void;
}
