// Copyright ©2015-2018 SoftWx, Inc.
// Released under the MIT License the text of which appears at the end of this file.
// <authors> Steve Hatchett
use std::collections::HashMap;

use crate::grapheme_iterator::GraphemeClusters;
use crate::soft_wx::{Distance, Similarity};
use crate::soft_wx::helpers::{distance, null_distance_results, null_similarity_results, prefix_suffix_prep, similarity};

pub struct Levenshtein {
    base_char1_costs: HashMap<usize, usize>
}

/// <summary>
/// Class providing optimized methods for computing Levenshtein comparisons between two strings.
/// </summary>
/// <remarks>
/// Copyright ©2015-2018 SoftWx, Inc.
/// The inspiration for creating highly optimized edit distance functions was
/// from Sten Hjelmqvist's "Fast, memory efficient" algorithm, described at
/// http://www.codeproject.com/Articles/13525/Fast-memory-efficient-Levenshtein-algorithm
/// The Levenshtein algorithm computes the edit distance metric between two strings, i.e.
/// the number of insertion, deletion, and substitution edits required to transform one
/// string to the other. This value will be >= 0, where 0 indicates identical strings.
/// Comparisons are case sensitive, so for example, "Fred" and "fred" will have a
/// distance of 1. The optimized algorithm was described in detail in my post at
/// http://blog.softwx.net/2014/12/optimizing-levenshtein-algorithm-in-c.html
/// Also see http://en.wikipedia.org/wiki/Levenshtein_distance for general information.
/// The methods in this class are not threadsafe. Use the static versions in the Distance
/// class if that is required.</remarks>
impl Levenshtein {
    /// <summary>Create a new instance of Levenshtein using the specified expected
    /// maximum string length that will be encountered.</summary>
    /// <remarks>By specifying the max expected string length, better memory efficiency
    /// can be achieved.</remarks>
    /// <param name="expectedMaxStringLength">The expected maximum length of strings that will
    /// be passed to the Levenshtein methods.</param>
    pub fn new() -> Levenshtein {
        Levenshtein {
            base_char1_costs: HashMap::new()
        }
    }

    /// <summary>Internal implementation of the core Levenshtein algorithm.</summary>
    /// <remarks>https://github.com/softwx/SoftWx.Match</remarks>
    fn core_levenshtein(string1: &str, string2: &str, len1: usize, len2: usize, start: usize, char1_costs: &mut HashMap<usize, usize>) -> Option<usize> {
        for j in 0..len2 {
            char1_costs.insert(j, j + 1);
        }
        let mut current_char_cost = 0;
        let string1_gc = GraphemeClusters::new(string1);
        let string2_gc = GraphemeClusters::new(string2);
        if start == 0 {
            for i in 0..len1 {
                let mut left_char_cost = i;
                let mut above_char_cost = i;

                let char1 = &string1_gc[i];
                for j in 0..len2 {
                    current_char_cost = left_char_cost; // cost on diagonal (substitution)
                    left_char_cost = char1_costs[&j];
                    if &string2_gc[j] != char1 {

                        // substitution if neither of two conditions below
                        if above_char_cost < current_char_cost {
                            current_char_cost = above_char_cost;
                        }

                        if left_char_cost < current_char_cost {
                            current_char_cost = left_char_cost;
                        }
                        current_char_cost += 1;
                    }
                    above_char_cost = current_char_cost;
                    char1_costs.insert(j, above_char_cost);
                }
            }
        } else {
            for i in 0..len1 {
                let mut left_char_cost = i;
                let mut above_char_cost = i;
                let char1 = &string1_gc[start + i];
                for j in 0..len2 {
                    current_char_cost = left_char_cost; // cost on diagonal (substitution)
                    left_char_cost = char1_costs[&j];

                    if &string2_gc[start + j] != char1 {
                        // substitution if neither of two conditions below
                        if above_char_cost < current_char_cost {
                            current_char_cost = above_char_cost;
                        }

                        if left_char_cost < current_char_cost {
                            current_char_cost = left_char_cost;
                        }
                        current_char_cost += 1;
                    }
                    above_char_cost = current_char_cost;
                    char1_costs.insert(j, above_char_cost);
                }
            }
        }
        Some(current_char_cost)
    }

