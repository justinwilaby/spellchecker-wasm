
pub fn to_char_code(grapheme: &str) -> u32 {
    let bytes = grapheme.as_bytes();
    let len = bytes.len();
    let char_code = match len {
        1 => bytes[0] as u32,
        2 => ((bytes[0] as u32 & 0x1f) << 6) | (bytes[1] as u32 & 0x3f),
        3 => ((bytes[0] as u32 & 0x0f) << 12) | ((bytes[1] as u32 & 0x3f) << 6) | (bytes[2] as u32 & 0x3f),
        4 => ((bytes[0] as u32 & 0x07) << 18) | ((bytes[1] as u32 & 0x3f) << 12) | ((bytes[2] as u32 & 0x3f) << 6) | (bytes[3] as u32 & 0x3f),
        _ => 0
    };
    char_code
}

pub fn is_alpha_numeric(grapheme: &str) -> bool {
    let char_code = to_char_code(grapheme);
    match char_code {
        0x41..=0x5A => true,   // A-Z
        0x5F => true,          // _
        0x61..=0x7A => true,   // a-z
        0xC0..=0xD6 => true,   // À-Ö
        0xD8..=0xF6 => true,   // Ø-ö
        0xF8..=0x02FF => true, // ø-˿
        0x0370..=0x037D => true, // etc...
        0x037F..=0x1FFF => true,
        0x200C..=0x200D => true,
        0x2070..=0x218F => true,
        0x2C00..=0x2FEF => true,
        0x3001..=0xD7FF => true,
        0xF900..=0xFDCF => true,
        0xFDF0..=0xFFFD => true,
        0x10000..=0xEFFFF => true,
        _ => false,
    }
}
#[cfg(test)]
mod utils_tests {
    use crate::utils::to_char_code;

    #[test]
    fn to_char_code_test() {
        let char_code = to_char_code("踰");
        assert_eq!(char_code, 0x8e30)
    }
}