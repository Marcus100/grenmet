import { holdLengthText } from "@barrelsgd/bookings-web/lib/booking-policy";

/**
 * How long a deposit holds a booking's time, for payment-link and transfer
 * deposits (`deposit_hold_minutes`). Null is the default (30 minutes). The API
 * keeps online card checkouts at 120 minutes at most, whatever is saved here.
 */
export const DEFAULT_HOLD_MINUTES = 30;
export const DEPOSIT_HOLD_MAX_MINUTES = 10_080;

/** The select's value for "use the default", which is saved as null. */
export const DEFAULT_HOLD_VALUE = "default";

/** The sensible choices offered in Studio Settings, in minutes. */
export const DEPOSIT_HOLD_CHOICES: readonly number[] = [
  30, 120, 720, 1440, 2880, 4320, 10_080,
];

export interface HoldOption {
  label: string;
  value: string;
}

/** The select's value for a saved hold: "default" for null, else the minutes. */
export function holdValue(minutes: number | null): string {
  return minutes === null ? DEFAULT_HOLD_VALUE : String(minutes);
}

/**
 * The options for the hold select. A saved value outside the choices (set by
 * another tool) is kept as its own option, so opening the page never changes it.
 */
export function holdOptions(saved: number | null): HoldOption[] {
  const options: HoldOption[] = [
    {
      label: `Default (${holdLengthText(DEFAULT_HOLD_MINUTES)})`,
      value: DEFAULT_HOLD_VALUE,
    },
    ...DEPOSIT_HOLD_CHOICES.map((minutes) => ({
      label: holdLengthText(minutes),
      value: String(minutes),
    })),
  ];
  if (saved !== null && !DEPOSIT_HOLD_CHOICES.includes(saved)) {
    options.push({ label: holdLengthText(saved), value: String(saved) });
  }
  return options;
}

export type HoldParse =
  | { ok: true; value: number | null }
  | { ok: false; message: string };

export const HOLD_INVALID =
  "Choose how long to hold a booking for its deposit.";

const WHOLE_NUMBER = /^\d+$/u;

/** The saved value for a form's select value: default is null, else whole minutes. */
export function depositHoldField(text: string): HoldParse {
  if (text === DEFAULT_HOLD_VALUE || text.trim() === "") {
    return { ok: true, value: null };
  }
  const minutes = Number(text);
  if (
    !(
      WHOLE_NUMBER.test(text.trim()) &&
      Number.isInteger(minutes) &&
      minutes >= 1 &&
      minutes <= DEPOSIT_HOLD_MAX_MINUTES
    )
  ) {
    return { ok: false, message: HOLD_INVALID };
  }
  return { ok: true, value: minutes };
}
