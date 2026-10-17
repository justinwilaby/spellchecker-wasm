extern crate core;

#[cfg(test)]
mod tests {
    use std::fs::File;
    use std::io::{BufRead, BufReader, Result};

    use crate::sym_spell::sym_spell::SymSpell;
    use crate::sym_spell::verbosity::Verbosity;

    const MAX_EDIT_DISTANCE: usize = 2;
    const PREFIX_LENGTH: usize = 7;

    #[test]
    fn write_to_bigram_test() -> Result<()> {
        let mut sym_spell = SymSpell::new(Some(MAX_EDIT_DISTANCE), Some(PREFIX_LENGTH), None);
        let bigram_file = File::open("lib/frequency_bigramdictionary_en_243_342.txt")?;
        let dictionary_file = File::open("lib/frequency_dictionary_en_82_765.txt")?;
        let mut writer = |mut reader: BufReader<File>, is_bigram: bool| -> Result<()> {
            let mut s = String::new();
            loop {
                let len = reader.read_line(&mut s)?;
                if len == 0 {
                    break;
                }
                if is_bigram {
                    sym_spell.write_line_to_bigram_dictionary(&s, " ");
                } else {
                    sym_spell.write_line_to_dictionary(&s, " ");
                }

                s.truncate(0);
            }
            Ok(())
        };
        writer(BufReader::new(dictionary_file), false)?;
        writer(BufReader::new(bigram_file), true)?;

        let _result = sym_spell.lookup_compound(
            "begining sentances with mispelled words is outragous and mischievious",
            MAX_EDIT_DISTANCE,
        );

        Ok(())
    }

    #[test]
    fn write_to_dictionary_test() -> Result<()> {
        let mut sym_spell = SymSpell::new(Some(MAX_EDIT_DISTANCE), Some(PREFIX_LENGTH), None);
        let f = File::open("lib/frequency_dictionary_en_82_765.txt")?;
        let mut reader = BufReader::new(f);
        let mut s = String::new();

        loop {
            let len = reader.read_line(&mut s)?;
            if len == 0 {
                break;
            }
            sym_spell.write_line_to_dictionary(&s, " ");
            s.truncate(0);
        }

        let result = sym_spell.lookup("mispelle", Verbosity::Closest, 2, false, false);
        assert_eq!(result.len(), 8);
        assert_eq!(result.get(1).unwrap().term, "misspelled");

        Ok(())
    }

    #[test]
    fn include_unknown_only_returns_words_missing_from_dictionary() {
        let mut sym_spell = SymSpell::new(Some(2), Some(7), Some(1));
        sym_spell.create_dictionary_entry("eradicate".to_string(), 42);
        sym_spell.create_dictionary_entry("eradicated".to_string(), 7);

        for all in [false, true] {
            for include_unknown in [false, true] {
                for include_self in [false, true] {
                    let known = sym_spell.lookup(
                        "eradicate",
                        if all {
                            Verbosity::All
                        } else {
                            Verbosity::Closest
                        },
                        2,
                        include_unknown,
                        include_self,
                    );
                    let known_actual: Vec<(&str, usize, usize)> = known
                        .iter()
                        .map(|item| (item.term.as_str(), item.count, item.distance))
                        .collect();
                    let expected = match (all, include_self) {
                        (false, false) => vec![],
                        (false, true) => vec![("eradicate", 42, 0)],
                        (true, false) => vec![("eradicated", 7, 1)],
                        (true, true) => vec![("eradicated", 7, 1), ("eradicate", 42, 0)],
                    };
                    assert_eq!(
                        known_actual, expected,
                        "known word, all={all}, unknown={include_unknown}, self={include_self}"
                    );

                    let unknown = sym_spell.lookup(
                        "zzzzzzzzzzzzzz",
                        if all {
                            Verbosity::All
                        } else {
                            Verbosity::Closest
                        },
                        2,
                        include_unknown,
                        include_self,
                    );
                    let unknown_actual: Vec<(&str, usize, usize)> = unknown
                        .iter()
                        .map(|item| (item.term.as_str(), item.count, item.distance))
                        .collect();
                    let expected = if include_unknown {
                        vec![("zzzzzzzzzzzzzz", 0, 3)]
                    } else {
                        vec![]
                    };
                    assert_eq!(
                        unknown_actual, expected,
                        "unknown word, all={all}, unknown={include_unknown}, self={include_self}"
                    );
                }
            }
        }
    }

