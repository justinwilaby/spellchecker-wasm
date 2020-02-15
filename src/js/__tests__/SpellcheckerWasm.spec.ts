import {SpellcheckerWasm} from '../nodejs/SpellcheckerWasm';
import {resolve} from 'path';
import {equal, deepEqual, notEqual} from 'assert';

const commonMisspellings: { correctSpelling: string, misspellings: string[] }[] = require('./commonMisspellings.json');
const wasmPath = resolve(__dirname, '../../../lib/spellchecker-wasm.wasm');
const dictionaryLocation = resolve(__dirname, './frequency_dictionary_en_82_765.txt');
const bigramLocation = resolve(__dirname, './frequency_bigramdictionary_en_243_342.txt');
const russianDictionaryLocation = resolve(__dirname, './small_dictionary_ru.txt');

describe('SpellcheckerWasm', function() {
    this.timeout(15000);
    it('should read from the supplied dictionary and perform lookups', async () => {
        let lastResults;
        const resultsHandler = results => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        let t = process.hrtime();
        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
        let [s, n] = process.hrtime(t);
        process.stdout.write(`standard dictionary loaded in ${(s * 1000) + n / 1000 / 1000} ms\n`);
        let lookupTimes = [];
        commonMisspellings.forEach(({correctSpelling, misspellings}) => {
            misspellings.forEach(word => {
                t = process.hrtime();
                spellchecker.checkSpelling(word.toLowerCase());
                let [s, n] = process.hrtime(t);
                lookupTimes.push((s * 1000) + n / 1000 / 1000);
                const terms = lastResults.map(result => result.term);
                notEqual(terms.indexOf(correctSpelling.toLowerCase()), -1);
            })
        });
        const totalTime = lookupTimes.reduce((previousValue, currentValue) => (previousValue += currentValue));
        process.stdout.write(`Average lookup time: ${totalTime / lookupTimes.length} ms\n`)
    });

    it('should read from the bigram dictionary and perform compound lookups', async () => {
        let lastResults;
        const resultsHandler = results => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        let t = process.hrtime();
        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation, bigramLocation);
        let [s, n] = process.hrtime(t);
        process.stdout.write(`standard dictionary and bigram dictionary loaded in ${(s * 1000) + n / 1000 / 1000} ms\n`);
        t = process.hrtime();
        spellchecker.checkSpellingCompound('begining sentances with mispelled words is outragous and mischievious');
        [s, n] = process.hrtime(t);
        process.stdout.write(`compound lookup time: ${(s * 1000) + n / 1000 / 1000} ms\n`);
        deepEqual(lastResults[0].toJSON(), {"count": 0,"distance": 5,"term": "beginning sentences with misspelled words is outrageous and mischievous"})
    });

    it('should provide SuggestedItems that serialize to JSON properly', async () => {
        let lastResults;
        const resultsHandler = results => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
        spellchecker.checkSpelling('acheive!');
        deepEqual(lastResults[0].toJSON(), {"count":2733276,"distance":2,"term":"achieve"});
    });

    it('should write custom words to the dictionary', async () => {
        let lastResults;
        const resultsHandler = results => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
        spellchecker.checkSpelling('asdf');
        equal(lastResults.length, 49);
        spellchecker.writeToDictionary(Buffer.from('asdf 10000\n'));
        spellchecker.checkSpelling('asdf');
        equal(lastResults.length, 0);
    });

    it('should perform lookups on words containing accented chars', async () => {
        let lastResults;
        const resultsHandler = results => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
        spellchecker.checkSpelling('crèche');
        deepEqual(lastResults[0].toJSON(), {"count":19317,"distance":1,"term":"creche"});
    });

    it('should perform lookups using custom lookup options', async () => {
        let lastResults;
        const resultsHandler = results => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation, null, {countThreshold: 2, dictionaryEditDistance: 7});
        spellchecker.checkSpelling('cofvfee', {
            includeUnknown: false,
            maxEditDistance: 4,
            verbosity: 1,
            includeSelf: false
        });
        deepEqual(lastResults[0].toJSON(), {"count": 4208682, "distance": 1, "term": "coffee"});

        spellchecker.checkSpelling('eradicate', {
            includeUnknown: false,
            maxEditDistance: 4,
            verbosity: 1,
            includeSelf: true
        });
        deepEqual(lastResults[0].toJSON(), {"count": 85274, "distance": 0, "term": "eradicate"});
    });

    it('should support dictionaries in other languages with UTF-8 characters', async () => {
        let lastResults;
        const resultsHandler = results => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, russianDictionaryLocation);
        spellchecker.checkSpelling('свойй');
        deepEqual(lastResults[0].toJSON(), {"count": 28678, "distance": 1, "term": "свой"});
    });
});
