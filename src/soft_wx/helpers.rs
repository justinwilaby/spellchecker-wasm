// Copyright ©2015-2018 SoftWx, Inc.
// Released under the MIT License the text of which appears at the end of this file.
// <authors> Steve Hatchett

use crate::grapheme_iterator::GraphemeClusters;

/// <summary>Determines the proper return value of an edit distance function when one or
/// both strings are null.</summary>
pub fn null_distance_results(string1: &str, string2: &str, max_distance: usize) -> Option<usize> {
    let gc2 = GraphemeClusters::new(string2);
    if string1 == "" {
        let str2_len = gc2.len();
        if string2 == "" {
            return Some(0);
        } else if str2_len <= max_distance {
            return Some(str2_len);
        }
        return None;
    }
    let gc1 = GraphemeClusters::new(string1);
    let str1_len = gc1.len();
    return if str1_len <= max_distance { Some(str1_len) } else { None };
}

/// <summary>Determines the proper return value of a similarity function when one or
/// both strings are null.</summary>
pub fn null_similarity_results(string1: &str, string2: &str, min_similarity: f64) -> Option<f64> {
    if string1.is_empty() && string2.is_empty() {
        return Some(1.0);
    }
    return if min_similarity >= 0.0 { Some(0.0) } else { None };
}

/// <summary>Calculates starting position and lengths of two strings such that common
/// prefix and suffix substrings are excluded.</summary>
/// <remarks>Expects string1.Length to be less than or equal to string2.Length</remarks>
pub fn prefix_suffix_prep(string1: &str, string2: &str) -> (usize, usize, usize) {
    let string1_gc = GraphemeClusters::new(string1);
    let string2_gc = GraphemeClusters::new(string2);
    let mut len1 = string1_gc.len(); // this is also the minimum length of the two strings
    let mut len2 = string2_gc.len();

    // suffix common to both strings can be ignored
    while len1 != 0 && string1_gc[len1 - 1] == string2_gc[len2 - 1] {
        len1 -= 1;
        len2 -= 1;
    }

    // prefix common to both strings can be ignored
    let mut start = 0;
    while start != len1 && string1_gc[start] == string2_gc[start] {
        start += 1;
    }

    if start != 0 {
        len2 -= start;
        len1 -= start;
    }

    (len1, len2, start)
}

/// <summary>Calculate a similarity measure from an edit distance.</summary>
/// <param name="length">The length of the longer of the two strings the edit distance is from.</param>
/// <param name="distance">The edit distance between two strings.</param>
/// <returns>A similarity value from 0 to 1.0 (1 - (length / distance)).</returns>
pub fn similarity(distance: f64, length: f64) -> Option<f64> {
    return if distance < 0.0 { None } else { Some(1.0 - (distance / length)) };
}

/// <summary>Calculate an edit distance from a similarity measure.</summary>
/// <param name="length">The length of the longer of the two strings the edit distance is from.</param>
/// <param name="similarity">The similarity measure between two strings.</param>
/// <returns>An edit distance from 0 to length (length * (1 - similarity)).</returns>
pub fn distance(similarity: f64, length: usize) -> usize {
    length * (1.0 - similarity) as usize
}

#[cfg(test)]
mod helpers_tests {
    use crate::soft_wx::helpers::prefix_suffix_prep;

    #[test]
    fn prefix_suffix_prep_test() {
        let (len1, len2, start) = prefix_suffix_prep("hello", "heelo!");
        assert_eq!(len1, 3);
        assert_eq!(len2, 4);
        assert_eq!(start, 2);
    }
}
/*
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
