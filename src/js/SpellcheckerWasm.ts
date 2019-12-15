import {SuggestedItem} from "./SuggestedItem";
import {deserializeSuggestedItems, encodeString} from "./utils";
import {createReadStream, promises} from "fs";

export interface WasmSymSpell extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    // ------------------------------------------
    // Exported wasm functions
    symspell: (dictionaryEditDistance: number, countThreshold: number) => void;

    lookup: (ptr: number, length: number, verbosity: Verbosity, maxEditDistance: number, includeUnknowns: boolean) => void;

    write_to_dictionary: (prt: number, offset: number) => void;
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
     * usually called several times while streaming the dictionary
     * file using fs.createReadStream() or fetch().
     *
     * Caution should be used since writing the entire file at once
     * often results in a memory out of bounds error. Chunking at 32-64kb
     * chunks is recommended.
     *
     * @param chunk Uint8Array The chunk containing the bytes to write
     */
    public writeToDictionary(chunk: Uint8Array): void {
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
    public async prepareSpellchecker(wasmLocation: string, dictionaryLocation: string, options: SymSpellOptions = defaultOptions): Promise<boolean> {
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
        if (result) {
            let t = process.hrtime();
            const {symspell, write_to_dictionary, lookup, memory} = result.instance.exports as WasmSymSpell;
            this.wasmSymSpell = {symspell, write_to_dictionary, lookup, memory};

            symspell(2, 7);

            let writeBuffer;
            const dictionaryReadStream = createReadStream(dictionaryLocation);
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
            return
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
    public checkSpelling(word: Uint8Array | string, options: CheckSpellingOptions = defaultCheckSpellingOptions): void {
        const {lookup} = this.wasmSymSpell;
        let encodedString;
        if (word instanceof Uint8Array) {
            encodedString = word;
        } else {
            encodedString = encodeString(word);
        }
        this.writeToBuffer(encodedString);
        lookup(0, encodedString.byteLength, options.verbosity, options.maxEditDistance, options.includeUnknown);
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
     */
    protected writeToBuffer(chunk: Uint8Array): void {
        new Uint8Array(this.wasmSymSpell.memory.buffer, 0, chunk.byteLength).set(chunk);
    }
}
