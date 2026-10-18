"use client";

// Last-resort boundary: replaces the root layout, so it renders its own
// document and cannot rely on app styles.
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <h1>Alert service temporarily unreachable</h1>
        <p>
          We cannot confirm the current alert status. Check Grenada
          Meteorological Service announcements on radio and TV.
        </p>
        <button onClick={() => retry()} type="button">
          Try again
        </button>
      </body>
    </html>
  );
}
