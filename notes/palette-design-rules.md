# Palette design rules

Findings and design heuristics for ANSI-16 palettes in `ansil16`, derived
during interactive design work in `designer/` and from the calibration
research side-session. Not a tutorial — assumes you know what OKLab/CIELAB
are. These are *priors* for hand-design and for the calibrator's loss
function ([chainlink #1](../README.md) / `notes/calibration-research.md`).

## Mid-L anchor (chromatic CSF peak)

Row anchor L should sit in the chromatic contrast-sensitivity peak,
roughly **L ≈ 0.55–0.65** in OKLab/CIELAB normalized units. Avoid the
extremes even when a bigger bg-contrast would seem to argue for them.

Why:

- The chromatic CSF (color contrast sensitivity function) peaks around
  mid-photopic luminance. At low L the visual system shifts toward
  scotopic (rod-dominated, low chromatic acuity); at high L there's a
  compressive nonlinearity plus near-white desaturation. Two colors at
  iso-L are perceived as *farther apart* in the mid-L sweet spot than at
  the extremes.
- The sRGB gamut also widens at mid-L, especially in the blue/magenta
  region. At very low L those slots get geometrically crammed together;
  at mid-L they have room to occupy different (a, b) regions.

Empirical observation that led here: bumping `c4 (blue)` and `c5 (magenta)`
together to mid-L improved their discriminability beyond what their
iso-L ΔE predicted — both perceptual amplification *and* more (a, b)
separation in the wider gamut slice.

For dark theme:
- Standard row anchor ≈ 0.55–0.6 (compromise between bg contrast and CSF peak).
- Bright row anchor a bit higher (~0.7) for further bg contrast.

For light theme (inverted):
- Standard row pulled into 0.55–0.6 from above (down from the bg side).
- Bright row darker (~0.45) for contrast against the light bg.

## Alternating L\* around the hue hexagon

Within each chromatic row, alternate L\* between odd and even slots:
e.g. `c1` brighter, `c2` darker, `c3` brighter, `c4` darker, `c5`
brighter, `c6` darker (offset and magnitude tunable; ±1–2pp around the
row anchor is a reasonable starting amplitude).

Why:

- Legibility failures in the designer's intelligibility grid concentrate
  in within-luminance chroma-only differences, especially the green-blue
  arc (`c2/c4/c6`) and the red-purple arc (`c1/c5/c6`). Adjacent hues at
  equal L\* differ only in (a\*, b\*) — they carry no luminance
  discriminant — and fail at thin-stroke spatial frequencies (the
  chromatic CSF is poor at fine detail, especially S-cone).
- Alternating L\* guarantees adjacent-hue luminance contrast at every
  hexagon position. Precludes the c4/c6 iso-luminance bug structurally
  rather than tuning around it per-pair.

Cost: the row loses the visual unity of strictly equal-L\*. May feel
slightly less cohesive aesthetically. Worth A/B-ing on your palettes.

## Composition: mid-L anchor + alternating residuals

The two rules above compose. Anchor the row at the CSF peak; then
alternate per-slot L residuals (±1–2pp) around that anchor. You get:

- Maximum chromatic discrimination available (from the anchor placement)
- Plus a structural luminance discriminant for adjacent-hue pairs (from
  the alternation)

The designer's per-slot L residual feature (scroll-wheel on a chromatic
dot, ±0.1pp per tick, capped at ±5pp from anchor) is the mechanism that
implements both rules manually. The calibrator (#1) should use the
combined rule as its prior on the initial palette and as a soft
constraint in the loss function.

## Backend choice (user-specific)

This user's subjective luminance maps to **CIELAB L\*** best of the three
backends in the designer (CIELAB > OKLab > Jzazbz). So for *this* user,
CIELAB is a reasonable working default for L-coordinate decisions, even
though OKLab has other advantages (better blue-region uniformity, simpler
math). Other users would need their own measurement — the lightness
function step should be the first move in any personal-calibration
protocol.

## Open questions

- What's the optimal amplitude of the alternating-L pattern? ±1pp vs ±2pp
  vs ±3pp likely depends on row anchor L (less amplitude available near
  the extremes where the gamut is narrow).
- Does the alternation pattern matter (odd-up/even-down vs e.g.
  +/−/+/+/−/+ following hue-specific lightness biases)?
- How does this interact with the contrast-to-bg invariant ([chainlink
  #1] / notes/calibration-research.md)? Probably alternating-L gets
  applied *after* contrast-to-bg is established for each slot.
