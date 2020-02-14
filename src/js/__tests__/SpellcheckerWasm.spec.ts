import {SpellcheckerWasm} from '../nodejs/SpellcheckerWasm';
import {resolve} from 'path';
import expect from 'expect.js';
import testMap from './language_tests_map.json';

for (const region in testMap) {
    const regionConfig = testMap[region];
    const commonMisspellings: { correctSpelling: string, misspellings: string[] }[] = require(`./commonMisspellings${regionConfig.filesuffix}.json`);
    const wasmPath = resolve(__dirname, '../../../lib/spellchecker-wasm.wasm');
    const dictionaryLocation = resolve(__dirname, `../../../lib/frequency_dictionary${regionConfig.filesuffix}.txt`);
    const bigramLocation = resolve(__dirname, '../../../lib/frequency_bigramdictionary_en_243_342.txt');

    describe(`SpellcheckerWasm - ${region}`, function() {
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
                    // console.log("Checked:", word, "\n  Spellcheck suggestions:", terms, "\n  Correct spelling:", correctSpelling, "\n  Common Mispellings:", misspellings);
                    expect(terms.indexOf(correctSpelling.toLowerCase())).to.not.equal(-1);
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
            spellchecker.checkSpellingCompound('begining sentances with misspeled words is outragous and mischievious');
            [s, n] = process.hrtime(t);
            process.stdout.write(`compound lookup time: ${(s * 1000) + n / 1000 / 1000} ms\n`);
            expect(lastResults[0].toJSON()).to.eql({"count": 0,"distance": 5,"term": "beginning sentences with misspelled words is outrageous and mischievous"})
        });

        it('should provide SuggestedItems that serialize to JSON properly', async () => {
            let lastResults;
            const resultsHandler = results => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
            spellchecker.checkSpelling('acheive!');
            expect(lastResults[0].toJSON()).to.eql(regionConfig.verifyJsonSerializationResponse)
        });

        it('should write custom words to the dictionary', async () => {
            let lastResults;
            const resultsHandler = results => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
            spellchecker.checkSpelling('asdf');
            expect(lastResults.length).to.equal(regionConfig.writeCustomWordsResultLength);
            spellchecker.writeToDictionary(Buffer.from('asdf 10000\n'));
            spellchecker.checkSpelling('asdf');
            expect(lastResults.length).to.equal(0);
        });

        it('should perform lookups on words containing accented chars', async () => {
            let lastResults;
            const resultsHandler = results => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
            spellchecker.checkSpelling('crèche');
            expect(lastResults[0].toJSON()).to.eql(regionConfig.verifyAccentedCharResponse)

        });
    });
}