// Copyright ©2015-2018 SoftWx, Inc.
// Released under the MIT License the text of which appears at the end of this file.
// <authors> Steve Hatchett

use std::collections::HashMap;

use crate::grapheme_iterator::GraphemeClusters;
use crate::soft_wx::{Distance, Similarity};
use crate::soft_wx::helpers::{distance, null_distance_results, null_similarity_results, prefix_suffix_prep, similarity};

pub struct DamaerauOSA {
    base_char1_costs: HashMap<usize, usize>,
    base_prev_char1_costs: HashMap<usize, usize>,
}

/// <summary>
/// Class providing optimized methods for computing Damerau-Levenshtein Optimal String
/// Alignment (OSA) comparisons between two strings.
/// </summary>
/// <remarks>
/// Copyright ©2015-2018 SoftWx, Inc.
/// The inspiration for creating highly optimized edit distance functions was
/// from Sten Hjelmqvist's "Fast, memory efficient" algorithm, described at
/// http://www.codeproject.com/Articles/13525/Fast-memory-efficient-Levenshtein-algorithm
/// The Damerau-Levenshtein algorithm is basically the Levenshtein algorithm with a
/// modification that considers transposition of two adjacent characters as a single edit.
/// The optimized algorithm was described in detail in my post at
/// http://blog.softwx.net/2015/01/optimizing-damerau-levenshtein_15.html
/// Also see http://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance
/// Note that this implementation of Damerau-Levenshtein is the simpler and faster optimal
/// string alignment (aka restricted edit) distance that difers slightly from the classic
/// algorithm by imposing the restriction that no substring is edited more than once. So,
/// for example, "CA" to "ABC" has an edit distance of 2 by a complete application of
/// Damerau-Levenshtein, but has a distance of 3 by the method implemented here, that uses
/// the optimal string alignment algorithm. This means that this algorithm is not a true
/// metric since it does not uphold the triangle inequality. In real use though, this OSA
/// version may be desired. Besides being faster, it does not give the lower distance score
/// for transpositions that occur across long distances. Actual human error transpositions
/// are most likely for adjacent characters. For example, the classic Damerau algorithm
/// gives a distance of 1 for these two strings: "sated" and "dates" (it counts the 's' and
/// 'd' as a single transposition. The optimal string alignment version of Damerau in this
/// class gives a distance of 2 for these two strings (2 substitutions), as it only counts
/// transpositions for adjacent characters.
/// The methods in this class are not threadsafe. Use the static versions in the Distance
/// class if that is required.</remarks>
impl DamaerauOSA {
    /// <summary>Create a new instance of DamerauOSA.</summary>
    pub fn new() -> DamaerauOSA {
        DamaerauOSA {
            base_char1_costs: HashMap::new(),
            base_prev_char1_costs: HashMap::new(),
        }
    }

    /// <summary>Internal implementation of the core Damerau-Levenshtein, optimal string alignment algorithm.</summary>
    /// <remarks>https://github.com/softwx/SoftWx.Match</remarks>
    fn core_damerau_levenshtein(string1: &str, string2: &str, len1: usize, len2: usize, start: usize, char1_costs: &mut HashMap<usize, usize>, prev_char1_costs: &mut HashMap<usize, usize>) -> Option<usize> {
        for j in 0..len2 {
            char1_costs.insert(j, j + 1);
        }

        let mut char1 = " ";
        let mut current_cost = 0;
        let string1_gc = GraphemeClusters::new(string1);
        let string2_gc = GraphemeClusters::new(string2);
        for i in 0..len1 {
            let prev_char1 = char1;
            char1 = &string1_gc[start + i];
            let mut char2 = " ";
            let mut left_char_cost = i;
            let mut above_char_cost = i;
            let mut next_trans_cost = 0;

            for j in 0..len2 {
                let this_trans_cost = next_trans_cost;
                next_trans_cost = *prev_char1_costs.entry(j).or_insert(0);
                current_cost = left_char_cost;
                prev_char1_costs.insert(j, current_cost); // cost of diagonal (substitution)
                left_char_cost = char1_costs[&j]; // left now equals current cost (which will be diagonal at next iteration)

                let prev_char2 = char2;
                char2 = &string2_gc[start + j];
                if char1 != char2 {
                    // substitution if neither of two conditions below
                    if above_char_cost < current_cost {
                        current_cost = above_char_cost; // deletion
                    }
                    if left_char_cost < current_cost {
                        current_cost = left_char_cost; // insertion
                    }

                    current_cost = current_cost + 1;

                    if i != 0 && j != 0 && char1 == prev_char2 && prev_char1 == char2 && this_trans_cost + 1 < current_cost {
                        current_cost = this_trans_cost + 1; // transposition
                    }
                }
                above_char_cost = current_cost;
                char1_costs.insert(j, above_char_cost);
            }
        }

        Some(current_cost)
    }

