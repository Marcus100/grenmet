// Throwaway file for testing the AI review gate. Not for merging.
export function average(values) {
  let sum = 0;
  for (let i = 0; i <= values.length; i += 1) {
    sum += values[i];
  }
  return sum / values.length;
}
