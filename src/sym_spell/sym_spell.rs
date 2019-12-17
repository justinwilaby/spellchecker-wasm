// SymSpell: 1 million times faster through Symmetric Delete spelling correction algorithm
//
// The Symmetric Delete spelling correction algorithm reduces the complexity of edit candidate generation and dictionary lookup
// for a given Damerau-Levenshtein distance. It is six orders of magnitude faster and language independent.
// Opposite to other algorithms only deletes are required, no transposes + replaces + inserts.
// Transposes + replaces + inserts of the input term are transformed into deletes of the dictionary term.
// Replaces and inserts are expensive and language dependent: e.g. Chinese has 70,000 Unicode Han characters!
//
// SymSpell supports compound splitting / decompounding of multi-word input strings with three cases:
// 1. mistakenly inserted space into a correct word led to two incorrect terms
// 2. mistakenly omitted space between two correct words led to one incorrect combined term
// 3. multiple independent input terms with/without spelling errors

// Copyright (C) 2019 Wolf Garbe
// Version: 6.5
// Author: Wolf Garbe wolf.garbe@faroo.com
// Maintainer: Wolf Garbe wolf.garbe@faroo.com
// Modified by: Justin Wilaby jwilaby@gmail.com
// URL: https://github.com/wolfgarbe/symspell
// Description: https://medium.com/@wolfgarbe/1000x-faster-spelling-correction-algorithm-2012-8701fcd87a5f
//
// MIT License
// Copyright (c) 2019 Wolf Garbe
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
// and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// https://opensource.org/licenses/MIT

use std::collections::{HashMap, HashSet};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::str;

use crate::edit_distance::{DistanceAlgorithm, EditDistance};
use crate::grapheme_iterator::GraphemeClusters;
use crate::sym_spell::suggested_item::SuggestItem;
use crate::sym_spell::verbosity::Verbosity;
use crate::utils::is_alpha_numeric;

const DEFAULT_MAX_EDIT_DISTANCE: usize = 2;
const DEFAULT_PREFIX_LENGTH: usize = 7;
const DEFAULT_COUNT_THRESHOLD: usize = 1;
const N: f64 = 1024908267229.0;

pub struct SymSpell {
    dictionary_edit_distance: usize,
    prefix_length: usize,
    //prefix length  5..7
    count_threshold: usize,
    // maximum dictionary term length
    max_dictionary_word_length: usize,
    // Dictionary that contains a mapping of lists of suggested correction words to the hashCodes
    // of the original words and the deletes derived from them. Collisions of hashCodes is tolerated,
    // because suggestions are ultimately verified via an edit distance function.
    // A list of suggestions might have a single suggestion, or multiple suggestions.
    deletes: HashMap<u64, Vec<String>>,
    // Dictionary of unique correct spelling words, and the frequency count for each word.
    words: HashMap<String, usize>,
    // Dictionary of unique words that are below the count threshold for being considered correct spellings.
    below_threshold_words: HashMap<String, usize>,
    bigrams: HashMap<String, usize>,
    bigram_count_min: usize,
}

impl SymSpell {
    pub fn new(dictionary_edit_distance: Option<usize>,
               prefix_length: Option<usize>,
               count_threshold: Option<usize>) -> SymSpell {
        let max_dict_edit_dist = dictionary_edit_distance.unwrap_or(DEFAULT_MAX_EDIT_DISTANCE);
        let prefix_len = prefix_length.unwrap_or(DEFAULT_PREFIX_LENGTH);
        let ct_threshold = count_threshold.unwrap_or(DEFAULT_COUNT_THRESHOLD);

        assert!(prefix_len >= 1 || prefix_len <= max_dict_edit_dist);

        SymSpell {
            dictionary_edit_distance: max_dict_edit_dist,
            prefix_length: prefix_len,
            count_threshold: ct_threshold,
            max_dictionary_word_length: 0,
            deletes: HashMap::new(),
            words: HashMap::new(),
            below_threshold_words: HashMap::new(),
            bigrams: HashMap::new(),
            bigram_count_min: usize::max_value(),
        }
    }

    pub fn max_edit_distance(&self) -> usize {
        self.dictionary_edit_distance
    }

    pub fn prefix_length(&self) -> usize {
        self.prefix_length
    }

