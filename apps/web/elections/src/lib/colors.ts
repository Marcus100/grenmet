/** Fill for a lean: NDC gold or NNP green, stronger the further from even. */
export function leanFill(lean: number): string {
  const strength = Math.round(12 + 88 * Math.min(1, Math.abs(lean) / 0.25));
  return `color-mix(in oklab, var(--el-${lean > 0 ? "ndc" : "nnp"}) ${strength}%, var(--el-div-mid))`;
}

/** Fill for a Yes share: Yes blue above half, No magenta below, full at ±40 points. */
export function yesFill(yesShare: number): string {
  const x = Math.max(-1, Math.min(1, (yesShare - 0.5) / 0.4));
  const strength = Math.round(Math.abs(x) * 100);
  return `color-mix(in oklab, var(--el-${x >= 0 ? "yes" : "no"}) ${strength}%, var(--el-div-mid))`;
}
