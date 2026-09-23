export const MIN_PASSWORD_LENGTH = 12;

export type StrengthLabel = "Too short" | "Weak" | "Fair" | "Good" | "Strong";

export interface PasswordStrength {
  readonly label: StrengthLabel;
  /** 0 (too short) to 4 (strong). */
  readonly score: 0 | 1 | 2 | 3 | 4;
}

const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];

const LABELS: readonly StrengthLabel[] = [
  "Too short",
  "Weak",
  "Fair",
  "Good",
  "Strong",
];

// A guide for people, not a gate: the API enforces the 12-character minimum.
export function scorePassword(password: string): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { label: "Too short", score: 0 };
  }
  const variety = CHARACTER_CLASSES.filter((pattern) =>
    pattern.test(password)
  ).length;
  let score = 1;
  if (password.length >= 16) score += 1;
  if (variety >= 3) score += 1;
  if (variety === 4 || password.length >= 20) score += 1;
  const clamped = Math.min(score, 4) as PasswordStrength["score"];
  return { label: LABELS[clamped] as StrengthLabel, score: clamped };
}