    pub fn max_length(&self) -> usize { self.max_dictionary_word_length }

    pub fn count_threshold(&self) -> usize {
        self.count_threshold
    }

    pub fn word_count(&self) -> usize { self.words.len() }

    pub fn entry_count(&self) -> usize { self.deletes.len() }

    pub fn create_dictionary_entry(&mut self, key: String, mut count: usize) -> bool {
        let mut prev_count = 0;
        // look first in below threshold words, update count, and allow promotion to correct spelling word if count reaches threshold
        // threshold must be >1 for there to be the possibility of low threshold words
        if self.count_threshold > 1 && self.below_threshold_words.contains_key(&key) {
            prev_count = self.below_threshold_words[&key];
            // calculate new count for below threshold word
            count = if usize::max_value() - prev_count > count { prev_count + count } else { usize::max_value() };
            // has reached threshold - remove from below threshold collection (it will be added to correct words below)
            if count >= self.count_threshold {
                self.below_threshold_words.remove(&key);
            } else {
                self.below_threshold_words.insert(key, count);
                return false;
            }
        } else if self.words.contains_key(&key) {
            prev_count = self.words[&key];
            // just update count if it's an already added above threshold word
            count = if usize::max_value() - prev_count > count { prev_count + count } else { usize::max_value() };
            self.words.insert(key, count);
            return false;
        } else if count < self.count_threshold {
            // new or existing below threshold word
            self.below_threshold_words.insert(key, count);
            return false;
        }

        //edits/suggestions are created only once, no matter how often word occurs
        //edits/suggestions are created only as soon as the word occurs in the corpus,
        //even if the same term existed before in the dictionary as an edit from another word
        let key_len = GraphemeClusters::new(&key).len();
        if key_len > self.max_dictionary_word_length {
            self.max_dictionary_word_length = key_len;
        }
        let set = self.create_deletes(&key);
        for s in set {
            self.insert_delete(&s, &key);
        }
        self.words.insert(key, count);

        true
    }

    /// <summary>Load multiple dictionary entries from a file of word/frequency count pairs</summary>
    /// <remarks>Merges with any dictionary data already loaded.</remarks>
    pub fn write_line_to_bigram_dictionary(&mut self, line: &str, separator: &str) {
        let parts: Vec<&str> = line.split(separator).collect();
        let key = parts[0].to_owned() + " " + parts[1];

        let count = parts[2].trim_end().parse::<usize>().unwrap_or(0);
        self.bigrams.insert(key, count);

        if count < self.bigram_count_min {
            self.bigram_count_min = count;
        }
    }

    /// <summary>Load multiple dictionary entries from a stream of word/frequency count pairs</summary>
    /// <remarks>Merges with any dictionary data already loaded.</remarks>
    pub fn write_line_to_dictionary(&mut self, line: &str, separator: &str) {
        let mut parts = vec![];
        let mut idx = 0;
        for i in 0..line.len() {
            let ch = &line[i..i + 1];
            if ch == separator {
                parts.push(&line[idx..i]);
                idx = i + 1;
            }
        }
        parts.push(&line[idx..]);

        if parts.len() < 2 {
            return;
        }
        let key = parts[0].to_string();
        let count = parts[1].trim_end().parse::<usize>().unwrap_or(0);
        self.create_dictionary_entry(key, count);
    }

    /// Parses a str into the words that comprise it while omitting
    /// non alphanumeric chars
    fn parse_words(text: &str) -> Vec<String> {
        let mut words = Vec::new();
        let mut last_char_alpha_numeric = false;
        let mut cursor = 0;
        let it = GraphemeClusters::new(text);
        for (grapheme, range) in it {
            let alpha_numeric = is_alpha_numeric(grapheme);
            if !alpha_numeric {
                if last_char_alpha_numeric {
                    words.push(unsafe { String::from(text.get_unchecked(cursor..range.end - 1)) });
                }
                cursor = range.end;
            }
            last_char_alpha_numeric = alpha_numeric;
        }
        if last_char_alpha_numeric && cursor != text.len() {
            words.push(unsafe { String::from(text.get_unchecked(cursor..)) });
        }
        words
    }

