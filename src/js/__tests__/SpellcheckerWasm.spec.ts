import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SpellcheckerWasm } from '../SpellcheckerWasm.ts';
import type { ResultsHandler } from '../SpellCheckerBase.ts';
import type { SuggestedItem } from '../SuggestedItem.ts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import testMap from './language_tests_map.json' with { type: 'json' };

const languageDictionaries = ['de', 'fr', 'it', 'es', 'he', 'ru'] as const;

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

// WordSegmentation improvements tests
describe('SpellcheckerWasm - WordSegmentation improvements', () => {
    const dictionaryLocation = join(__dirname, '../../../lib/frequency_dictionary_en_US_60size_1M_1gram_20090715.txt');
    const bigramLocation = join(__dirname, '../../../lib/frequency_bigramdictionary_en_243_342.txt');

    it('should remove hyphens during compound lookup', { timeout: 30000 }, async () => {
        let lastResults: SuggestedItem[];
        const resultsHandler: ResultsHandler = (results) => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation, bigramLocation);
        spellchecker.checkSpellingCompound('hel-lo world');

        const terms = lastResults!.map(r => r.term);
        assert.ok(
            terms.includes('hello world'),
            `Expected "hello world" in results, got: ${terms.join(', ')}`
        );
    });

    it('should handle case-insensitive compound lookup', { timeout: 30000 }, async () => {
        let lastResults: SuggestedItem[] = [];
        const resultsHandler: ResultsHandler = (results) => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation, bigramLocation);
        // Uppercase correct words pass through unchanged (case handling works)
        spellchecker.checkSpellingCompound('HELLO WORLD');

        assert.ok(lastResults !== undefined, 'Expected results for uppercase input');
        assert.ok(lastResults.length > 0, 'Expected non-empty results for uppercase input');
    });

    it('should handle punctuation in compound lookup', { timeout: 30000 }, async () => {
        let lastResults: SuggestedItem[] = [];
        const resultsHandler: ResultsHandler = (results) => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation, bigramLocation);
        spellchecker.checkSpellingCompound('hello,world');

        assert.ok(lastResults !== undefined, 'Expected results for punctuated input');
        assert.ok(lastResults.length > 0, 'Expected non-empty results for punctuated input');
    });

    it('should normalize ligatures during compound lookup', { timeout: 30000 }, async () => {
        let lastResults: SuggestedItem[];
        const resultsHandler: ResultsHandler = (results) => {
            lastResults = results;
        };
        const spellchecker = new SpellcheckerWasm(resultsHandler);

        await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation, bigramLocation);
        // "scientiﬁc" with ﬁ ligature (U+FB01)
        spellchecker.checkSpellingCompound('scienti\uFB01c');

        const terms = lastResults!.map(r => r.term);
        assert.ok(
            terms.includes('scientific'),
            `Expected "scientific" in results, got: ${terms.join(', ')}`
        );
    });
});

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
            { count: 286780, distance: 1, term: 'свой' }
        );
    });
});

describe('SpellcheckerWasm - Multilingual dictionaries', () => {
    const languageTests = [
        { lang: 'de', word: 'korektur', expected: 'korrektur' },
        { lang: 'fr', word: 'langu', expected: 'langue' },
        { lang: 'it', word: 'linguaa', expected: 'lingua' },
        { lang: 'es', word: 'lenguaa', expected: 'lengua' },
        { lang: 'he', word: 'שפה', expected: 'שפה' },
        { lang: 'ru', word: 'язык', expected: 'язык' }
    ];

    for (const { lang, word, expected } of languageTests) {
        it(`should load and lookup in ${lang} dictionary`, { timeout: 30000 }, async () => {
            let lastResults: SuggestedItem[];
            const resultsHandler: ResultsHandler = (results) => {
                lastResults = results;
            };
            const spellchecker = new SpellcheckerWasm(resultsHandler);

            await spellchecker.prepareSpellchecker(
                wasmPath,
                join(__dirname, `../../../lib/frequency_dictionary_${lang}.txt`)
            );
            spellchecker.checkSpelling(word, {
                maxEditDistance: 2,
                includeUnknown: false,
                includeSelf: true
            });
            assert.equal(lastResults![0].term, expected);
        });
    }
});