    fn core_damerau_levenshtein2(string1: &str, string2: &str, len1: usize, len2: usize, start: usize, max_distance: usize, char1_costs: &mut HashMap<usize, usize>, prev_char1_costs: &mut HashMap<usize, usize>) -> Option<usize> {
        for j in 0..max_distance {
            char1_costs.insert(j, j + 1);
        }

        if max_distance < len2 {
            for k in max_distance..len2 {
                char1_costs.insert(k, max_distance + 1);
            }
        }

        let len_diff = len2 - len1;
        let j_offset = max_distance as i32 - len_diff as i32;
        let mut j_start = 0;
        let mut j_end = max_distance;
        let mut char1 = " ";
        let mut current_cost = 0;

        let string1_gc = GraphemeClusters::new(string1);
        let string2_gc = GraphemeClusters::new(string2);
        for i in 0..len1 {
            let prev_char1 = char1;
            char1 = &string1_gc[start + i];
            let mut char2 = " ";
            let mut left_char_cost = i;
            let mut above_char_cost = i;
            let mut next_trans_cost = 0;
            // no need to look beyond window of lower right diagonal - maxDistance cells (lower right diag is i - lenDiff)
            // and the upper left diagonal + maxDistance cells (upper left is i)
            if i as i32 > j_offset {
                j_start += 1;
            }

            if j_end < len2 {
                j_end += 1;
            }

            for j in j_start..j_end {
                let this_trans_cost = next_trans_cost;
                next_trans_cost = *prev_char1_costs.entry(j).or_insert(0);
                current_cost = left_char_cost;
                prev_char1_costs.insert(j, current_cost); // cost on diagonal (substitution)
                left_char_cost = char1_costs[&j]; // left now equals current cost (which will be diagonal at next iteration)
                let prev_char2 = char2;
                char2 = &string2_gc[start + j];
                if char1 != char2 {
                    // substitution if neither of two conditions below
                    if above_char_cost < current_cost {
                        current_cost = above_char_cost;
                    }
                    if left_char_cost < current_cost {
                        current_cost = left_char_cost
                    }
                    current_cost += 1;
                    if i != 0 && j != 0 && char1 == prev_char2 && prev_char1 == char2 && this_trans_cost + 1 < current_cost {
                        current_cost = this_trans_cost + 1;
                    }
                }
                above_char_cost = current_cost;
                char1_costs.insert(j, above_char_cost);
            }
            if char1_costs[&(i + len_diff)] > max_distance {
                return None;
            }
        }
        return if current_cost <= max_distance { Some(current_cost) } else { None };
    }
}

impl Similarity for DamaerauOSA {
    /// <summary>Return Damerau-Levenshtein optimal string alignment similarity
    /// between two strings (1 - (damerau distance / len of longer string)).</summary>
    /// <param name="string1">One of the strings to compare.</param>
    /// <param name="string2">The other string to compare.</param>
    /// <returns>The degree of similarity 0 to 1.0, where 0 represents a lack of any
    /// noteable similarity, and 1 represents equivalent strings.</returns>
    fn similarity<'a>(&mut self, mut string1: &'a str, mut string2: &'a str) -> Option<f64> {
        let str1_len = GraphemeClusters::new(string1).len();
        if string1.is_empty() {
            return Some(str1_len as f64);
        }

        let mut str2_len = GraphemeClusters::new(string2).len();
        if string2.is_empty() {
            return Some(str2_len as f64);
        }

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

