import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SpellcheckerWasm } from '../SpellcheckerWasm.ts';
import type { ResultsHandler } from '../SpellCheckerBase.ts';
import type { SuggestedItem } from '../SuggestedItem.ts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import testMap from './language_tests_map.json' with { type: 'json' };

interface RegionConfig {
    filesuffix: string;
    verifyJsonSerializationResponse: { count: number; distance: number; term: string };
    writeCustomWordsResultLength: number;
    verifyAccentedCharResponse: { count: number; distance: number; term: string };
    customLookupResponse: { count: number; distance: number; term: string };
    correctTermResponse: { count: number; distance: number; term: string };
}

const testMapTyped = testMap as Record<string, RegionConfig>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = join(__dirname, '../../../lib/spellchecker-wasm.wasm');
const russianDictionaryLocation = join(__dirname, './small_dictionary_ru.txt');

type CommonMisspelling = { correctSpelling: string; misspellings: string[] };

async function runRegionTests(region: string, regionConfig: RegionConfig) {
    const { default: commonMisspellings } = await import(
        `./commonMisspellings${regionConfig.filesuffix}.json`,
        { with: { type: 'json' } }
    ) as { default: CommonMisspelling[] };
    const dictionaryLocation = join(__dirname, `../../../lib/frequency_dictionary${regionConfig.filesuffix}.txt`);
    const bigramLocation = join(__dirname, '../../../lib/frequency_bigramdictionary_en_243_342.txt');

    describe(`SpellcheckerWasm - ${region}`, () => {
        it('should read from the supplied dictionary and perform lookups', { timeout: 30000 }, async () => {
            let lastResults: SuggestedItem[];
            const resultsHandler: ResultsHandler = (results) => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            let t = process.hrtime();
            await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
            let [s, n] = process.hrtime(t);
            process.stdout.write(
                `standard dictionary loaded in ${(s * 1000) + n / 1000 / 1000} ms\n`
            );
            let lookupTimes: number[] = [];
            commonMisspellings.forEach(({ correctSpelling, misspellings }) => {
                misspellings.forEach(word => {
                    t = process.hrtime();
                    spellchecker.checkSpelling(word.toLowerCase());
                    let [s, n] = process.hrtime(t);
                    lookupTimes.push((s * 1000) + n / 1000 / 1000);
                    const terms = lastResults!.map(result => result.term);
                    assert.notStrictEqual(
                        terms.indexOf(correctSpelling.toLowerCase()),
                        -1
                    );
                });
            });
            const totalTime = lookupTimes.reduce(
                (previousValue, currentValue) =>
                    (previousValue += currentValue)
            );
            process.stdout.write(
                `Average lookup time: ${totalTime / lookupTimes.length} ms\n`
            );
        });

        it('should read from the bigram dictionary and perform compound lookups', { timeout: 30000 }, async () => {
            let lastResults: SuggestedItem[];
            const resultsHandler: ResultsHandler = (results) => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            let t = process.hrtime();
            await spellchecker.prepareSpellchecker(
                wasmPath,
                dictionaryLocation,
                bigramLocation
            );
            let [s, n] = process.hrtime(t);
            process.stdout.write(
                `standard dictionary and bigram dictionary loaded in ` +
                `${(s * 1000) + n / 1000 / 1000} ms\n`
            );
            t = process.hrtime();
            spellchecker.checkSpellingCompound(
                'begining sentances with misspeled words is outragous and mischievious'
            );
            [s, n] = process.hrtime(t);
            process.stdout.write(`compound lookup time: ${(s * 1000) + n / 1000 / 1000} ms\n`);
            assert.deepStrictEqual(
                lastResults![0].toJSON(),
                {
                    count: 0,
                    distance: 5,
                    term:
                        'beginning sentences with misspelled words is outrageous and mischievous',
                }
            );
        });

        it('should provide SuggestedItems that serialize to JSON properly', { timeout: 30000 }, async () => {
            let lastResults: SuggestedItem[];
            const resultsHandler: ResultsHandler = (results) => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
            spellchecker.checkSpelling('acheive!');
            assert.deepStrictEqual(
                lastResults![0].toJSON(),
                regionConfig.verifyJsonSerializationResponse
            );
        });

        it('should write custom words to the dictionary', { timeout: 30000 }, async () => {
            let lastResults: SuggestedItem[];
            const resultsHandler: ResultsHandler = (results) => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
            spellchecker.checkSpelling('asdf');
            assert.strictEqual(
                lastResults!.length,
                regionConfig.writeCustomWordsResultLength
            );
            spellchecker.writeToDictionary(Buffer.from('asdf 10000\n'));
            spellchecker.checkSpelling('asdf');
            assert.strictEqual(lastResults!.length, 0);
        });

        it('should perform lookups on words containing accented chars', { timeout: 30000 }, async () => {
            let lastResults: SuggestedItem[];
            const resultsHandler: ResultsHandler = (results) => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
            spellchecker.checkSpelling('crèche');
            assert.deepStrictEqual(
                lastResults![0].toJSON(),
                regionConfig.verifyAccentedCharResponse
            );
        });

        it('should perform lookups using custom lookup options', { timeout: 30000 }, async () => {
            let lastResults: SuggestedItem[];
            const resultsHandler: ResultsHandler = (results) => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(
                wasmPath,
                dictionaryLocation,
                undefined,
                {
                    countThreshold: 2,
                    dictionaryEditDistance: 7,
                }
            );
            spellchecker.checkSpelling('cofvfee', {
                includeUnknown: false,
                maxEditDistance: 4,
                verbosity: 1,
                includeSelf: false,
            });
            assert.deepStrictEqual(
                lastResults![0].toJSON(),
                regionConfig.customLookupResponse
            );
        });

        it('should return self for correct terms', { timeout: 30000 }, async () => {
            let lastResults: SuggestedItem[];
            const resultsHandler: ResultsHandler = (results) => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(
                wasmPath,
                dictionaryLocation,
                undefined,
                {
                    countThreshold: 2,
                    dictionaryEditDistance: 7,
                }
            );
            spellchecker.checkSpelling('eradicate', {
                includeUnknown: false,
                maxEditDistance: 4,
                verbosity: 1,
                includeSelf: true,
            });
            assert.deepStrictEqual(
                lastResults![0].toJSON(),
                regionConfig.correctTermResponse
            );
        });
    });
}

// Generate tests for each region
for (const region of Object.keys(testMapTyped)) {
    runRegionTests(region, testMapTyped[region]);
}

// Multi-byte UTF-8 tests
describe('SpellcheckerWasm - Multi-byte UTF-8', () => {
    it('should support dictionaries in other languages with UTF-8 characters', { timeout: 30000 }, async () => {
        let lastResults: SuggestedItem[];
        const resultsHandler: ResultsHandler = (results) => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, russianDictionaryLocation);
        spellchecker.checkSpelling('свойй');
        assert.deepStrictEqual(
            lastResults![0].toJSON(),
            { count: 28678, distance: 1, term: 'свой' }
        );
    });
});
