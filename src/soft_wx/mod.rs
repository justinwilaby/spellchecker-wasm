pub mod helpers;
pub mod levensthtein;
pub mod damerau_osa;

pub trait Distance {
    fn distance<'a>(&mut self, string1: &'a str, string2: &'a str) -> Option<usize>;
    fn distance2<'a>(&mut self, string1: &'a str, string2: &'a str, max_distance: usize) -> Option<usize>;
}

pub trait Similarity {
    fn similarity<'a>(&mut self, string1: &'a str, string2: &'a str) -> Option<f64>;
    fn similarity2<'a>(&mut self, string1: &'a str, string2: &'a str, min_similarity: f64) -> Option<f64>;
}