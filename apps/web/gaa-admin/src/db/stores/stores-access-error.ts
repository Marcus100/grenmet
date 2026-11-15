/** The signed-in user has no stores permission or employment record. */
export class StoresAccessError extends Error {
  constructor() {
    super("Stores access needed");
  }
}
