import { defaultOptions, SpellcheckerBase } from './SpellCheckerBase.js';
import { SuggestedItem } from './SuggestedItem.js';
/**
 * Unified SpellcheckerWasm that works in both Node.js and browser environments.
 *
 * In Node.js: pass file path strings to prepareSpellchecker.
 * In browsers: pass Response objects from fetch() calls.
 */
export class SpellcheckerWasm extends SpellcheckerBase {
    encoder;
    decoder;
    constructor(resultHandler) {
        super(resultHandler);
        // Use global TextEncoder/TextDecoder (available in both Node.js and browsers)
        this.encoder = typeof globalThis.TextEncoder !== 'undefined'
            ? new globalThis.TextEncoder()
            : globalThis.TextEncoder();
        this.decoder = typeof globalThis.TextDecoder !== 'undefined'
            ? new globalThis.TextDecoder()
            : globalThis.TextDecoder();
        SuggestedItem.decodeString = (bytes) => this.decoder.decode(bytes);
    }
    encodeString(str) {
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
    async prepareSpellchecker(wasmLocation, dictionaryLocation, bigramLocation, options = defaultOptions) {
        this.prepared = false;
        this.dictionaryEditDistance = undefined;
        const resolvedOptions = { ...defaultOptions, ...options };
        for (const key of ['dictionaryEditDistance', 'countThreshold']) {
            if (!Number.isSafeInteger(resolvedOptions[key]) || resolvedOptions[key] < 0 || resolvedOptions[key] > 0xffffffff) {
                throw new RangeError(`${key} must be an integer between 0 and 4294967295`);
            }
        }
        // Detect if we're using Response objects (browser) or file paths (Node.js)
        const useFetch = wasmLocation instanceof Response;
        let result;
        if (useFetch) {
            // Browser: instantiate from streaming Response
            if (!(dictionaryLocation instanceof Response)) {
                throw new TypeError('The dictionaryLocation argument must be a Response object');
            }
            if (!wasmLocation.ok) {
                throw new Error(`WASM Response failed: ${wasmLocation.status} ${wasmLocation.statusText}`);
            }
            result = await WebAssembly.instantiateStreaming(wasmLocation, {
                env: {
                    memoryBase: 0,
                    tableBase: 0,
                    memory: new WebAssembly.Memory({ initial: 1 }),
                    table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' }),
                    result_handler: this.resultTrap
                }
            });
        }
        else {
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
                    memory: new WebAssembly.Memory({ initial: 1 }),
                    table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' }),
                    result_handler: this.resultTrap
                }
            });
        }
        if (!result) {
            throw new Error('Failed to instantiate the parser.');
        }
        const { symspell, write_to_dictionary, lookup, lookup_compound, memory } = result.instance.exports;
        this.wasmSymSpell = { symspell, write_to_dictionary, lookup, lookup_compound, memory };
        symspell(resolvedOptions.dictionaryEditDistance, resolvedOptions.countThreshold);
        const newline = new Uint8Array([10]);
        // Load standard dictionary
        await this.loadDictionary(dictionaryLocation, memory, write_to_dictionary, newline, false);
        // Load bigram dictionary if provided
        if (bigramLocation) {
            await this.loadDictionary(bigramLocation, memory, write_to_dictionary, newline, true);
        }
        this.prepared = true;
        this.dictionaryEditDistance = resolvedOptions.dictionaryEditDistance;
    }
    async loadDictionary(location, memory, write_to_dictionary, newline, isBigram) {
        if (location instanceof Response) {
            // Browser: stream from Response body
            if (!location.ok) {
                throw new Error(`Dictionary Response failed: ${location.status} ${location.statusText}`);
            }
            if (!location.body) {
                throw new Error('Dictionary Response body is null');
            }
            const reader = location.body.getReader();
            await this.streamReaderIntoDictionary(reader, memory, write_to_dictionary, newline, isBigram, location.headers.get('Content-Length'));
        }
        else {
            // Node.js: read from file stream
            if (typeof location !== 'string') {
                throw new TypeError('Dictionary location must be a string path or Response');
            }
            const fs = await import('fs');
            const stream = fs.createReadStream(location);
            await new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
                    this.writeToBuffer(new Uint8Array(data), memory);
                    if (!write_to_dictionary(0, data.length, isBigram)) {
                        stream.destroy(new TypeError('Dictionary contains invalid UTF-8'));
                    }
                });
                stream.on('close', () => {
                    if (stream.errored)
                        return;
                    this.writeToBuffer(newline, memory);
                    if (write_to_dictionary(0, 1, isBigram))
                        resolve();
                    else
                        reject(new TypeError('Dictionary contains invalid UTF-8'));
                });
                stream.on('error', reject);
            });
        }
    }
    async streamReaderIntoDictionary(reader, memory, write_to_dictionary, newline, isBigram, contentLength) {
        let totalBytes = 0;
        while (true) {
            const readResult = await reader.read();
            if (readResult.done) {
                if (contentLength !== null && Number(contentLength) !== totalBytes) {
                    throw new Error(`Dictionary Response is incomplete: expected ${contentLength} bytes, received ${totalBytes}`);
                }
                this.writeToBuffer(newline, memory);
                if (!write_to_dictionary(0, 1, isBigram)) {
                    throw new TypeError('Dictionary contains invalid UTF-8');
                }
                return;
            }
            totalBytes += readResult.value.byteLength;
            let p = 0;
            const chunkSize = 1024 * 1024; // 1MB chunks
            while (p < readResult.value.length) {
                const slice = readResult.value.slice(p, p + chunkSize);
                p += chunkSize;
                this.writeToBuffer(slice, memory);
                if (!write_to_dictionary(0, slice.byteLength, isBigram)) {
                    throw new TypeError('Dictionary contains invalid UTF-8');
                }
            }
        }
    }
}