    /// <summary>Internal implementation of the core Levenshtein algorithm that accepts a maxDistance.</summary>
    /// <remarks>https://github.com/softwx/SoftWx.Match</remarks>
    fn core_levenshtein2(string1: &str, string2: &str, len1: usize, len2: usize, start: usize, max_distance: usize, char1_costs: &mut HashMap<usize, usize>) -> Option<usize> {
        for j in 0..max_distance {
            char1_costs.insert(j, j + 1);
        }

        if len2 > max_distance {
            for k in max_distance..len2 {
                char1_costs.insert(k + 1, max_distance + 1);
            }
        }

        let len_diff = len2 - len1;
        let j_offset = max_distance - len_diff;
        let mut j_start = 0;
        let mut j_end = max_distance;
        let mut current_cost = 0;
        let string1_gc = GraphemeClusters::new(string1);
        let string2_gc = GraphemeClusters::new(string2);
        if start == 0 {
            for i in 0..len1 {
                let char1 = &string1_gc[i];
                let mut prev_char1_cost = i;
                let mut above_char1_cost = i;

                // no need to look beyond window of lower right diagonal - maxDistance cells (lower right diag is i - lenDiff)
                // and the upper left diagonal + maxDistance cells (upper left is i)
                if i > j_offset {
                    j_start += 1;
                }

                if j_end < len2 {
                    j_end += 1;
                }

                for j in j_start..j_end {
                    current_cost = prev_char1_cost;// cost on diagonal (substitution)
                    prev_char1_cost = char1_costs[&j];
                    if &string2_gc[j] != char1 {
                        // substitution if neither of two conditions below
                        if above_char1_cost < current_cost {
                            current_cost = above_char1_cost; // deletion
                        }

                        if prev_char1_cost < current_cost {
                            current_cost = prev_char1_cost; // insertion
                        }

                        current_cost += 1;
                    }
                    above_char1_cost = current_cost;
                    char1_costs.insert(j, above_char1_cost);
                }

                if char1_costs[&(i + len_diff)] > max_distance {
                    return None;
                }
            }
        } else {
            for i in 0..len1 {
                let char1 = &string1_gc[start + i];
                let mut prev_char1_cost = i;
                let mut above_char_cost = i;

                // no need to look beyond window of lower right diagonal - maxDistance cells (lower right diag is i - lenDiff)
                // and the upper left diagonal + maxDistance cells (upper left is i)
                if i < j_offset {
                    j_start += 1;
                }

                if j_end < len2 {
                    j_end += 1;
                }

                for j in j_start..j_end {
                    current_cost = prev_char1_cost;
                    prev_char1_cost = char1_costs[&j];

                    if &string2_gc[start + j] != char1 {
                        // substitution if neither of two conditions below
                        if above_char_cost < current_cost {
                            current_cost = above_char_cost; // deletion
                        }

                        if prev_char1_cost < current_cost {
                            current_cost = prev_char1_cost // insertion
                        }

                        current_cost += 1;
                    }
                    above_char_cost = current_cost;
                    char1_costs.insert(j, above_char_cost);
                }
                if char1_costs[&(i + len_diff)] > max_distance {
                    return None;
                }
            }
        }
        return if current_cost <= max_distance { Some(current_cost) } else { None };
    }
}

impl Similarity for Levenshtein {
    /// <summary>Return Levenshtein similarity between two strings
    /// (1 - (levenshtein distance / len of longer string)).</summary>
    /// <param name="string1">One of the strings to compare.</param>
    /// <param name="string2">The other string to compare.</param>
    /// <returns>The degree of similarity 0 to 1.0, where 0 represents a lack of any
    /// notable similarity, and 1 represents equivalent strings.</returns>
    fn similarity<'a>(&mut self, mut string1: &'a str, mut string2: &'a str) -> Option<f64> {
        if string1.is_empty() {
            return if string2.is_empty() { Some(1.0) } else { Some(0.0) };
        }

        if string2.is_empty() {
            return Some(0.0);
        }

        // if strings of different lengths, ensure shorter string is in string1. This can result in a little
        // faster speed by spending more time spinning just the inner loop during the main processing.
        let str1_len = GraphemeClusters::new(string1).len();
        let mut str2_len = GraphemeClusters::new(string2).len();
        if str1_len > str2_len {
            let s = string1;
            string1 = string2;
            string2 = s;

            str2_len = str1_len;
        }

        let (len1, len2, start) = prefix_suffix_prep(string1, string2);
        if len1 == 0 {
            return Some(1.0);
        }

