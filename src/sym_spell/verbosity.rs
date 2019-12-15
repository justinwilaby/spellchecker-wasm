/// <summary>Controls the closeness/quantity of returned spelling suggestions.</summary>
#[derive(PartialEq)]
pub enum Verbosity {
    /// <summary>Top suggestion with the highest term frequency of the suggestions of smallest edit distance found.</summary>
    Top,
    /// <summary>All suggestions of smallest edit distance found, suggestions ordered by term frequency.</summary>
    Closest,
    /// <summary>All suggestions within maxEditDistance, suggestions ordered by edit distance
    /// , then by term frequency (slower, no early termination).</summary>
    All,
}