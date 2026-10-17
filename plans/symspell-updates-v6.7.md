# SymSpell Updates Implementation Plan

**Current version:** v6.6 (based on SymSpell v6.6, internal Rust code says v6.5)
**Target version:** v6.7.3 (latest as of January 4, 2025)
**Research date:** 2026-10-16
**Reviewed by:** Planning agent + independent review agent

## Executive Summary

Since this project was created, the original C# SymSpell has released 4 new versions:
- **v6.7.3** (January 4, 2025) - Latest release, includes CommitStaged null reference fix
- **v6.7.2** (February 11, 2021) - WordSegmentation exception fix
- **v6.7.1** (June 29, 2019) - Dictionary improvements, framework updates
- **v6.7** (August 25, 2016) - Major WordSegmentation improvements

The core algorithm (symmetric delete, Damerau-Levenshtein) has **not** changed. All updates are:
1. WordSegmentation improvements (quality of life, robustness)
2. Dictionary updates (contractions, American English forms)
3. Bug fixes (null reference, exception handling)

## Updates to Implement

### Priority 1: WordSegmentation Improvements (v6.7)

These are the most impactful changes, directly affecting correction quality.

#### 1.1 Case Preservation
**What:** Preserve uppercase/lowercase of input terms in output.
**Why:** "I Love YOU" should return "I love you" not "I Love You"
**Implementation:**
- Modify `word_segmentation()` to track character case from input
- When rebuilding the output string, preserve case from input
- Test cases: "I LOVE YOU" → "I love you", "HELLO WORLD" → "hello world"

**Files to modify:**
- `src/sym_spell/sym_spell.rs` - `word_segmentation()` method

#### 1.2 Punctuation Preservation
**What:** Keep punctuation or apostrophe adjacent to the previous word.
**Why:** "hello,world" should segment as "hello , world" (with punctuation attached to previous word)
**Implementation:**
- Modify segmentation logic to keep punctuation with the preceding word
- Handle apostrophes: "don't" should stay together
- Test cases: "hello,world" → "hello , world", "don'tforget" → "don't forget", "it'sgreat" → "it's great"

**Files to modify:**
- `src/sym_spell/sym_spell.rs` - `word_segmentation()` method

#### 1.3 Ligature Normalization
**What:** Normalize Unicode ligatures to their base characters before segmentation.
**Why:** "scientiﬁc" (with ﬁ ligature) should be corrected to "scientific"
**Implementation:**
- Add Unicode ligature normalization step before word segmentation
- Handle common ligatures: ﬁ (fi), ﬂ (fl), ﬃ (ffi), ﬄ (ffl), ﬀ (ff)
- Note: This requires a mapping table, not the unicode-normalization crate (which does NFC/NFD normalization)
- Test cases: "scientiﬁc" → "scientific", "ﬂight" → "flight", "ﬃnity" → "affinity"

**Files to modify:**
- `src/sym_spell/sym_spell.rs` - Add ligature normalization function
- Possibly add dependency for Unicode mapping

#### 1.4 Hyphen Handling
**What:** Remove hyphens prior to word segmentation, then restore them.
**Why:** Hyphens might be caused by syllabification (e.g., line breaks), so "hel-lo" should correct to "hello"
**Implementation:**
- Strip hyphens before segmentation
- After segmentation, check if hyphenated form exists in dictionary
- Test cases: "hel-lo" → "hello", "well-done" → "well done" (if not in dict), "state-of-the-art" → "state of the art"

**Files to modify:**
- `src/sym_spell/sym_spell.rs` - `word_segmentation()` method

### Priority 2: WordSegmentation Exception Fix (v6.7.2)

**What:** Fix exception in `WordSegmentation`
**Why:** Prevent crashes on certain inputs
**Implementation:**
- Need to identify the specific exception scenario from the C# v6.7.2 release
- Research the actual bug and port the fix to Rust equivalent
- Add test case for the edge condition

**Files to modify:**
- `src/sym_spell/sym_spell.rs` - `word_segmentation()` method
- `src/lib.rs` - Add test case