    fn edits(&mut self, subject: &str, mut edit_distance: usize, delete_words: &mut HashSet<String>) {
        let len = subject.len();
        if len == 1 {
            return;
        }
        edit_distance += 1;
        let iter = GraphemeClusters::new(subject);
        for (_, range) in iter {
            let mut slice: Vec<u8> = Vec::new();
            if range.start != 0 {
                slice.extend_from_slice(subject[..range.start].as_bytes());
            }
            if range.start + 1 != len {
                slice.extend_from_slice(subject[range.start + 1..].as_bytes());
            }
            let delete = unsafe { String::from_utf8_unchecked(slice) };
            if !delete_words.contains(&delete) {
                if edit_distance < self.dictionary_edit_distance {
                    // recursion, if maximum edit distance not yet reached
                    self.edits(&delete, edit_distance, delete_words);
                }
                delete_words.insert(delete);
            }
        }
    }

    fn create_deletes(&mut self, mut key: &str) -> HashSet<String> {
        let mut set: HashSet<String> = HashSet::new();
        let gc = GraphemeClusters::new(key);
        let key_len = gc.len();
        if key_len <= self.dictionary_edit_distance {
            set.insert(String::new());
        }
        if key_len > self.prefix_length {
            let slice_range = gc.get_slice_range(0..self.prefix_length);
            key = &key[slice_range];
        }
        set.insert(String::from(key));
        self.insert_delete(key, key);

        self.edits(key, 0, &mut set);

        set
    }

    fn insert_delete(&mut self, delete: &str, key: &str) {
        let delete_hash = self.get_string_hash(delete);
        match self.deletes.get_mut(&delete_hash) {
            Some(suggestions) => {
                suggestions.push(key.into());
            }
            None => {
                self.deletes.insert(delete_hash, vec![key.into()]);
            }
        }
    }

    fn get_string_hash(&self, s: &str) -> u64 {
        let mut h = DefaultHasher::new();
        s.hash(&mut h);
        h.finish()
    }

