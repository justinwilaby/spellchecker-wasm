use crate::soft_wx::{
    damerau_osa::DamaerauOSA,
    levensthtein::Levenshtein,
};
use crate::soft_wx::Distance;

pub enum DistanceAlgorithm {
    Levenshtein,
    DamaerauOSA,
}

/// <summary>Wrapper for third party edit distance algorithms.</summary>

/// <summary>Supported edit distance algorithms.</summary>
pub struct EditDistance {
    distance_comparator: Box<dyn Distance>,
}

impl EditDistance {
    /// <summary>Create a new EditDistance object.</summary>
    /// <param name="algorithm">The desired edit distance algorithm.</param>
    pub fn new(distance_algorithm: DistanceAlgorithm) -> EditDistance {
        let distance_comparator:Box<dyn Distance> = match distance_algorithm {
            DistanceAlgorithm::DamaerauOSA => Box::new(DamaerauOSA::new()),
            DistanceAlgorithm::Levenshtein => Box::new(Levenshtein::new()),
        };

        EditDistance {
            distance_comparator
        }
    }

    /// <summary>Compare a string to the base string to determine the edit distance,
    /// using the previously selected algorithm.</summary>
    /// <param name="string2">The string to compare.</param>
    /// <param name="maxDistance">The maximum distance allowed.</param>
    /// <returns>The edit distance (or -1 if maxDistance exceeded).</returns>
    pub fn compare(&mut self, string1: &str, string2: &str, max_distance: Option<usize>) -> Option<usize> {
        if max_distance.is_some() {
            return self.distance_comparator.distance2(string1, string2, max_distance.unwrap())
        }
        return self.distance_comparator.distance(string1, string2);
    }
}
