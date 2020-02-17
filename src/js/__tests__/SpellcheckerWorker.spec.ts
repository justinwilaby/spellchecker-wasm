import {resolve} from 'path';
import {Worker, MessageChannel} from 'worker_threads';
import {equal} from 'assert';
import {deserializeSuggestedItems, SuggestedItem} from '../SuggestedItem';

describe('The SpellcheckerWorker', function() {
    this.timeout(5000);
    const {port1, port2} = new MessageChannel();
    let worker: Worker;

    after(() => {
        worker.terminate();
    });

    before(async () => {
        worker = new Worker(resolve(__dirname, '../../../lib/SpellcheckerWorker.js'));
        worker.once("online", () => {
            const wasmPath = resolve(__dirname, '../../../lib/spellchecker-wasm.wasm');
            const dictionaryLocation = resolve(__dirname, '../../../lib/frequency_dictionary_en_82_765.txt');
            const bigramLocation = resolve(__dirname, '../../../lib/frequency_bigramdictionary_en_243_342.txt');
            worker.postMessage([port2, wasmPath, dictionaryLocation, bigramLocation], [port2]);
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
                resolve(deserializeSuggestedItems(data, 0, data.length));
            });
        });

        port1.postMessage('misspeled');
        const results = await resultsPromise;
        equal(results[0].term, 'misspelled');
    });

    it('should send receive messages for processing compound lookups', async () => {
        const resultsPromise: Promise<SuggestedItem[]> = new Promise(resolve => {
            port1.addListener('message', data => {
                resolve(deserializeSuggestedItems(data, 0, data.length));
            });
        });

        port1.postMessage('parliment collaegues preceed publicaly with disasterous drunkeness');
        const results = await resultsPromise;
        equal(results[0].term, 'parliament colleagues proceed publicly with disastrous drunkenness');
    });

    it('should support passing configuration options to the spellchecker', async () => {
        const resultsPromise: Promise<SuggestedItem[]> = new Promise(resolve => {
            port1.addListener('message', data => {
                resolve(deserializeSuggestedItems(data, 0, data.length));
            });
        });

        port1.postMessage({
            word: 'thereeeeeeeee',
            options: {
                includeSelf: false,
                includeUnknown: true,
                maxEditDistance: 2,
                verbosity: 2,
            }
        });
        const results = await resultsPromise;
        equal(results.length, 1);
        equal(results[0].term, 'thereeeeeeeee');
    });

});
