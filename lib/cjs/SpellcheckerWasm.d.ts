import type { ResultsHandler, SymSpellOptions } from './SpellCheckerBase.ts';
import { SpellcheckerBase } from './SpellCheckerBase.ts';
/**
 * Unified SpellcheckerWasm that works in both Node.js and browser environments.
 *
 * In Node.js: pass file path strings to prepareSpellchecker.
 * In browsers: pass Response objects from fetch() calls.
 */
export declare class SpellcheckerWasm extends SpellcheckerBase {
    private encoder;
    private decoder;
    constructor(resultHandler?: ResultsHandler);
    protected encodeString(str: string): Uint8Array;
    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmLocation Path string (Node.js) or Response object (browser) for the WASM file
     * @param dictionaryLocation Path string (Node.js) or Response object (browser) for the dictionary
     * @param bigramLocation (optional) Path string or Response object for the bigram dictionary
     * @param options (optional) SymSpell options
     */
    prepareSpellchecker(wasmLocation: string | Response, dictionaryLocation: string | Response, bigramLocation?: string | Response, options?: Partial<SymSpellOptions>): Promise<void>;
    private loadDictionary;
    private streamReaderIntoDictionary;
}
