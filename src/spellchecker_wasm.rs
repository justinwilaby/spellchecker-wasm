#![allow(static_mut_refs)]

use std::cell::RefCell;
use std::slice;
use std::str;

use crate::sym_spell::suggested_item::SuggestItem;
use crate::sym_spell::sym_spell::SymSpell;
use crate::sym_spell::verbosity::Verbosity;
use crate::sym_spell::Encode;

static mut BUFFER: Option<RefCell<Vec<u8>>> = None;
static mut SYM: Option<RefCell<SymSpell>> = None;

#[no_mangle]
pub unsafe extern "C" fn symspell(max_dictionary_edit_distance: usize, count_threshold: usize) {
    let sym = SymSpell::new(
        Some(max_dictionary_edit_distance),
        Some(7),
        Some(count_threshold),
    );

    SYM = Some(RefCell::new(sym));
    BUFFER = Some(RefCell::new(Vec::new()));
}

#[no_mangle]
pub unsafe extern "C" fn write_to_dictionary(ptr: *const u8, length: usize, is_bigram: bool) -> bool {
    let buffer_cell = BUFFER.as_ref().unwrap();
    let sym_cell = SYM.as_ref().unwrap();
    let mut sym = sym_cell.borrow_mut();
    let mut buffer = buffer_cell.borrow_mut();
    buffer.extend_from_slice(slice::from_raw_parts(ptr, length));

    consume_dictionary_lines(&mut buffer, &mut sym, is_bigram)
}

fn consume_dictionary_lines(buffer: &mut Vec<u8>, sym: &mut SymSpell, is_bigram: bool) -> bool {
    let len = buffer.len();
    let mut cursor: usize = 0;
    for i in 0..len {
        let ch = buffer[i];
        if ch == b'\n' {
            let end = if i > cursor && buffer[i - 1] == b'\r' { i - 1 } else { i };
            if end > cursor {
                let chunk = match str::from_utf8(&buffer[cursor..end]) {
                    Ok(chunk) => chunk,
                    Err(_) => return false,
                };
                if is_bigram {
                    sym.write_line_to_bigram_dictionary(chunk, " ");
                } else {
                    sym.write_line_to_dictionary(chunk, " ");
                }
            }
            cursor = i + 1; // skip the '\n' char for the next iteration
        }
    }

    buffer.drain(0..cursor);
    true
}

#[cfg(test)]
mod dictionary_stream_tests {
    use super::*;

    #[test]
    fn accepts_lf_crlf_blank_lines_and_split_utf8() {
        let mut sym = SymSpell::new(Some(2), Some(7), Some(1));
        let mut buffer = Vec::new();
        buffer.extend_from_slice(b"hello 10\n");
        assert!(consume_dictionary_lines(&mut buffer, &mut sym, false));
        buffer.extend_from_slice(b"\nworld 20\r\n\r\n");
        assert!(consume_dictionary_lines(&mut buffer, &mut sym, false));
        assert!(buffer.is_empty());
        let russian = "слово 30\n".as_bytes();
        buffer.extend_from_slice(&russian[..3]);
        assert!(consume_dictionary_lines(&mut buffer, &mut sym, false));
        buffer.extend_from_slice(&russian[3..]);
        assert!(consume_dictionary_lines(&mut buffer, &mut sym, false));
        for (term, count) in [("hello", 10), ("world", 20), ("слово", 30)] {
            assert_eq!(sym.lookup(term, Verbosity::Top, 0, false, true)[0].count, count, "{}", term);
        }
    }

    #[test]
    fn malformed_utf8_does_not_enter_dictionary() {
        let mut sym = SymSpell::new(Some(2), Some(7), Some(1));
        let mut buffer = b"bad\xff 10\nvalid 20\n".to_vec();
        assert!(!consume_dictionary_lines(&mut buffer, &mut sym, false));
        assert!(sym.lookup("valid", Verbosity::Top, 0, false, true).is_empty());
    }

    #[test]
    fn large_source_count_saturates_to_wire_limit() {
        let mut sym = SymSpell::new(Some(2), Some(7), Some(1));
        let mut buffer = b"and 12997637966\n".to_vec();
        assert!(consume_dictionary_lines(&mut buffer, &mut sym, false));
        assert_eq!(sym.lookup("and", Verbosity::Top, 0, false, true)[0].count, u32::MAX as usize);
    }
}

#[no_mangle]
pub unsafe extern "C" fn lookup(
    ptr: *mut u8,
    length: usize,
    verbosity: Verbosity,
    max_edit_distance: usize,
    include_unknown: bool,
    include_self: bool,
) {
    let sym_cell = SYM.as_ref().unwrap();
    let sym = sym_cell.borrow();
    let bytes = slice::from_raw_parts(ptr, length);
    let results = sym.lookup(
        str::from_utf8_unchecked(bytes),
        verbosity,
        max_edit_distance,
        include_unknown,
        include_self,
    );

    emit_results(results)
}

#[no_mangle]
pub unsafe extern "C" fn lookup_compound(ptr: *mut u8, length: usize, max_edit_distance: usize) {
    let sym_cell = SYM.as_ref().unwrap();
    let sym = sym_cell.borrow();
    let bytes = slice::from_raw_parts(ptr, length);
    let results = sym.lookup_compound(str::from_utf8_unchecked(bytes), max_edit_distance);

    emit_results(results);
}

#[inline]
unsafe fn emit_results(results: Vec<SuggestItem>) {
    let num_items: [u8; 4] = u32::to_ne_bytes(results.len() as u32);
    let mut payload: Vec<u8> = vec![num_items[0], num_items[1], num_items[2], num_items[3]];

    for suggest_item in results {
        let item = suggest_item.encode();
        let suggest_item_len: [u8; 4] = u32::to_ne_bytes(item.len() as u32);
        payload.extend_from_slice(&suggest_item_len);
        payload.extend_from_slice(&item);
    }

    result_handler(payload.as_ptr(), payload.len());
}

#[allow(dead_code)]
extern "C" {
    fn result_handler(ptr: *const u8, len: usize);
}
