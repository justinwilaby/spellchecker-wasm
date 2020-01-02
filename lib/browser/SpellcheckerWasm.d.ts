import { ResultsHandler, SpellcheckerBase, SymSpellOptions } from '../SpellCheckerBase';
/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality
 * for modern browsers. The primary difference is the prepareSpellchecker
 * function accepts Response objects from fetch requests for all external
 * assets.
 */
export declare class SpellcheckerWasm extends SpellcheckerBase {
    private static encoder;
    constructor(resultHandler?: ResultsHandler);
    protected encodeString(str: string): Uint8Array;
    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmFetchResponse The Response from a fetch request for the spellchecker-wasm.wasm
     * @param dictionaryFetchResponse The Response from a fetch request for the standard dictionary
     * @param bigramFetchResponse (optional) The Response from a fetch request for the bigram dictionary
     * @param options (optional) The SymSpell options to use.
     */
    prepareSpellchecker(wasmFetchResponse: string | Response, dictionaryFetchResponse: string | Response, bigramFetchResponse?: string | Response, options?: SymSpellOptions): Promise<void>;
}
