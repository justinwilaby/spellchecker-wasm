import {createReadStream, promises} from "fs";
import {defaultOptions, ResultsHandler, SpellcheckerBase, SymSpellOptions, WasmSymSpell} from '../SpellCheckerBase';
import {SuggestedItem} from '../SuggestedItem';

/**
 * This class provides the wrapper for the spellcheck-wasm.wasm functionality.
 */
export class SpellcheckerWasm extends SpellcheckerBase {

    constructor(resultHandler?: ResultsHandler) {
        super(resultHandler);
        SuggestedItem.decodeString = (data: Uint8Array) => Buffer.from(data).toString('utf8');
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
        wasmLocation: string | Response,
        dictionaryLocation: string | Response,
        bigramLocation: string | Response = null,
        options: SymSpellOptions = defaultOptions): Promise<void> {
        if (typeof wasmLocation !== 'string') {
            throw new TypeError('The wasmLocation argument must be a string')
        }
        if (typeof dictionaryLocation !== 'string') {
            throw new TypeError('The dictionaryLocation argument must be a string')
        }
        const wasmBytes = await promises.readFile(wasmLocation);
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

        symspell(options.dictionaryEditDistance, options.countThreshold);
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
            if (typeof bigramLocation !== 'string') {
                throw new TypeError('The bigramLocation argument must be a string')
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

    protected encodeString(str: string): Uint8Array {
        return Buffer.from(str);
    }
}