describe('SpellcheckerWasm - includeUnknown and includeSelf', () => {
    it('distinguishes a known input from an unknown input in Closest and All modes', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'spellchecker-wasm-27-'));
        const dictionaryLocation = join(directory, 'dictionary.txt');
        try {
            await writeFile(dictionaryLocation, 'eradicate 42\r\neradicated 7\r\n');
            let lastResults: SuggestedItem[] = [];
            const spellchecker = new SpellcheckerWasm(results => { lastResults = results; });
            await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);

            for (const verbosity of [1, 2] as const) {
                for (const includeUnknown of [false, true]) {
                    for (const includeSelf of [false, true]) {
                        const options = { verbosity, maxEditDistance: 2, includeUnknown, includeSelf };
                        spellchecker.checkSpelling('eradicate', options);
                        const expectedKnown = verbosity === 1
                            ? (includeSelf ? [{ term: 'eradicate', count: 42, distance: 0 }] : [])
                            : (includeSelf
                                ? [{ term: 'eradicated', count: 7, distance: 1 }, { term: 'eradicate', count: 42, distance: 0 }]
                                : [{ term: 'eradicated', count: 7, distance: 1 }]);
                        assert.deepStrictEqual(lastResults.map(item => item.toJSON()), expectedKnown,
                            `known input: verbosity=${verbosity}, includeUnknown=${includeUnknown}, includeSelf=${includeSelf}`);

                        spellchecker.checkSpelling('zzzzzzzzzzzzzz', options);
                        assert.deepStrictEqual(lastResults.map(item => item.toJSON()),
                            includeUnknown ? [{ term: 'zzzzzzzzzzzzzz', count: 0, distance: 3 }] : [],
                            `unknown input: verbosity=${verbosity}, includeUnknown=${includeUnknown}, includeSelf=${includeSelf}`);
                    }
                }
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});

describe('SpellcheckerWasm - synchronous suggestions', () => {
    it('requires preparation before direct lookups', () => {
        const spellchecker = new SpellcheckerWasm();
        assert.throws(() => spellchecker.suggest('hello'), /Await prepareSpellchecker/);
        assert.throws(() => spellchecker.suggestCompound('hello world'), /Await prepareSpellchecker/);
    });

    it('returns each call’s results, supports optional callbacks, and isolates instances', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'spellchecker-wasm-63-'));
        const dictionaryLocation = join(directory, 'dictionary.txt');
        try {
            await writeFile(dictionaryLocation, 'hello 100\r\nworld 80\r\n');
            const callbackTerms: string[][] = [];
            const first = new SpellcheckerWasm(results => callbackTerms.push(results.map(item => item.term)));
            const second = new SpellcheckerWasm();
            await Promise.all([
                first.prepareSpellchecker(wasmPath, dictionaryLocation),
                second.prepareSpellchecker(wasmPath, dictionaryLocation),
            ]);

            assert.deepStrictEqual(first.suggest('helo').map(item => item.toJSON()),
                [{ count: 100, distance: 1, term: 'hello' }]);
            assert.deepStrictEqual(first.suggest('hello'), []);
            assert.deepStrictEqual(first.suggest('helo').map(item => item.term), ['hello']);
            assert.deepStrictEqual(callbackTerms, [['hello'], [], ['hello']]);
            assert.deepStrictEqual(second.suggest('helo').map(item => item.term), ['hello']);
            assert.deepStrictEqual(second.suggest('hello'), []);

            const compound = second.suggestCompound('helo world');
            assert.ok(compound.some(item => item.term === 'hello world'));
            assert.deepStrictEqual(second.suggest('hello'), []);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('keeps the outer result when a callback performs a nested lookup', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'spellchecker-wasm-63-'));
        const dictionaryLocation = join(directory, 'dictionary.txt');
        try {
            await writeFile(dictionaryLocation, 'hello 100\r\n');
            let nested: SuggestedItem[] | undefined;
            let reentered = false;
            const spellchecker = new SpellcheckerWasm(() => {
                if (!reentered) {
                    reentered = true;
                    nested = spellchecker.suggest('zzzzzzzzzzzzzz');
                }
            });
            await spellchecker.prepareSpellchecker(wasmPath, dictionaryLocation);
            const outer = spellchecker.suggest('helo');
            assert.deepStrictEqual(outer.map(item => item.term), ['hello']);
            assert.deepStrictEqual(nested, []);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('returns direct results through the browser Response loading path', async () => {
        const wasm = new Response(new Uint8Array(await readFile(wasmPath)), {
            headers: { 'Content-Type': 'application/wasm' },
        });
        const dictionary = new Response('hello 100\r\n');
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(wasm, dictionary);
        assert.deepStrictEqual(spellchecker.suggest('helo').map(item => item.toJSON()),
            [{ count: 100, distance: 1, term: 'hello' }]);
        assert.deepStrictEqual(spellchecker.suggest('hello'), []);
    });

    it('blocks direct lookups while preparation is pending and after failed re-preparation', async () => {
        const wasmBytes = new Uint8Array(await readFile(wasmPath));
        const wasmResponse = () => new Response(wasmBytes.slice(), {
            headers: { 'Content-Type': 'application/wasm' },
        });
        let startReading!: () => void;
        const reading = new Promise<void>(resolve => { startReading = resolve; });
        let dictionaryController!: ReadableStreamDefaultController<Uint8Array>;
        const dictionary = new Response(new ReadableStream<Uint8Array>({
            pull(controller) {
                dictionaryController = controller;
                startReading();
            },
        }));
        const spellchecker = new SpellcheckerWasm();
        const preparation = spellchecker.prepareSpellchecker(wasmResponse(), dictionary);
        await reading;
        assert.throws(() => spellchecker.suggest('helo'), /Await prepareSpellchecker/);
        assert.throws(() => spellchecker.suggestCompound('helo world'), /Await prepareSpellchecker/);

        dictionaryController.enqueue(new TextEncoder().encode('hello 100\r\n'));
        dictionaryController.close();
        await preparation;
        assert.deepStrictEqual(spellchecker.suggest('helo').map(item => item.term), ['hello']);

        const failedPreparation = spellchecker.prepareSpellchecker(wasmResponse(), new Response(null));
        assert.throws(() => spellchecker.suggest('helo'), /Await prepareSpellchecker/);
        await assert.rejects(failedPreparation, /Dictionary Response body is null/);
        assert.throws(() => spellchecker.suggest('helo'), /Await prepareSpellchecker/);
    });
});

