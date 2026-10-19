/**
 * Feels-like temperature (NWS heat index, Rothfusz regression) until the
 * observation feed supplies one. Below 27 °C it is the air temperature.
 */
export function feelsLike(celsius: number, humidity: number | null): number {
  if (humidity === null || celsius < 27) return celsius;
  const t = (celsius * 9) / 5 + 32;
  const r = humidity;
  const f =
    -42.379 +
    2.049_015_23 * t +
    10.143_331_27 * r -
    0.224_755_41 * t * r -
    0.006_837_83 * t * t -
    0.054_817_17 * r * r +
    0.001_228_74 * t * t * r +
    0.000_852_82 * t * r * r -
    0.000_001_99 * t * t * r * r;
  return ((f - 32) * 5) / 9;
}
