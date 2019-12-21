use std::str;
use std::ops::{Range, Index};
use std::cell::RefCell;

pub struct GraphemeClusters<'a> {
    bytes: &'a [u8],
    cursor: usize,
    // A vector of byte indices where the vec
    // index is the grapheme cluster index
    byte_indices: RefCell<Vec<usize>>,
}

impl GraphemeClusters<'_> {
    pub fn new(s: &str) -> GraphemeClusters {
        GraphemeClusters {
            bytes: s.as_bytes(),
            cursor: 0,
            byte_indices: RefCell::new(vec![0]),
        }
    }

    pub fn len(&self) -> usize {
        let mut len = 0;
        let mut idx = 0;
        while idx != self.bytes.len() {
            let byte = self.bytes[idx];
            idx += GraphemeClusters::grapheme_len(&byte);
            len += 1;
        }
        len
    }

    /// Converts a grapheme cluster range to a slice range
    ///
    /// example:
    /// let s = "🐶 my dog's name is Spot 🐶";
    /// let gc = GraphemeClusters::new(s);
    ///
    /// assert_eq!(s[gc.get_slice_range(0..8)], "🐶 my dog")
    ///
    pub fn get_slice_range(&self, range: Range<usize>) -> Range<usize> {
        let mut byte_indices = self.byte_indices.borrow_mut();
        let mut largest_idx = byte_indices.len() - 1;
        let mut start_idx = if largest_idx >= range.start { byte_indices[range.start] } else { byte_indices[largest_idx] };
        let mut end_idx = if largest_idx >= range.end { byte_indices[range.end] } else { byte_indices[largest_idx] };

        while largest_idx < range.end {
            let byte = self.bytes[end_idx];
            end_idx += GraphemeClusters::grapheme_len(&byte);
            largest_idx += 1;
            byte_indices.push(end_idx);
            if largest_idx == range.start {
                start_idx = end_idx;
            }
        }
        start_idx..end_idx
    }

    fn grapheme_len(byte: &u8) -> usize {
        let mut bytes = 1;
        if ((byte & 0b10000000) >> 7) == 1 && ((byte & 0b1000000) >> 6) == 1 {
            bytes += 1;
        }
        if bytes == 2 && ((byte & 0b100000) >> 5) == 1 {
            bytes += 1;
        }
        if bytes == 3 && ((byte & 0b10000) >> 4) == 1 {
            bytes += 1;
        }
        bytes
    }
}

/// An iterator for grapheme clusters in a utf-8 formatted string
///
/// This iterator provides a tuple: (grapheme: &str, from_index:usize, to_index:usize)
impl<'a> Iterator for GraphemeClusters<'a> {
    type Item = (&'a str, Range<usize>);

    fn next(&mut self) -> Option<Self::Item> {
        if self.bytes.len() <= self.cursor {
            self.cursor = 0;
            return None;
        }
        let next_byte = &self.bytes[self.cursor];
        let len = GraphemeClusters::grapheme_len(next_byte);
        let end = self.cursor + len;
        let s = unsafe { str::from_utf8_unchecked(&self.bytes[self.cursor..end]) };
        let result = Some((s, self.cursor..end));
        self.cursor = end;

        result
    }
}

impl<'a> Index<usize> for GraphemeClusters<'a> {
    type Output = str;

    fn index(&self, index: usize) -> &Self::Output {
        let range = self.get_slice_range(index..index + 1);
        unsafe { str::from_utf8_unchecked(&self.bytes[range]) }
    }
}

#[cfg(test)]
mod grapheme_iterator_tests {
    use crate::grapheme_iterator::GraphemeClusters;

    #[test]
    fn iterator_test() {
        let s = "🚀this is a test string🚀";
        let it: Vec<_> = GraphemeClusters::new(s).collect();
        assert_eq!(it.len(), 23);
    }

    #[test]
    fn iterator_test2() {
        let s = "🚀rocket ";
        let it: Vec<_> = GraphemeClusters::new(s).collect();
        for (grapheme, range) in it {
            assert_eq!(grapheme.len() > 0, true)
        }
    }

    #[test]
    fn len_test() {
        let s = "🚀this is a test string🚀";
        let gc = GraphemeClusters::new(s);
        let len = gc.len();
        assert_eq!(len, 23);
    }

    #[test]
    fn slice_test() {
        let s = "🚀this is a test string🚀";
        let gc = GraphemeClusters::new(s);
        let byte_range1 = gc.get_slice_range(1..5);

        let slice = &s[byte_range1.clone()];
        assert_eq!(slice, "this");
        assert_eq!(byte_range1, 4..8);
    }

    #[test]
    fn index_test() {
        let s = "🚀this is a test string🚀";
        let gc = GraphemeClusters::new(s);
        assert_eq!(&gc[22], "🚀")
    }
}