// Categorical chart palette — validated via the dataviz skill's
// scripts/validate_palette.js for both light and dark chart surfaces
// (adjacent-pairlist: worst CVD ΔE 9.1 light / 8.4 dark, worst normal-vision
// ΔE 19.6 light / 19.3 dark — both clear the ≥8 / ≥15 targets). Do not reorder
// without re-running the validator — the order itself is the safety property,
// not just the hex values. Cap consumers at 6 slots (validated as a set here);
// beyond that, fold extra series into "Other" rather than adding a 7th/8th hue.
export const CATEGORICAL_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
export const CATEGORICAL_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];

// Fixed-order stage-progression palette for the funnel (navy → blue → teal →
// amber → red) — validated as a categorical set via the dataviz skill's
// validate_palette.js (worst CVD ΔE 14.1 light / 6.9 dark, worst normal-vision
// ΔE 15.6 light / 15.9 dark; both clear their gates). The one WARN in each mode
// (contrast vs. surface on the violet/amber slot) is mitigated by the always-on
// bold white direct labels on every segment — never rely on the fill alone.
export const FUNNEL_LIGHT = ["#553C9A", "#2563EB", "#0D9488", "#F59E0B", "#DC2626"];
export const FUNNEL_DARK = ["#6D28D9", "#3B82F6", "#0D9488", "#B8860B", "#DC2626"];

// Two-series pair (Bills Raised / Payments Released) for the grouped-bar chart
// — validated via validate_palette.js (worst CVD ΔE 21.0 light / 18.9 dark,
// worst normal-vision ΔE 30.2 both modes — well clear of the gates).
export const PAIR_LIGHT = ["#7C3AED", "#0D9488"];
export const PAIR_DARK = ["#8B5CF6", "#0D9488"];

// Aging-bucket severity (0-3 / 4-7 / 8-15 / 16+ days pending) — a monotone
// one-hue ordinal ramp reads correctly on paper, but in practice most of a real
// aging distribution sits in only the two most-severe buckets, and two shades
// of the same hue next to each other render as one indistinct blob. Distinct
// hues (green→blue→amber→red) stay legible in that common case — validated as
// a categorical set via validate_palette.js (worst CVD ΔE 19.2 light / 6.9 dark
// — the dark WARN is mitigated by the legend's always-visible text labels).
export const AGING_LIGHT = ["#1baf7a", "#2a78d6", "#F59E0B", "#DC2626"];
export const AGING_DARK = ["#199e70", "#3987e5", "#B8860B", "#DC2626"];
