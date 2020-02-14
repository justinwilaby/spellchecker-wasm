use std::mem::transmute;
use std::slice;
use std::str;

use crate::sym_spell::sym_spell::SymSpell;
use crate::sym_spell::verbosity::Verbosity;
use crate::sym_spell::Encode;
use crate::sym_spell::suggested_item::SuggestItem;

static mut SYM: *mut SymSpell = 0 as *mut SymSpell;
static mut BUFFER: *mut Vec<u8> = 0 as *mut Vec<u8>;

#[no_mangle]
pub unsafe extern fn symspell(max_dictionary_edit_distance: usize, count_threshold: usize) {
    if SYM == 0 as *mut SymSpell {
        let sym_spell: SymSpell = SymSpell::new(Some(max_dictionary_edit_distance), Some(7), Some(count_threshold));
        SYM = transmute(Box::new(sym_spell));
        BUFFER = transmute(Box::new(vec![] as Vec<u8>));
    }
}

#[no_mangle]
pub unsafe extern fn write_to_dictionary(ptr: *const u8, length: usize, is_bigram: bool) {
    (*BUFFER).extend_from_slice(slice::from_raw_parts(ptr, length));
    let len = (*BUFFER).len();
    let mut cursor: usize = 0;
    for i in 0..len {
        let ch = (*BUFFER)[i];
        if ch == b'\n' {
            if i > 1 {
                let chunk = str::from_utf8_unchecked(&(*BUFFER)[cursor..i - 1]);  // do not write the '\n' char
                if is_bigram {
                    (*SYM).write_line_to_bigram_dictionary(chunk, " ");
                } else {
                    (*SYM).write_line_to_dictionary(chunk, " ");
                }
            }
            cursor = i + 1; // skip the '\n' char for the next iteration
        }
    }

    (*BUFFER).drain(0..cursor);
}

#[no_mangle]
pub unsafe extern fn lookup(ptr: *mut u8, length: usize, verbosity: Verbosity, max_edit_distance: usize, include_unknown: bool, include_self: bool) {
    let bytes = slice::from_raw_parts(ptr, length);
    let results = (*SYM).lookup(str::from_utf8_unchecked(bytes), verbosity, max_edit_distance, include_unknown, include_self);

    emit_results(results)
}

#[no_mangle]
pub unsafe extern fn lookup_compound(ptr: *mut u8, length: usize, max_edit_distance: usize) {
    let bytes = slice::from_raw_parts(ptr, length);
    let results = (*SYM).lookup_compound(str::from_utf8_unchecked(bytes), max_edit_distance);

    emit_results(results);
}

#[inline]
unsafe fn emit_results(results: Vec<SuggestItem>) {
    let num_items: [u8; 4] = transmute(results.len() as u32);
    let mut payload: Vec<u8> = vec![num_items[0], num_items[1], num_items[2], num_items[3]];

    for suggest_item in results {
        let item = suggest_item.encode();
        let suggest_item_len: [u8; 4] = transmute(item.len() as u32);
        payload.extend_from_slice(&suggest_item_len);
        payload.extend_from_slice(&item);
    }

    result_handler(payload.as_ptr(), payload.len());
}

#[allow(dead_code)]
#[no_mangle]
extern "C" {
    fn result_handler(ptr: *const u8, len: usize);
}