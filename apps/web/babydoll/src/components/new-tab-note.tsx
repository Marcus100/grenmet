/**
 * Every Book link opens the booking page in a new tab. Screen reader users
 * hear that here; sighted visitors see nothing (the class is visually hidden).
 * The space is its own text node so the link's name reads "Book me (opens...)".
 */
export function NewTabNote() {
  return (
    <>
      {" "}
      <span className="sr-only">(opens in a new tab)</span>
    </>
  );
}
