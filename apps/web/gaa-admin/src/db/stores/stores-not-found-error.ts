/** The record does not exist or is outside the caller's reach. */
export class StoresNotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}
