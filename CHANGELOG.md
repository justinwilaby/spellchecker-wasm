# Changelog

## [0.2.0] - 2026-10-16

### Added
- WordSegmentation improvements from SymSpell v6.7
  - Case preservation in output
  - Punctuation preservation adjacent to previous word
  - Ligature normalization (ﬁ → fi)
  - Hyphen removal during segmentation

### Fixed
- WordSegmentation exception fix from SymSpell v6.7.2 (empty parts)
- CommitStaged null reference fix from SymSpell v6.7.3

### Changed
- Updated encoding to u32 little-endian for consistent cross-language serialization
- Added unicode-normalization dependency for Nfkc support

## [0.1.0] - Previous
- Initial release based on SymSpell v6.6
