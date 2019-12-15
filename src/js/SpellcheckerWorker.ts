import {MessagePort, parentPort} from 'worker_threads';
import {SpellcheckerWasm} from './SpellcheckerWasm';

/**
 * The SpellcheckerWorker class extends SpellcheckWasm
 * to provide the logic for preparing the wasm,
 * loading the dictionary and performing the spell
 * checking.
 */
class SpellcheckerWorker extends SpellcheckerWasm {
    private port2: MessagePort;

    constructor() {
        super();
        parentPort.once('message', this.initializationMessage);
    }

    /**
     * @override
     *
     * Overrides the resultTrap to write the results to the shared
     * memory buffer and message the parent process of the pointer
     * and length which contains the SuggestedItems.
     *
     * @param ptr number The pointer to the index in the shared memory where the suggested results live
     * @param length number The length of this result set in bytes.
     */
    protected resultTrap = (ptr: number, length: number): void => {
        // Write the block from the wasm memory to the shared memory
        const {memory} = this.wasmSymSpell;
        const slice = new Uint8Array(memory.buffer.slice(ptr, ptr + length));
        this.port2.postMessage(slice);
    }

    private initializationMessage = async (value: [MessagePort, string, string]): Promise<void> => {
        const [port2, wasmPath, dictionaryPath] = value;

        this.port2 = port2;
        this.port2.addListener('message', this.inboundMessageHandler);
        try {
            await this.prepareSpellchecker(wasmPath, dictionaryPath);
        } catch (e) {
            this.port2.postMessage(`Error: ${e.message}`);
        }

        this.port2.postMessage('ready');
    }

    private inboundMessageHandler = (word: string): void => {
        this.checkSpelling(word.trim())
    }
}

const spellcheckWorker = new SpellcheckerWorker();