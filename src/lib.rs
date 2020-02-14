extern crate core;

#[cfg(test)]
mod tests {
    use std::fs::File;
    use std::io::{BufRead, BufReader, Result};

    use crate::sym_spell::sym_spell::SymSpell;
    use crate::sym_spell::verbosity::Verbosity;

    const MAX_EDIT_DISTANCE:usize = 2;
    const PREFIX_LENGTH:usize = 7;


    #[test]
    fn write_to_bigram_test() -> Result<()> {
        let mut sym_spell = SymSpell::new( Some(MAX_EDIT_DISTANCE), Some(PREFIX_LENGTH), None);
        let bigram_file = File::open("lib/frequency_bigramdictionary_en_243_342.txt")?;
        let dictionary_file = File::open("lib/frequency_dictionary_en_82_765.txt")?;
        let mut writer = | mut reader: BufReader<File>, is_bigram: bool| -> Result<()>{
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

        let _result = sym_spell.lookup_compound("begining sentances with mispelled words is outragous and mischievious", MAX_EDIT_DISTANCE);

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
}

pub mod grapheme_iterator;
pub mod utils;
pub mod soft_wx;
pub mod sym_spell;
pub mod edit_distance;
//#[cfg(target_arch = "wasm32")]
pub mod spellchecker_wasm;