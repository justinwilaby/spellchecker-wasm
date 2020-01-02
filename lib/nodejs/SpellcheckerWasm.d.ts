import { ResultsHandler, SpellcheckerBase, SymSpellOptions } from '../SpellCheckerBase';
/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
export declare class SpellcheckerWasm extends SpellcheckerBase {
    constructor(resultHandler?: ResultsHandler);
    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmLocation
     * @param dictionaryLocation
     * @param bigramLocation
     * @param options
     */
    prepareSpellchecker(wasmLocation: string | Response, dictionaryLocation: string | Response, bigramLocation?: string | Response, options?: SymSpellOptions): Promise<void>;
    protected encodeString(str: string): Uint8Array;
}
