use crate::sym_spell::Encode;
use std::mem::transmute;

#[derive(Clone)]
pub struct SuggestItem {
    pub term: String,
    pub distance: usize,
    pub count: usize,
}

#[allow(dead_code)]
impl SuggestItem {
    /// <summary>Create a new instance of SuggestItem.</summary>
    /// <param name="term">The suggested word.</param>
    /// <param name="distance">Edit distance from search word.</param>
    /// <param name="count">Frequency of suggestion in dictionary.</param>
    pub fn new(term: String, distance: usize, count: usize) -> SuggestItem {
        SuggestItem {
            term,
            distance,
            count,
        }
    }

    pub fn default() -> SuggestItem {
        SuggestItem {
            term: String::new(),
            distance: 0,
            count: 0,
        }
    }
}

impl Encode<Vec<u8>> for SuggestItem {
    fn encode(&self) -> Vec<u8> {
        unsafe {
            let ct: [u8; 4] = transmute((self.count as u32).to_le());
            let dis: [u8; 4] = transmute((self.distance as u32).to_le());
            let len: [u8; 1] = transmute(self.term.len() as u8);

            let mut encoded = vec![];
            encoded.extend_from_slice(&ct);
            encoded.extend_from_slice(&dis);
            encoded.extend_from_slice(&len);
            encoded.extend_from_slice(self.term.as_bytes());

            encoded
        }
    }
}

#[cfg(test)]
mod suggest_item_tests {
    use std::mem::transmute;


    #[test]
    fn encode_test() {}
}