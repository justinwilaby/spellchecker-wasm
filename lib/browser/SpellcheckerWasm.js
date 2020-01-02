"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SpellCheckerBase_1 = require("../SpellCheckerBase");
const SuggestedItem_1 = require("../SuggestedItem");
/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality
 * for modern browsers. The primary difference is the prepareSpellchecker
 * function accepts Response objects from fetch requests for all external
 * assets.
 */
class SpellcheckerWasm extends SpellCheckerBase_1.SpellcheckerBase {
    constructor(resultHandler) {
        super(resultHandler);
        const decoder = new TextDecoder();
        SuggestedItem_1.SuggestedItem.decodeString = bytes => decoder.decode(bytes);
    }
    encodeString(str) {
        return SpellcheckerWasm.encoder.encode(str);
    }
    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmFetchResponse The Response from a fetch request for the spellchecker-wasm.wasm
     * @param dictionaryFetchResponse The Response from a fetch request for the standard dictionary
     * @param bigramFetchResponse (optional) The Response from a fetch request for the bigram dictionary
     * @param options (optional) The SymSpell options to use.
     */
    async prepareSpellchecker(wasmFetchResponse, dictionaryFetchResponse, bigramFetchResponse = null, options = SpellCheckerBase_1.defaultOptions) {
        if (!(wasmFetchResponse instanceof Response)) {
            throw new TypeError('The wasmFetchResponse argument must be a Response object');
        }
        if (!(dictionaryFetchResponse instanceof Response)) {
            throw new TypeError('The dictionaryFetchResponse argument must be a Response object');
        }
        const result = await WebAssembly.instantiateStreaming(wasmFetchResponse, {
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
        const readStreamIntoDictionary = async (reader, isBigram) => {
            while (true) {
                const readResult = await reader.read();
                if (readResult.done) {
                    this.writeToBuffer(newline, memory); // Closes the stream
                    write_to_dictionary(0, 1, false);
                    return;
                }
                this.writeToBuffer(readResult.value, memory);
                write_to_dictionary(0, readResult.value.length, isBigram);
            }
        };
        await readStreamIntoDictionary(dictionaryFetchResponse.body.getReader(), false);
        if (!bigramFetchResponse) {
            return;
        }
        if (!(bigramFetchResponse instanceof Response)) {
            throw new TypeError('The bigramFetchResponse argument must be a Response object');
        }
        await readStreamIntoDictionary(bigramFetchResponse.body.getReader(), false);
    }
}
exports.SpellcheckerWasm = SpellcheckerWasm;
SpellcheckerWasm.encoder = new TextEncoder();
