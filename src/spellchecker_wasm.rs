use std::cell::RefCell;
use std::mem::transmute;
use std::slice;
use std::str;
use std::mem;

use crate::sym_spell::Encode;
use crate::sym_spell::suggested_item::SuggestItem;
use crate::sym_spell::sym_spell::SymSpell;
use crate::sym_spell::verbosity::Verbosity;

static mut BUFFER: Option<RefCell<Vec<u8>>> = None;
static mut SYM: Option<RefCell<SymSpell>> = None;

#[no_mangle]
pub unsafe extern fn symspell(max_dictionary_edit_distance: usize, count_threshold: usize) {
    let sym = SymSpell::new(Some(max_dictionary_edit_distance), Some(7), Some(count_threshold));

    SYM = Some(RefCell::new(sym));
    BUFFER = Some(RefCell::new(Vec::new()));
}

#[no_mangle]
pub unsafe extern fn write_to_dictionary(ptr: *const u8, length: usize, is_bigram: bool) {
    let buffer_cell = BUFFER.as_ref().unwrap();
    let sym_cell = SYM.as_ref().unwrap();
    let mut sym = sym_cell.borrow_mut();
    let mut buffer = buffer_cell.borrow_mut();
    buffer.extend_from_slice(slice::from_raw_parts(ptr, length));

    let len = buffer.len();
    let mut cursor: usize = 0;
    for i in 0..len {
        let ch = buffer[i];
        if ch == b'\n' {
            if i > 1 {
                let chunk = str::from_utf8_unchecked(&buffer[cursor..i - 1]);  // do not write the '\n' char
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
}

#[no_mangle]
pub unsafe extern fn lookup(ptr: *mut u8, length: usize, verbosity: Verbosity, max_edit_distance: usize, include_unknown: bool, include_self: bool) {
    let sym_cell = SYM.as_ref().unwrap();
    let sym = sym_cell.borrow();
    let bytes = slice::from_raw_parts(ptr, length);
    let results = sym.lookup(str::from_utf8_unchecked(bytes), verbosity, max_edit_distance, include_unknown, include_self);

    emit_results(results)
}

#[no_mangle]
pub unsafe extern fn lookup_compound(ptr: *mut u8, length: usize, max_edit_distance: usize) {
    let sym_cell = SYM.as_ref().unwrap();
    let sym = sym_cell.borrow();
    let bytes = slice::from_raw_parts(ptr, length);
    let results = sym.lookup_compound(str::from_utf8_unchecked(bytes), max_edit_distance);

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