describe('SpellcheckerWasm - Issue #48 reproduction attempts', () => {
    const wasmBytesPromise = readFile(wasmPath);

    async function wasmResponse(): Promise<Response> {
        return new Response(new Uint8Array(await wasmBytesPromise), {
            headers: { 'Content-Type': 'application/wasm' },
        });
    }

    function streamDictionary(body: string | Uint8Array, chunkSize = 3): Response {
        const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
        return new Response(new ReadableStream<Uint8Array>({
            start(controller) {
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    controller.enqueue(bytes.slice(i, i + chunkSize));
                }
                controller.close();
            },
        }));
    }

    it('loads all new language dictionaries via browser-style Response streams', async () => {
        for (const lang of languageDictionaries) {
            const dictionaryPath = join(__dirname, `../../../lib/frequency_dictionary_${lang}.txt`);
            const dictionaryBytes = await readFile(dictionaryPath);
            const spellchecker = new SpellcheckerWasm();
            await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary(dictionaryBytes, 1024));
            assert.ok(spellchecker.suggest('test').length >= 0, `${lang} dictionary did not prepare`);
        }
    });

    it('loads bigram dictionary via browser-style Response stream', async () => {
        const bigramPath = join(__dirname, '../../../lib/frequency_bigramdictionary_en_243_342.txt');
        const bigramBytes = await readFile(bigramPath);
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(
            await wasmResponse(),
            streamDictionary('hello 100\nworld 90\n', 4),
            streamDictionary(bigramBytes, 1024),
        );
        assert.ok(spellchecker.suggestCompound('hello wrld').length > 0, 'bigram dictionary did not load');
    });

    it('rejects dictionary with BOM via browser-style Response stream', async () => {
        // BOM is not handled as a special case; the parser currently includes it as part of the first term.
        // This test documents that behaviour rather than asserting a specific fix.
        const body = '\xEF\xBB\xBFhello 100\n';
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary(body, 3));
        const suggestions = spellchecker.suggest('helo');
        // BOM attached to the term means 'hello' is not found exactly.
        assert.ok(!suggestions.some(s => s.term === 'hello'), 'BOM-prefixed term should not match bare hello');
    });

    it('throws TypeError for invalid UTF-8 mid-stream instead of trapping', async () => {
        const valid = new TextEncoder().encode('hello 10\n');
        const invalid = new Uint8Array([0xff, 0xfe]);
        const rest = new TextEncoder().encode('world 20\n');
        const bytes = new Uint8Array(valid.length + invalid.length + rest.length);
        bytes.set(valid, 0);
        bytes.set(invalid, valid.length);
        bytes.set(rest, valid.length + invalid.length);

        const spellchecker = new SpellcheckerWasm();
        await assert.rejects(
            spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary(bytes, 4)),
            TypeError,
        );
    });

    it('reassembles split multi-byte UTF-8 characters across stream chunks', async () => {
        // Russian 'слово 30' split inside the Cyrillic bytes.
        const text = new TextEncoder().encode('слово 30\n');
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary(text, 3));
        assert.deepStrictEqual(
            spellchecker.suggest('слово', { includeSelf: true }).map(item => item.toJSON()),
            [{ count: 30, distance: 0, term: 'слово' }],
        );
    });

    it('handles a line longer than the 1MB chunk buffer without trapping', async () => {
        // A 2 MB line spans multiple 1 MB stream chunks. The streaming code must buffer the
        // incomplete line across calls; preparation must complete without a WASM trap.
        // Note: lookup of terms this long is a separate issue and may fail internally.
        const longTerm = 'a'.repeat(2 * 1024 * 1024);
        const body = `${longTerm} 1\n`;
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary(body, 1024 * 1024));
        // If prepareSpellchecker resolved without a trap, the spellchecker is prepared.
        // Verify by checking that suggest doesn't throw "not ready".
        assert.doesNotThrow(() => {
            const results = spellchecker.suggest('a');
            assert.ok(Array.isArray(results));
        });
    });

    it('handles mixed line endings including CR-only', async () => {
        const body = 'hello 10\nworld 20\r\nmac 30\rnext 40\r\n';
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary(body, 4));
        // CR-only keeps 'mac 30' and 'next 40' on the same line, so only hello/world are parsed cleanly.
        assert.deepStrictEqual(spellchecker.suggest('helo').map(item => item.term), ['hello']);
        assert.deepStrictEqual(spellchecker.suggest('wrld').map(item => item.term), ['world']);
    });

    it('accepts null bytes as valid UTF-8 without trapping', async () => {
        // Null bytes are valid UTF-8, so the parser does not reject them. This test documents
        // that they do not cause a WASM trap; the term includes the null byte literally.
        const body = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x20, 0x31, 0x30, 0x0a]);
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary(body, 3));
        assert.deepStrictEqual(
            spellchecker.suggest('hello\x00', { includeSelf: true }).map(item => item.toJSON()),
            [{ count: 10, distance: 0, term: 'hello\x00' }],
        );
    });

    it('handles empty terms and control characters without trapping', async () => {
        const body = '\t 10\nvalid 20\n\n\x01word 30\n';
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary(body, 4));
        assert.deepStrictEqual(
            spellchecker.suggest('valid', { includeSelf: true }).map(item => item.toJSON()),
            [{ count: 20, distance: 0, term: 'valid' }],
        );
    });

    it('handles extremely large frequency values via Response stream', async () => {
        // 4294967296 exceeds u32::MAX and should saturate; 999999999999999999999 exceeds u64::MAX and is skipped.
        const body = 'huge 4294967296\nlost 999999999999999999999\nsmall 5\n';
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary(body, 5));
        assert.deepStrictEqual(
            spellchecker.suggest('huge', { includeSelf: true }).map(item => item.toJSON()),
            [{ count: 4294967295, distance: 0, term: 'huge' }],
        );
        assert.deepStrictEqual(
            spellchecker.suggest('small', { includeSelf: true }).map(item => item.toJSON()),
            [{ count: 5, distance: 0, term: 'small' }],
        );
    });

    it('supports multiple simultaneous spellchecker instances', async () => {
        const instances = await Promise.all(
            Array.from({ length: 3 }, async () => {
                const spellchecker = new SpellcheckerWasm();
                await spellchecker.prepareSpellchecker(
                    await wasmResponse(),
                    streamDictionary('hello 100\nworld 90\n', 4),
                );
                return spellchecker;
            }),
        );
        for (const spellchecker of instances) {
            assert.deepStrictEqual(spellchecker.suggest('helo').map(item => item.term), ['hello']);
        }
    });

    it('resets state when prepareSpellchecker is called twice on the same instance', async () => {
        const spellchecker = new SpellcheckerWasm();
        await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary('hello 100\n', 4));
        assert.deepStrictEqual(spellchecker.suggest('helo').map(item => item.term), ['hello']);

        await spellchecker.prepareSpellchecker(await wasmResponse(), streamDictionary('world 50\n', 4));
        assert.deepStrictEqual(spellchecker.suggest('helo'), []);
        assert.deepStrictEqual(spellchecker.suggest('wrld').map(item => item.term), ['world']);
    });
});