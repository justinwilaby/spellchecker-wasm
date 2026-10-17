import type {ResultsHandler, SymSpellOptions, WasmSymSpell} from './SpellCheckerBase.ts';
import {defaultOptions, SpellcheckerBase} from './SpellCheckerBase.ts';
import {SuggestedItem} from './SuggestedItem.ts';

/**
 * Unified SpellcheckerWasm that works in both Node.js and browser environments.
 *
 * In Node.js: pass file path strings to prepareSpellchecker.
 * In browsers: pass Response objects from fetch() calls.
 */
export class SpellcheckerWasm extends SpellcheckerBase {
    private encoder: TextEncoder;
    private decoder: TextDecoder;

    constructor(resultHandler?: ResultsHandler) {
        super(resultHandler);
        // Use global TextEncoder/TextDecoder (available in both Node.js and browsers)
        this.encoder = typeof globalThis.TextEncoder !== 'undefined'
            ? new globalThis.TextEncoder()
            : (globalThis as any).TextEncoder();
        this.decoder = typeof globalThis.TextDecoder !== 'undefined'
            ? new globalThis.TextDecoder()
            : (globalThis as any).TextDecoder();

        SuggestedItem.decodeString = (bytes: Uint8Array) => this.decoder.decode(bytes);
    }

    protected encodeString(str: string): Uint8Array {
        return this.encoder.encode(str);
    }

    /**
     * Prepares the spellcheck wasm for use.
     *
     * @param wasmLocation Path string (Node.js) or Response object (browser) for the WASM file
     * @param dictionaryLocation Path string (Node.js) or Response object (browser) for the dictionary
     * @param bigramLocation (optional) Path string or Response object for the bigram dictionary
     * @param options (optional) SymSpell options
     */
    public async prepareSpellchecker(
        wasmLocation: string | Response,
        dictionaryLocation: string | Response,
        bigramLocation?: string | Response,
        options: SymSpellOptions = defaultOptions): Promise<void> {
        this.prepared = false;

        // Detect if we're using Response objects (browser) or file paths (Node.js)
        const useFetch = wasmLocation instanceof Response;

        let result: WebAssembly.WebAssemblyInstantiatedSource;

        if (useFetch) {
            // Browser: instantiate from streaming Response
            if (!(dictionaryLocation instanceof Response)) {
                throw new TypeError('The dictionaryLocation argument must be a Response object');
            }
            result = await WebAssembly.instantiateStreaming(wasmLocation, {
                env: {
                    memoryBase: 0,
                    tableBase: 0,
                    memory: new WebAssembly.Memory({initial: 1}),
                    table: new WebAssembly.Table({initial: 1, element: 'anyfunc'}),
                    result_handler: this.resultTrap
                }
            });
        } else {
            // Node.js: read WASM file and instantiate
            if (typeof wasmLocation !== 'string') {
                throw new TypeError('The wasmLocation argument must be a string path');
            }
            if (typeof dictionaryLocation !== 'string') {
                throw new TypeError('The dictionaryLocation argument must be a string path');
            }
            const fs = await import('fs/promises');
            const wasmBytes = await fs.readFile(wasmLocation);
            result = await WebAssembly.instantiate(wasmBytes, {
                env: {
                    memoryBase: 0,
                    tableBase: 0,
                    memory: new WebAssembly.Memory({initial: 1}),
                    table: new WebAssembly.Table({initial: 1, element: 'anyfunc'}),
                    result_handler: this.resultTrap
                }
            });
        }

        if (!result) {
            throw new Error('Failed to instantiate the parser.');
        }

        const {symspell, write_to_dictionary, lookup, lookup_compound, memory} = result.instance.exports as WasmSymSpell;
        this.wasmSymSpell = {symspell, write_to_dictionary, lookup, lookup_compound, memory};

        symspell(options.dictionaryEditDistance, options.countThreshold);
        const newline = new Uint8Array([10]);

        // Load standard dictionary
        await this.loadDictionary(dictionaryLocation, memory, write_to_dictionary, newline, false);

        // Load bigram dictionary if provided
        if (bigramLocation) {
            await this.loadDictionary(bigramLocation, memory, write_to_dictionary, newline, true);
        }
        this.prepared = true;
    }

    private async loadDictionary(
        location: string | Response,
        memory: WebAssembly.Memory,
        write_to_dictionary: (ptr: number, length: number, isBigram: boolean) => void,
        newline: Uint8Array,
        isBigram: boolean): Promise<void> {

        if (location instanceof Response) {
            // Browser: stream from Response body
            if (!location.body) {
                throw new Error('Dictionary Response body is null');
            }
            const reader = location.body.getReader();
            await this.streamReaderIntoDictionary(reader, memory, write_to_dictionary, newline, isBigram);
        } else {
            // Node.js: read from file stream
            if (typeof location !== 'string') {
                throw new TypeError('Dictionary location must be a string path or Response');
            }
            const fs = await import('fs');
            const stream = fs.createReadStream(location);
            await new Promise<void>((resolve, reject) => {
                stream.on('data', (chunk: Buffer | string) => {
                    const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
                    this.writeToBuffer(new Uint8Array(data), memory);
                    write_to_dictionary(0, data.length, isBigram);
                });
                stream.on('close', () => {
                    this.writeToBuffer(newline, memory);
                    write_to_dictionary(0, 1, isBigram);
                    resolve();
                });
                stream.on('error', reject);
            });
        }
    }

    private async streamReaderIntoDictionary(
        reader: ReadableStreamDefaultReader,
        memory: WebAssembly.Memory,
        write_to_dictionary: (ptr: number, length: number, isBigram: boolean) => void,
        newline: Uint8Array,
        isBigram: boolean): Promise<void> {

        while (true) {
            const readResult = await reader.read();
            if (readResult.done) {
                this.writeToBuffer(newline, memory);
                write_to_dictionary(0, 1, isBigram);
                return;
            }
            let p = 0;
            const chunkSize = 1024 * 1024; // 1MB chunks
            while (p < readResult.value.length) {
                const slice = readResult.value.slice(p, p + chunkSize);
                p += chunkSize;
                this.writeToBuffer(slice, memory);
                write_to_dictionary(0, slice.byteLength, isBigram);
            }
        }
    }
}
