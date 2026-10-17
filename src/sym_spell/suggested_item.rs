use crate::sym_spell::Encode;

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
        let mut encoded = vec![];
        encoded.extend_from_slice(&(self.count as u32).to_le_bytes());
        encoded.extend_from_slice(&(self.distance as u32).to_le_bytes());
        encoded.extend_from_slice(&(self.term.len() as u32).to_le_bytes());
        encoded.extend_from_slice(self.term.as_bytes());
        encoded
    }
}

#[cfg(test)]
mod suggest_item_tests {
    use crate::sym_spell::suggested_item::SuggestItem;
    use crate::sym_spell::Encode;
    use std::str;

    #[test]
    fn encode_test() {
        let si = SuggestItem::new("test".into(), 1, 2);
        let encoded = si.encode();
        assert_eq!(encoded[0], 2); // count low byte (u32 LE)
        assert_eq!(encoded[4], 1); // distance low byte
        assert_eq!(encoded[8], 4); // term length low byte
        let term = unsafe { str::from_utf8_unchecked(&encoded[12..]) };
        assert_eq!(term, "test")
    }
}
