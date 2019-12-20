import {resolve} from 'path';
import {Worker, MessageChannel} from 'worker_threads';
import {deserializeSuggestedItems} from '../utils';
import {equal, notEqual} from 'assert';
import {SuggestedItem} from "../SuggestedItem";

describe('The SpellcheckerWorker', () => {
    const {port1, port2} = new MessageChannel();
    let worker: Worker;
    after(() => {
        worker.terminate();
    });
    before(async () => {
        worker = new Worker(resolve(__dirname, '../../../lib/SpellcheckerWorker.js'));
        worker.once("online", () => {
            const wasmPath = resolve(__dirname, '../../../lib/spellchecker-wasm.wasm');
            const dictionaryLocation = resolve(__dirname, './frequency_dictionary_en_82_765.txt');
            worker.postMessage([port2, wasmPath, dictionaryLocation], [port2]);
        });

        await new Promise(resolve => {
            port1.once('message', data => {
                if (data === 'ready') {
                    resolve()
                }
            });
        });
    });

    it('should send receive messages for processing spelling checks', async () => {
        const resultsPromise: Promise<SuggestedItem[]> = new Promise(resolve => {
            port1.addListener('message', data => {
                resolve(deserializeSuggestedItems(data, 0, data.length))
            });
        });

        port1.postMessage('misspeled');
        const results = await resultsPromise;
        equal(results.length, 1);
    })
});