    /// <summary>Find suggested spellings for a given input word.</summary>
    /// <param name="input">The word being spell checked.</param>
    /// <param name="verbosity">The value controlling the quantity/closeness of the retuned suggestions.</param>
    /// <param name="maxEditDistance">The maximum edit distance between input and suggested words.</param>
    /// <param name="includeUnknown">Include input word in suggestions, if no words within edit distance found.</param>
    /// <returns>A List of SuggestItem object representing suggested correct spellings for the input word,
    /// sorted by edit distance, and secondarily by count frequency.</returns>
    pub fn lookup(&self, input: &str, verbosity: Verbosity, max_edit_distance: usize, include_unknown: bool) -> Vec<SuggestItem> {
        //verbosity=Top: the suggestion with the highest term frequency of the suggestions of smallest edit distance found
        //verbosity=Closest: all suggestions of smallest edit distance found, the suggestions are ordered by term frequency
        //verbosity=All: all suggestions <= maxEditDistance, the suggestions are ordered by edit distance, then by term frequency (slower, no early termination)

        // maxEditDistance used in Lookup can't be bigger than the maxDictionaryEditDistance
        // used to construct the underlying dictionary structure.
        assert!(max_edit_distance <= self.dictionary_edit_distance);
        let mut suggestions = vec![];
        let input_gc = GraphemeClusters::new(input);
        let input_len = input_gc.len();

        let end = |mut suggestions: Vec<SuggestItem>| -> Vec<SuggestItem> {
            if include_unknown && suggestions.is_empty() {
                suggestions.push(SuggestItem::new(String::from(input), max_edit_distance + 1, 0))
            }
            suggestions
        };

        // early exit - word is too big to possibly match any words
        if input_len - max_edit_distance > self.max_dictionary_word_length {
            return end(suggestions);
        }

        // quick look for exact match
        if self.words.contains_key(input) {
            // early exit - return exact match, unless caller wants all matches
            if verbosity != Verbosity::All {
                return end(suggestions);
            }
        }

        // early termination, if we only want to check if word in dictionary or get its frequency e.g. for word segmentation
        if max_edit_distance == 0 {
            return end(suggestions);
        }

        // deletes we've considered already
        let mut deletes_considered: HashSet<String> = HashSet::new();
        // suggestions we've considered already
        let mut suggestions_considered: HashSet<String> = HashSet::new();
        // we considered the input already in the word.TryGetValue above
        suggestions_considered.insert(String::from(input));

        let mut max_edit_distance2 = max_edit_distance;
        let mut candidate_pointer = 0;
        let mut candidates: Vec<String> = Vec::new();

        // add original prefix
        let mut input_prefix_len = input_len;
        if input_prefix_len > self.prefix_length {
            input_prefix_len = self.prefix_length;
            let range = input_gc.get_slice_range(0..input_prefix_len);
            candidates.push(unsafe { String::from(input.get_unchecked(range)) });
        } else {
            candidates.push(String::from(input));
        }

        let mut distance_comparator = EditDistance::new(DistanceAlgorithm::DamaerauOSA);

        let should_continue = |prefix_length: usize,
                               suggestion_len: usize,
                               max_edit_distance: usize,
                               candidate_len: usize,
                               input_len: usize,
                               suggestion: &str,
                               input: &str,
                               input_gc: &GraphemeClusters,
                               suggestion_gc: &GraphemeClusters| -> bool {
            let mut min = input_len.min(suggestion_len);
            if prefix_length - max_edit_distance == candidate_len && min > prefix_length {
                min -= prefix_length;

                let i = input_len + 1 - min;
                let j = suggestion_len + 1 - min;
                let k = input_len - min;
                let l = suggestion_len - min;

                if input[i..] != suggestion[j..] ||
                    (min > 0 && &input_gc[k] != &suggestion_gc[l] &&
                        (&input_gc[k - 1] != &suggestion_gc[l] || &input_gc[k] != &suggestion_gc[l - 1])) {
                    // number of edits in prefix == max_edit_distance  AND no identical suffix
                    //, then edit_distance > max_edit_distance and no need for Levenshtein calculation
                    //      (input_len >= prefix_length) && (suggestion_len >= prefix_length)
                    return true;
                }
            }
            false
        };

        while candidate_pointer < candidates.len() {
            let candidate = &candidates[candidate_pointer].clone();
            candidate_pointer += 1;
            let candidate_gc = GraphemeClusters::new(candidate);
            let candidate_len = candidate_gc.len();
            let len_diff = input_prefix_len - candidate_len;
            // save some time - early termination
            // if canddate distance is already higher than suggestion distance, than there are no better suggestions to be expected
            if len_diff > max_edit_distance2 {
                // skip to next candidate if Verbosity.All, look no further if Verbosity.Top or Closest
                // (candidates are ordered by delete distance, so none are closer than current)
                if verbosity == Verbosity::All {
                    continue;
                }
                break;
            }
            // read candidate entry from dictionary
            let str_hash = self.get_string_hash(candidate);
            if self.deletes.contains_key(&str_hash) {
                let dict_suggestions = self.deletes.get(&str_hash).unwrap();
                // iterate through suggestions (to other correct dictionary items) of delete item and add them to suggestion list
                for suggestion in dict_suggestions {
                    if suggestion == input {
                        continue;
                    }
                    let suggestion_gc = GraphemeClusters::new(suggestion);
                    let suggestion_len = suggestion_gc.len();
                    if suggestion_len > input_len && f64::abs((suggestion_len - input_len) as f64) > max_edit_distance2 as f64 || // input and sug lengths diff > allowed/current best distance
                        suggestion_len < candidate_len || // sug must be for a different delete string, in same bin only because of hash collision
                        (suggestion_len == candidate_len && suggestion != candidate) // if sug len = delete len, then it either equals delete or is in same bin only because of hash collision
                    {
                        continue;
                    }
                    let suggestion_prefix_len = suggestion_len.min(self.prefix_length);
                    if suggestion_prefix_len > input_prefix_len && suggestion_prefix_len - candidate_len > max_edit_distance2 {
                        continue;
                    }
                    // True Damerau-Levenshtein Edit Distance: adjust distance, if both distances>0
                    // We allow simultaneous edits (deletes) of maxEditDistance on on both the dictionary and the input term.
                    // For replaces and adjacent transposes the resulting edit distance stays <= maxEditDistance.
                    // For inserts and deletes the resulting edit distance might exceed maxEditDistance.
                    // To prevent suggestions of a higher edit distance, we need to calculate the resulting edit distance, if there are simultaneous edits on both sides.
                    // Example: (bank==bnak and bank==bink, but bank!=kanb and bank!=xban and bank!=baxn for maxEditDistance=1)
                    // Two deletes on each side of a pair makes them all equal, but the first two pairs have edit distance=1, the others edit distance=2.
                    let mut distance = 0;
                    if candidate_len == 0 {
                        // suggestions which have no common chars with input (inputLen<=maxEditDistance && suggestionLen<=maxEditDistance)
                        distance = input_len.max(suggestion_len);
                        if distance > max_edit_distance2 || !suggestions_considered.insert(String::from(suggestion)) {
                            continue;
                        }
                    } else if suggestion_len == 1 {
                        let suggestion_range = suggestion_gc.get_slice_range(0..1);
                        if input.contains(suggestion.get(suggestion_range).unwrap()) {
                            distance = input_len;
                        } else {
                            distance = input_len - 1;
                        }
                    } else if should_continue(self.prefix_length, suggestion_len, max_edit_distance, candidate_len, input_len, suggestion, input, &input_gc, &suggestion_gc) {
                        continue;
                    } else {
                        // DeleteInSuggestionPrefix is somewhat expensive, and only pays off when verbosity is Top or Closest.
                        if verbosity != Verbosity::All && !self.delete_in_suggestion_prefix(&candidate, &suggestion) ||
                            !suggestions_considered.insert(String::from(suggestion)) {
                            continue;
                        }
                        let distance_comparison = distance_comparator.compare(input, suggestion, Some(max_edit_distance2));
                        if distance_comparison.is_none() {
                            continue;
                        }
                        distance = distance_comparison.unwrap();
                    }

                    // save some time do not process higher distances than those already found,
                    // if verbosity<All (note: maxEditDistance2 will always equal maxEditDistance when Verbosity.All)
                    if distance <= max_edit_distance2 {
                        let suggestion_ct = *self.words.get(suggestion).unwrap_or(&0);
                        let si = SuggestItem::new(suggestion.clone(), distance as usize, suggestion_ct);
                        if !suggestions.is_empty() {
                            match verbosity {
                                Verbosity::Closest => {
                                    if distance < max_edit_distance2 {
                                        suggestions.clear();
                                    }
                                }

                                Verbosity::Top => {
                                    if distance < max_edit_distance2 || suggestion_ct > suggestions[0].count {
                                        max_edit_distance2 = distance;
                                        suggestions[0] = si;
                                    }
                                    continue;
                                }
                                _ => {}
                            }
                        }
                        if verbosity != Verbosity::All {
                            max_edit_distance2 = distance;
                        }
                        suggestions.push(si);
                    }
                }
            }
            // add edits
            // derive edits (deletes) from candidate (input) and add them to candidates list
            // this is a recursive process until the maximum edit distance has been reached
            if len_diff < max_edit_distance && candidate_len <= self.prefix_length {
                // save some time
                // do not create edits with edit distance smaller than suggestions already found
                if verbosity != Verbosity::All && len_diff >= max_edit_distance2 {
                    continue;
                }
                let len = candidate.len();
                for (_, range) in candidate_gc {
                    let mut slice: Vec<u8> = Vec::new();
                    if range.start != 0 {
                        slice.extend_from_slice(candidate[..range.start].as_bytes());
                    }
                    if range.start + 1 != len {
                        slice.extend_from_slice(candidate[range.start + 1..].as_bytes());
                    }
                    let delete = unsafe { String::from_utf8_unchecked(slice) };
                    if deletes_considered.insert(delete.clone()) {
                        candidates.push(delete);
                    }
                }
            }
        }
        if suggestions.len() > 1 {
            suggestions.sort_by(|a, b| {
                if a.distance == b.distance {
                    return b.count.cmp(&a.count);
                }
                b.distance.cmp(&a.distance)
            })
        }
        end(suggestions)
    }