        let distance = Levenshtein::core_levenshtein(string1, string2, len1, len2, start, &mut self.base_char1_costs);
        if distance.is_some() {
            return similarity(distance.unwrap() as f64, str2_len as f64);
        }
        None
    }

    /// <summary>Return Levenshtein similarity between two strings
    /// (1 - (levenshtein distance / len of longer string)).</summary>
    /// <param name="string1">One of the strings to compare.</param>
    /// <param name="string2">The other string to compare.</param>
    /// <param name="minSimilarity">The minimum similarity that is of interest.</param>
    /// <returns>The degree of similarity 0 to 1.0, where -1 represents a similarity
    /// lower than minSimilarity, otherwise, a number between 0 and 1.0 where 0
    /// represents a lack of any noteable similarity, and 1 represents equivalent
    /// strings.</returns>
    fn similarity2<'a>(&mut self, mut string1: &'a str, mut string2: &'a str, min_similarity: f64) -> Option<f64> {
        assert_eq!((0.0..1.0).contains(&min_similarity), true);

        if string1.is_empty() && string2.is_empty() {
            return null_similarity_results(string1, string2, min_similarity);
        }

        // if strings of different lengths, ensure shorter string is in string1. This can result in a little
        // faster speed by spending more time spinning just the inner loop during the main processing.
        let mut str1_len = GraphemeClusters::new(string1).len();
        let mut str2_len = GraphemeClusters::new(string2).len();
        if str1_len > str2_len {
            let s = string1;
            string1 = string2;
            string2 = s;

            let sl = str1_len;
            str1_len = str2_len;
            str2_len = sl;
        }
        let max_distance = distance(min_similarity, str2_len);
        if str1_len > max_distance {
            return None;
        }

        if max_distance == 0 {
            return if string1 == string2 { Some(1.0) } else { None };
        }

        // identify common suffix and/or prefix that can be ignored
        let (len1, len2, start) = prefix_suffix_prep(string2, string2);
        if len1 == 0 {
            return Some(1.0);
        }

        let distance = if max_distance < len2 {
            Levenshtein::core_levenshtein2(string1, string2, len1, len2, start, max_distance as usize, &mut self.base_char1_costs)
        } else {
            Levenshtein::core_levenshtein(string1, string2, len1, len2, start, &mut self.base_char1_costs)
        };

        if distance.is_some() {
            return similarity(distance.unwrap() as f64, str2_len as f64);
        }
        None
    }
}

impl Distance for Levenshtein {
    /// <summary>Compute and return the Levenshtein edit distance between two strings.</summary>
    /// <remarks>https://github.com/softwx/SoftWx.Match
    /// This method is not threadsafe.</remarks>
    /// <param name="string1">One of the strings to compare.</param>
    /// <param name="string2">The other string to compare.</param>
    /// <returns>0 if the strings are equivalent, otherwise a positive number whose
    /// magnitude increases as difference between the strings increases.</returns>
    fn distance<'a>(&mut self, mut string1: &'a str, mut string2: &'a str) -> Option<usize> {
        let str2_len = GraphemeClusters::new(string2).len();
        if string1.is_empty() {
            return Some(str2_len);
        }

        let str1_len = GraphemeClusters::new(string1).len();
        if string2.is_empty() {
            return Some(str1_len);
        }
        // if strings of different lengths, ensure shorter string is in string1. This can result in a little
        // faster speed by spending more time spinning just the inner loop during the main processing.
        if str1_len > str2_len {
            let s = string1;
            string1 = string2;
            string2 = s;
        }
        // identify common suffix and/or prefix that can be ignored
        let (len1, len2, start) = prefix_suffix_prep(string1, string2);
        if len1 == 0 {
            return Some(len2);
        }

        return Levenshtein::core_levenshtein(string1, string2, len1, len2, start, &mut self.base_char1_costs);
    }

    /// <summary>Compute and return the Levenshtein edit distance between two strings.</summary>
    /// <remarks>https://github.com/softwx/SoftWx.Match
    /// This method is not threadsafe.</remarks>
    /// <param name="string1">One of the strings to compare.</param>
    /// <param name="string2">The other string to compare.</param>
    /// <param name="maxDistance">The maximum distance that is of interest.</param>
    /// <returns>None if the distance is greater than the maxDistance, 0 if the strings
    /// are equivalent, otherwise a positive number whose magnitude increases as
    /// difference between the strings increases.</returns>
    fn distance2<'a>(&mut self, mut string1: &'a str, mut string2: &'a str, max_distance: usize) -> Option<usize> {
        if string1.is_empty() || string2.is_empty() {
            return null_distance_results(string1, string2, max_distance);
        }

        if max_distance == 0 {
            return if string1 == string2 { Some(0) } else { None };
        }

        // if strings of different lengths, ensure shorter string is in string1. This can result in a little
        // faster speed by spending more time spinning just the inner loop during the main processing.
        if string1.len() > string2.len() {
            let s = string1;
            string1 = string2;
            string2 = s;
        }

        let (len1, len2, start) = prefix_suffix_prep(string1, string2);

        if len1 == 0 {
            if len2 <= max_distance {
                return Some(len2);
            } else {
                return None;
            }
        }
        if max_distance < len2 {
            return Levenshtein::core_levenshtein2(string1, string2, len1, len2, start, max_distance, &mut self.base_char1_costs);
        }
        return Levenshtein::core_levenshtein(string1, string2, len1, len2, start, &mut self.base_char1_costs);
    }
}