**Note:** The v6.7.2 release notes are minimal. Need to investigate the actual bug from the C# source code changes.

### Priority 3: CommitStaged Null Reference Fix (v6.7.3)

**What:** Fix null reference exception in `CommitStaged` (PR #126 by kestasjk)
**Why:** When using only `CreateDictionaryEntry()` with a staging object, the line that initialized the `deletes` dictionary wasn't called, causing a NullReferenceException when `CommitStaged()` was invoked.
**Implementation:**
- Find `commit_staged()` in Rust code
- Ensure the `deletes` dictionary is initialized in both code branches (like the C# fix)
- Add test case for the edge condition

**Files to modify:**
- `src/sym_spell/sym_spell.rs` - `commit_staged()` method
- `src/lib.rs` - Add test case

### Priority 4: Dictionary Improvements (v6.7.1)

**What:** Add more common contractions to frequency dictionary
**Why:** Better coverage of colloquial English
**Implementation:**
- Download updated dictionary from SymSpell repo (v6.7.1 or later)
- Replace `lib/frequency_dictionary_en_82_765.txt` with updated version
- Test that all previous tests still pass

**Files to modify:**
- `lib/frequency_dictionary_en_82_765.txt` - Replace with updated dictionary

### Priority 5: American English Word Forms (v6.7)

**What:** Add American English word forms to dictionary
**Why:** "favourable" → "favorable" support
**Implementation:**
- This is already handled by the dictionary update in Priority 4
- Verify with test cases after dictionary update

## Implementation Order

1. **Step 1:** Investigate and understand the specific bug fixes in v6.7.2 and v6.7.3 from C# source code
2. **Step 2:** Port v6.7 WordSegmentation improvements (case preservation, punctuation, ligatures, hyphens)
3. **Step 3:** Add test cases for all WordSegmentation improvements
4. **Step 4:** Port v6.7.2 WordSegmentation exception fix
5. **Step 5:** Port v6.7.3 CommitStaged null reference fix
6. **Step 6:** Update frequency dictionary with v6.7.1 contractions
7. **Step 7:** Run full test suite and validate
8. **Step 8:** Update version number in Cargo.toml and README

## Optional Future Improvements

These are planned but not yet released in the C# version:

### 1. Pigeonhole Principle Optimization
**What:** 5x less memory consumption, 3x faster precalculation
**When to implement:** After v6.7.3 parity is achieved

### 2. Case Preservation Option
**What:** Optional flag to preserve case of input term in corrections
**When to implement:** After v6.7.3 parity is achieved

### 3. Custom Dictionary Tools
**What:** Open-source code for creating custom frequency dictionaries
**When to implement:** As a separate project/tool

## Validation

After implementation:
1. Run `npm run test` - all existing tests must pass
2. Add new test cases for each improvement
3. Benchmark to ensure performance is not degraded
4. Verify word segmentation improvements with test cases

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Word segmentation regression | **High** | High | Comprehensive test suite, incremental implementation |
| Memory increase | Low | Medium | Pigeonhole optimization later |
| Performance regression | Low | Medium | Benchmark before/after |
| Unicode ligature handling complexity | Medium | Low | Use established crates or mapping tables |
| Rust/C# implementation divergence | Medium | Medium | Investigate C# source for bug fix details |

## Timeline Estimate

| Task | Estimated Time |
|------|----------------|
| Research C# source for bug fix details | 0.5 day |
| WordSegmentation improvements | 2-3 days |
| Bug fixes (v6.7.2, v6.7.3) | 0.5-1 day |
| Dictionary update | 0.5 day |
| Testing and validation | 1-2 days |
| **Total** | **5-7.5 days** |

## Notes

- The Rust implementation may have diverged from the C# version in ways that make direct porting difficult
- Some C#-specific changes (framework targets, test modernization) don't apply to the Rust version
- The CommitStaged fix (PR #126) was merged in March 2022 but not released until v6.7.3 in January 2025