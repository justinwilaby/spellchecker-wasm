import {SuggestedItem} from "./SuggestedItem";
import {deserializeSuggestedItems} from "./utils";
import {createReadStream, promises} from "fs";

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

const defaultOptions: SymSpellOptions = {
    dictionaryEditDistance: 7,
    countThreshold: 1
};

const defaultCheckSpellingOptions: CheckSpellingOptions = {
    includeUnknown: false,
    maxEditDistance: 2,
    verbosity: Verbosity.Closest
};

/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
export class SpellcheckerWasm {
    protected wasmSymSpell: WasmSymSpell;
    protected writeBuffer: Uint8Array;

    /**
     * The handler set by the consumer to receive
     * suggested items from the wasm.
     */
    public resultHandler: ResultsHandler;

    constructor(resultHandler?: ResultsHandler) {
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
    public async prepareSpellchecker(
        wasmLocation: string,
        dictionaryLocation: string,
        bigramLocation: string = null,
        options: SymSpellOptions = defaultOptions): Promise<void> {

        const wasmBytes = await promises.readFile('' + wasmLocation);
        const result = await WebAssembly.instantiate(wasmBytes, {
            env: {
                memoryBase: 0,
                tableBase: 0,
                memory: new WebAssembly.Memory({initial: 1}),
                table: new WebAssembly.Table({initial: 1, element: 'anyfunc'}),
                result_handler: this.resultTrap
            }
        });

        if (!result) {
            throw new Error(`Failed to instantiate the parser.`);
        }

        const {symspell, write_to_dictionary, lookup, lookup_compound, memory} = result.instance.exports as WasmSymSpell;
        this.wasmSymSpell = {symspell, write_to_dictionary, lookup, lookup_compound, memory};

        symspell(2, 7);
        const newline = new Uint8Array([10]);
        await new Promise(resolve => {

            const dictionaryReadStream = createReadStream(dictionaryLocation);
            dictionaryReadStream.on('data', (chunk) => {
                this.writeToBuffer(chunk, memory);
                write_to_dictionary(0, chunk.length, false);
            });

            dictionaryReadStream.on('close', () => {
                this.writeToBuffer(newline, memory); // Closes the stream
                write_to_dictionary(0, 1, false);
                resolve()
            });
        });

        await new Promise(resolve => {
            if (!bigramLocation) {
                return resolve();
            }

            const bigramReadStream = createReadStream(bigramLocation);
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
    public checkSpelling(word: Uint8Array | string, options: CheckSpellingOptions = defaultCheckSpellingOptions): void {
        const {lookup, memory} = this.wasmSymSpell;
        let encodedString;
        if (word instanceof Uint8Array) {
            encodedString = word;
        } else {
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
    public checkSpellingCompound(sentence: Uint8Array | string, options: Pick<CheckSpellingOptions, 'maxEditDistance'> = defaultCheckSpellingOptions): void {
        const {lookup_compound, memory} = this.wasmSymSpell;
        let encodedString;
        if (sentence instanceof Uint8Array) {
            encodedString = sentence;
        } else {
            encodedString = Buffer.from(sentence);
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
    protected writeToBuffer(chunk: Uint8Array, memory: WebAssembly.Memory): void {
        if (!this.writeBuffer || this.writeBuffer.buffer !== memory.buffer || this.writeBuffer.byteLength < chunk.byteLength) {
            this.writeBuffer = new Uint8Array(memory.buffer, 0, chunk.byteLength);
        }
        this.writeBuffer.set(chunk, 0);
    }
}