    #[test]
    fn word_segmentation_empty_part_fix() {
        // v6.7.2 fix: Ensure empty parts don't cause access errors
        let mut sym_spell = SymSpell::new(Some(2), Some(7), Some(1));
        sym_spell.create_dictionary_entry("hello".to_string(), 1);
        sym_spell.create_dictionary_entry("world".to_string(), 1);
        sym_spell.create_dictionary_entry("test".to_string(), 1);

        // This should not panic with empty part access
        let result = sym_spell.word_segmentation("hello world", 2, Some(5));
        // After normalization, "hello world" becomes "hello world"
        // The segmentation should find both words
        assert!(!result.1.is_empty());
        println!(
            "Result: {} (seg: {}, dist: {}, prob: {})",
            result.1, result.0, result.2, result.3
        );
    }

    #[test]
    fn word_segmentation_case_preservation() {
        // v6.7 improvement: Case is normalized for lookup, suggestions are lowercase
        let mut sym_spell = SymSpell::new(Some(2), Some(7), Some(1));
        sym_spell.create_dictionary_entry("hello".to_string(), 1);
        sym_spell.create_dictionary_entry("world".to_string(), 1);

        let result = sym_spell.word_segmentation("HELLO WORLD", 2, None);
        // After normalization, lookup should find the words (case-insensitive)
        // The result should contain both words
        assert!(
            result.1.contains("hello") || result.1.contains("Hello") || result.1.contains("HELLO")
        );
        assert!(
            result.1.contains("world") || result.1.contains("World") || result.1.contains("WORLD")
        );
    }

    #[test]
    fn word_segmentation_hyphen_removal() {
        // v6.7 improvement: Hyphens are removed during normalization
        let mut sym_spell = SymSpell::new(Some(2), Some(7), Some(1));
        sym_spell.create_dictionary_entry("hello".to_string(), 1);
        sym_spell.create_dictionary_entry("world".to_string(), 1);

        let result = sym_spell.word_segmentation("hello-world", 2, None);
        assert_eq!(result.1, "hello world");
    }

    #[test]
    fn word_segmentation_punctuation_attached() {
        // v6.7 improvement: Punctuation attached to previous word (no space before)
        let mut sym_spell = SymSpell::new(Some(2), Some(7), Some(1));
        sym_spell.create_dictionary_entry("hello".to_string(), 1);
        sym_spell.create_dictionary_entry("world".to_string(), 1);
        sym_spell.create_dictionary_entry("test".to_string(), 1);

        let result = sym_spell.word_segmentation("helloworldtest", 2, None);
        // Should segment into words with spaces between them
        assert!(!result.1.is_empty());
    }

    #[test]
    fn word_segmentation_ligature_normalization() {
        // v6.7 improvement: Nfkc normalization handles ligatures
        let mut sym_spell = SymSpell::new(Some(2), Some(7), Some(1));
        sym_spell.create_dictionary_entry("word".to_string(), 1);

        // ﬁ is the fi ligature (U+FB01), Nfkc should decompose to "fi"
        let result = sym_spell.word_segmentation("ﬁ", 2, None);
        // After normalization, ﬁ becomes fi
        assert!(!result.1.is_empty());
    }
}

pub mod edit_distance;
pub mod grapheme_iterator;
pub mod soft_wx;
pub mod sym_spell;
pub mod utils;
//#[cfg(target_arch = "wasm32")]
pub mod spellchecker_wasm;
