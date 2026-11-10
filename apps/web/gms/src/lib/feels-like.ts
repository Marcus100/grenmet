/**
 * Feels-like temperature: the heat index exactly as MetPy's `heat_index`
 * computes
 * it from 80 °F, following the NWS method (Rothfusz regression with the NWS adjustments for very dry air
 * at 80 to 112 °F and humid air at 80 to 87 °F). Below 80 °F the heat index does
 * not apply and the feels-like is the air temperature. Checked against MetPy in
 * `feels-like.test.ts`. A missing or unreadable humidity gives the air
 * temperature.
 */
const HEAT_INDEX_MIN_F = 80;
const DRY_ADJUST_MAX_F = 112;
const DRY_ADJUST_RH = 13;
const HUMID_ADJUST_MAX_F = 87;
const HUMID_ADJUST_RH = 85;
const DRY_ADJUST_CENTRE_F = 95;
const DRY_ADJUST_SPAN_F = 17;
// MetPy uses the simple (Steadman) formula while it reads below 79 F, and the
// regression from there on. Matching it keeps the fixture test exact.
const SIMPLE_FORMULA_MAX_F = 79;

export function feelsLike(celsius: number, humidity: number | null): number {
  const t = (celsius * 9) / 5 + 32;
  if (
    humidity === null ||
    !Number.isFinite(humidity) ||
    !Number.isFinite(celsius) ||
    t < HEAT_INDEX_MIN_F
  ) {
    return celsius;
  }
  const r = humidity;
  const simple = 0.5 * (t + 61 + (t - 68) * 1.2 + r * 0.094);
  let f =
    simple < SIMPLE_FORMULA_MAX_F
      ? simple
      : -42.379 +
        2.049_015_23 * t +
        10.143_331_27 * r -
        0.224_755_41 * t * r -
        0.006_837_83 * t * t -
        0.054_817_17 * r * r +
        0.001_228_74 * t * t * r +
        0.000_852_82 * t * r * r -
        0.000_001_99 * t * t * r * r;
  if (r <= DRY_ADJUST_RH && t <= DRY_ADJUST_MAX_F) {
    const spread = Math.sqrt(
      (DRY_ADJUST_SPAN_F - Math.abs(t - DRY_ADJUST_CENTRE_F)) /
        DRY_ADJUST_SPAN_F
    );
    f -= ((DRY_ADJUST_RH - r) / 4) * spread;
  }
  if (r > HUMID_ADJUST_RH && t <= HUMID_ADJUST_MAX_F) {
    f += 0.02 * (r - HUMID_ADJUST_RH) * (HUMID_ADJUST_MAX_F - t);
  }
  return ((f - 32) * 5) / 9;
}