    /// <summary>Find suggested spellings for a multi-word input string (supports word splitting/merging).</summary>
    /// <param name="input">The string being spell checked.</param>
    /// <param name="maxEditDistance">The maximum edit distance between input and suggested words.</param>
    /// <returns>A List of SuggestItem object representing suggested correct spellings for the input string.</returns>
    pub fn lookup_compound(&self, input: &str, max_edit_distance: usize) -> Vec<SuggestItem> {
        let term_list = SymSpell::parse_words(input);

        let mut suggestion_parts: Vec<SuggestItem> = Vec::new(); // 1 line with separate parts
        let mut distance_comparator = EditDistance::new(DistanceAlgorithm::DamaerauOSA);

        // translate every term to its best suggestion, otherwise it remains unchanged
        let mut last_combi = false;
        for i in 0..term_list.len() {
            let mut suggestions = self.lookup(&term_list[i], Verbosity::Top, max_edit_distance, false); // suggestions for a single term

            if i > 0 && !last_combi {
                let mut combi = String::from(&term_list[i - 1]);
                combi.push_str(&term_list[i]);

                let mut suggestions_combi = self.lookup(&combi, Verbosity::Top, max_edit_distance, false);
                if !suggestions_combi.is_empty() {
                    let best1 = suggestion_parts.last().unwrap();
                    let mut best2 = &mut SuggestItem::default();
                    if !suggestions.is_empty() {
                        best2 = suggestions.first_mut().unwrap();
                    } else {
                        // unknown word
                        best2.term = term_list[i].clone();
                        // estimated edit distance
                        best2.distance = max_edit_distance + 1;
                        // estimated word occurrence probability P=10 / (N * 10^word length l)
                        let term_len = GraphemeClusters::new(&best2.term).len();
                        best2.count = (10.0 / 10.0f64.powf(term_len as f64)) as usize;
                    }
                    // distance1=edit distance between 2 split terms und their best corrections : als comparative value for the combination
                    let distance = best1.distance + best2.distance;
                    let suggestion_combi = &mut suggestions_combi[0];
                    if suggestion_combi.distance + 1 < distance ||
                        (suggestion_combi.distance + 1 == distance && suggestion_combi.count > (best1.count as f64 / N * best2.count as f64) as usize) {
                        suggestion_combi.distance += 1;
                        suggestion_parts.pop();
                        suggestion_parts.push(suggestions_combi.remove(0));
                        last_combi = true;

                        continue;
                    }
                }
            }

            last_combi = false;

            // always split terms without suggestion & never split terms with suggestion edit_distance = 0 & never split single char terms
            let term = &term_list[i];
            let term_gc = GraphemeClusters::new(term);
            let term_len = term_gc.len();
            if !suggestions.is_empty() && (suggestions[0].distance == 0 || term_len == 1) {
                // choose best suggestion
                suggestion_parts.push(suggestions.remove(0));
            } else {
                // if no perfect suggestion, split word into pairs
                let mut best_suggestion_split: Option<SuggestItem> = None;
                // add original term
                if !suggestions.is_empty() {
                    best_suggestion_split = suggestions.get(0).cloned();
                }
                if term_len > 1 {
                    for j in 1..term_len {
                        let part1_range = term_gc.get_slice_range(0..j);
                        let part2_range = term_gc.get_slice_range(j..term_len);
                        let part1 = unsafe { term.get_unchecked(part1_range) };
                        let part2 = unsafe { term.get_unchecked(part2_range) };

                        let mut suggestion_split = SuggestItem::default();
                        let suggestions1 = self.lookup(part1, Verbosity::Top, max_edit_distance, false);
                        if !suggestions.is_empty() {
                            let suggestions2 = self.lookup(part2, Verbosity::Top, max_edit_distance, false);
                            if !suggestions2.is_empty() {
                                // select best suggestion for split pair
                                suggestion_split.term.push_str(&suggestions[0].term);
                                suggestion_split.term.push_str(" ");
                                suggestion_split.term.push_str(&suggestions2[0].term);

                                let distance_opt = distance_comparator.compare(&term, &suggestion_split.term, Some(max_edit_distance));
                                let distance2 = distance_opt.unwrap_or(max_edit_distance + 1);

                                if best_suggestion_split.as_ref().is_some() {
                                    let best = best_suggestion_split.as_ref().unwrap();
                                    if distance2 > best.distance {
                                        continue;
                                    }
                                    if distance2 < best.distance {
                                        best_suggestion_split = None;
                                    }
                                }
                                suggestion_split.distance = distance2;
                                // if bigram exists in bigram dictionary
                                if self.bigrams.contains_key(&suggestion_split.term) {
                                    suggestion_split.count = *self.bigrams.get(&suggestion_split.term).unwrap();
                                    // increase count, if split.corrections are part of or identical to input
                                    // single term correction exists
                                    let mut term_compare = String::from(&suggestions1[0].term);
                                    term_compare.push_str(&suggestions2[0].term);
                                    if !suggestions.is_empty() {
                                        // alternatively remove the single term from suggestionsSplit, but then other splittings could win
                                        if term == &term_compare {
                                            // make count bigger than count of single term correction
                                            suggestion_split.count = suggestion_split.count.max(suggestions[0].count);
                                        } else if suggestions1[0].term == suggestions[0].term ||
                                            suggestions2[0].term == suggestions[0].term {
                                            // make count bigger than count of single term correction
                                            suggestion_split.count = suggestion_split.count.max(suggestions[0].count + 1);
                                        }
                                    } else if term == &term_compare {
                                        // no single term correction exists
                                        suggestion_split.count = suggestion_split.count.max(suggestions1[0].count.max(suggestions2[0].count + 1));
                                    }
                                } else {
                                    // The Naive Bayes probability of the word combination is the product of the two word probabilities: P(AB) = P(A) * P(B)
                                    // use it to estimate the frequency count of the combination, which then is used to rank/select the best splitting variant
                                    suggestion_split.count = self.bigram_count_min.min((suggestions1[0].count as f64 / N * suggestions2[0].count as f64) as usize)
                                }
                                if best_suggestion_split.is_none() || suggestion_split.count > best_suggestion_split.as_ref().unwrap().count {
                                    best_suggestion_split = Some(suggestion_split);
                                }
                            }
                        }
                    }
                    if best_suggestion_split.is_some() {
                        suggestion_parts.push(best_suggestion_split.unwrap())
                    } else {
                        let si = SuggestItem::new(term.clone(), 10 / 10f64.powf(term_len as f64) as usize, max_edit_distance + 1);
                        suggestion_parts.push(si);
                    }
                } else {
                    let si = SuggestItem::new(term_list[i].clone(), 10 / 10f64.powf(term_len as f64) as usize, max_edit_distance + 1);
                    suggestion_parts.push(si);
                }
            }
        }

        let mut count = N;
        let mut suggestion = SuggestItem::default();
        let mut s = String::new();
        let len = suggestion_parts.len();
        for i in 0..len {
            let suggestion_item = &mut suggestion_parts[i];
            s.push_str(&suggestion_item.term);
            if i != len {
                s.push_str(" ");
            }
            count *= suggestion_item.count as f64 / N;
        }

        suggestion.count = count as usize;
        suggestion.term = s;
        suggestion.distance = distance_comparator.compare(input, &suggestion.term, Some(usize::max_value())).unwrap_or(0);

        return vec![suggestion];
    }