        let distance = DamaerauOSA::core_damerau_levenshtein(string1, string2, len1, len2, start, &mut self.base_char1_costs, &mut self.base_prev_char1_costs);
        if distance.is_some() {
            return similarity(distance.unwrap() as f64, str2_len as f64);
        }
        None
    }

    /// <summary>Return Damerau-Levenshtein optimal string alignment similarity
    /// between two strings (1 - (damerau distance / len of longer string)).</summary>
    /// <param name="string1">One of the strings to compare.</param>
    /// <param name="string2">The other string to compare.</param>
    /// <param name="minSimilarity">The minimum similarity that is of interest.</param>
    /// <returns>The degree of similarity 0 to 1.0, where -1 represents a similarity
    /// lower than minSimilarity, otherwise, a number between 0 and 1.0 where 0
    /// represents a lack of any noteable similarity, and 1 represents equivalent
    /// strings.</returns>
    fn similarity2<'a>(&mut self, string1: &'a str, string2: &'a str, min_similarity: f64) -> Option<f64> {
        assert_eq!((0.0..1.0).contains(&min_similarity), true);

        if string1.is_empty() || string2.is_empty() {
            return null_similarity_results(string1, string2, min_similarity);
        }

        // if strings of different lengths, ensure shorter string is in string1. This can result in a little
        // faster speed by spending more time spinning just the inner loop during the main processing.
        let str1_len = GraphemeClusters::new(string1).len();
        let str2_len = GraphemeClusters::new(string2).len();

        let max_distance = distance(min_similarity, str2_len);
        if str2_len - str1_len > max_distance {
            return None;
        }

        if max_distance <= 0 {
            return if string1 == string2 { Some(1.0) } else { None };
        }

        let (len1, len2, start) = prefix_suffix_prep(string1, string2);

        if len1 == 0 {
            return Some(1.0);
        }
        let distance =
        if max_distance < len2 {
            DamaerauOSA::core_damerau_levenshtein2(string1, string2, len1, len2, start, max_distance, &mut self.base_char1_costs, &mut self.base_prev_char1_costs)
        } else {
            DamaerauOSA::core_damerau_levenshtein(string1, string2, len1, len2, start, &mut self.base_char1_costs, &mut self.base_prev_char1_costs)
        };

        if distance.is_some() {
            return similarity(distance.unwrap() as f64, str2_len as f64);
        }
        None
    }
}

impl Distance for DamaerauOSA {
    /// <summary>Compute and return the Damerau-Levenshtein optimal string
    /// alignment edit distance between two strings.</summary>
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

        let (len1, len2, start) = prefix_suffix_prep(string1, string2);

        if len1 == 0 {
            return Some(len2);
        }

        return DamaerauOSA::core_damerau_levenshtein(string1, string2, len1, len2, start, &mut self.base_char1_costs, &mut self.base_prev_char1_costs);
    }

    /// <summary>Compute and return the Damerau-Levenshtein optimal string
    /// alignment edit distance between two strings.</summary>
    /// <remarks>https://github.com/softwx/SoftWx.Match
    /// This method is not threadsafe.</remarks>
    /// <param name="string1">One of the strings to compare.</param>
    /// <param name="string2">The other string to compare.</param>
    /// <param name="maxDistance">The maximum distance that is of interest.</param>
    /// <returns>-1 if the distance is greater than the maxDistance, 0 if the strings
    /// are equivalent, otherwise a positive number whose magnitude increases as
    /// difference between the strings increases.</returns>
    fn distance2<'a>(&mut self, mut string1: &'a str, mut string2: &'a str, max_distance: usize) -> Option<usize> {
        if string1.is_empty() || string2.is_empty() {
            return null_distance_results(string1, string2, max_distance);
        }
        if max_distance <= 0 {
            return if string1 == string2 { Some(0) } else { None };
        }

        // if strings of different lengths, ensure shorter string is in string1. This can result in a little
        // faster speed by spending more time spinning just the inner loop during the main processing.
        let str1_len = GraphemeClusters::new(string1).len();
        let str2_len = GraphemeClusters::new(string2).len();

        if str1_len > str2_len {
            let s = string1;
            string1 = string2;
            string2 = s;
        }

        if str2_len > str1_len && str2_len - str1_len > max_distance {
            return None;
        }

        let (len1, len2, start) = prefix_suffix_prep(string1, string2);
        if len1 == 0 {
            return if len2 <= max_distance { Some(len2) } else { None };
        }
        if max_distance < len2 {
            return DamaerauOSA::core_damerau_levenshtein2(string1, string2, len1, len2, start, max_distance, &mut self.base_char1_costs, &mut self.base_prev_char1_costs);
        }
        return DamaerauOSA::core_damerau_levenshtein(string1, string2, len1, len2, start, &mut self.base_char1_costs, &mut self.base_prev_char1_costs);
    }
}