const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "1 August 2026 to 31 August 2026", or one end when only one is set. */
export function reportPeriod(start?: string | null, end?: string | null) {
  const dates = [start, end]
    .filter((value): value is string => Boolean(value))
    .map((value) => DAY.format(new Date(value)));
  return dates.join(" to ");
}

/** "PDF, 1.2 MB" from the uploaded file. */
export function fileLabel(file: { filename: string; filesize: number | null }) {
  const type = file.filename.split(".").pop()?.toUpperCase() ?? "file";
  if (!file.filesize) return type;
  const size =
    file.filesize >= 1_000_000
      ? `${(file.filesize / 1_000_000).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.filesize / 1000))} KB`;
  return `${type}, ${size}`;
}