    /// <summary>Find suggested spellings for a multi-word input string (supports word splitting/merging).</summary>
    /// <param name="input">The string being spell checked.</param>
    /// <param name="maxSegmentationWordLength">The maximum word length that should be considered.</param>
    /// <param name="maxEditDistance">The maximum edit distance between input and corrected words
    /// (0=no correction/segmentation only).</param>
    /// <returns>The word segmented string,
    /// the word segmented and spelling corrected string,
    /// the Edit distance sum between input string and corrected string,
    /// the Sum of word occurence probabilities in log scale (a measure of how common and probable the corrected segmentation is).</returns>
    pub fn word_segmentation(&self, input: &str, max_edit_distance: usize, max_segmentation_word_len_opt: Option<usize>) -> (String, String, usize, f64) {
        let max_segmentation_word_len = max_segmentation_word_len_opt.unwrap_or(self.max_dictionary_word_length);
        let input_gc = GraphemeClusters::new(input);
        let input_len = input_gc.len();
        let capacity = max_segmentation_word_len.min(input_len);
        let mut compositions: Vec<(String, String, usize, f64)> = Vec::with_capacity(capacity);

        let mut circular_index = -1;
        // outer loop (column): all possible part start positions
        for j in 0..input_len {
            // inner loop (row): all possible part lengths (from start position): part can't be bigger than longest word in dictionary (other than long unknown word)
            let max = max_segmentation_word_len.min(input_len - j);
            for i in 1..max + 1 {
                // get top spelling correction/ed for part
                let input_range = input_gc.get_slice_range(j..i);
                let mut part = unsafe { input.get_unchecked(input_range).to_string() };
                let mut separator_len = 0;
                let mut top_edit_distance = 0;

                // remove space for levensthein calculation
                if " \n\r\t".contains(unsafe { input.get_unchecked(0..1) }) {
                    part = unsafe { input.get_unchecked(j + 1..i).to_string() };
                } else {
                    // add ed+1: space did not exist, had to be inserted
                    separator_len = 1;
                }

                // remove space from part1, add number of removed spaces to topEd
                top_edit_distance += GraphemeClusters::new(&part).len();
                // remove space
                part = part.replace(" ", "");
                // add number of removed spaces to ed
                let part_len = GraphemeClusters::new(&part).len();
                top_edit_distance -= part_len;

                let results = self.lookup(&part, Verbosity::Top, max_edit_distance, false);
                let (top_result, top_probability_log) = if !results.is_empty() {
                    let result = &results[0];
                    top_edit_distance += result.distance;
                    // Naive Bayes Rule
                    // we assume the word probabilities of two words to be independent
                    // therefore the resulting probability of the word combination is the product of the two word probabilities

                    // instead of computing the product of probabilities we are computing the sum of the logarithm of probabilities
                    // because the probabilities of words are about 10^-10, the product of many such small numbers could exceed (underflow) the floating number range and become zero
                    // log(ab)=log(a)+log(b)
                    (&result.term, (result.count as f64 / N).log10())
                } else {
                    // default, if word not found
                    // otherwise long input text would win as long unknown word (with ed=edmax+1 ), although there there should many spaces inserted
                    (&part, (10.0 / (N * 10.0f64.powf(part_len as f64))).log10())
                };

                let destination_index = ((i as i32 + circular_index) % capacity as i32) as usize;

                //set values in first loop
                if j == 0 {
                    compositions[destination_index] = (part.to_string(), top_result.to_string(), top_edit_distance, top_probability_log);
                }

                if circular_index == -1 {
                    continue;
                }
                // Cleaner conditionals this way
                let (_, _, d_distance_sum, d_probability_log_sum) = &compositions[destination_index];
                let (c_segmented_string, c_corrected_string, c_distance_sum, c_probability_log_sum) = &compositions[circular_index as usize];

                if i == max_segmentation_word_len ||
                    //replace values if better probabilityLogSum, if same edit distance OR one space difference
                    ((c_distance_sum + top_edit_distance == *d_distance_sum || c_distance_sum + separator_len + top_edit_distance == *d_distance_sum) &&
                        d_probability_log_sum < c_probability_log_sum) ||
                    c_distance_sum + separator_len + top_edit_distance < *d_distance_sum {
                    compositions[destination_index] = (
                        c_segmented_string.to_owned() + " " + &part,
                        c_corrected_string.to_owned() + " " + top_result,
                        *c_distance_sum + separator_len + top_edit_distance,
                        *c_probability_log_sum + top_probability_log
                    );
                }
            }
            circular_index += 1;
            if circular_index as usize == capacity {
                circular_index = 0;
            }
        }

        compositions.remove(circular_index as usize)
    }

    // check whether all delete chars are present in the suggestion prefix in correct order, otherwise this is just a hash collision
    fn delete_in_suggestion_prefix(&self, delete: &str, suggestion: &str) -> bool {
        let delete_gc = GraphemeClusters::new(delete);
        let suggestion_gc = GraphemeClusters::new(suggestion);

        let delete_len = delete_gc.len();
        if delete_len == 0 {
            return true;
        }

        let suggestion_len = suggestion_gc.len().min(self.prefix_length);

        let mut j = 0;
        for (delete_char, _) in delete_gc {
            while j < suggestion_len && delete_char != &suggestion_gc[j] {
                j += 1;
            }
            if j == suggestion_len {
                return false;
            }
        }
        true
    }
}

#[cfg(test)]
mod sym_spell_tests {
    use crate::sym_spell::sym_spell::SymSpell;

    #[test]
    fn parse_words_test() {
        let text = "this is a - test, (does it work)?";
        let words = SymSpell::parse_words(text);
        assert_eq!(words.len(), 7)
    }

}
