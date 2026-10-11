/** The item at `index`; throws when absent so a test fails with a clear message. */
export function nth<T>(items: readonly T[], index = 0): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected an item at index ${index}`);
  }
  return item;
}
