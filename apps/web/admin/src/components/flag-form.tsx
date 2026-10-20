"use client";

import type { FeatureFlagAdmin } from "@barrelsgd/api-client";
import { useActionState } from "react";
import { saveFlagAction } from "@/app/(console)/flags/actions";
import {
  FLAG_ENVIRONMENTS,
  type FlagFormState,
  instantToDate,
  MAX_FLAG_KEY,
} from "@/lib/flag-form";

const FIELD = "rounded-md border bg-background px-2.5 py-1.5";
const BUTTON = "rounded-md border px-3 py-1.5 text-sm hover:bg-muted";

const NO_STATE: FlagFormState = {};

function single(state: FlagFormState, name: string, fallback: string): string {
  const value = state.values?.[name];
  return typeof value === "string" ? value : fallback;
}

function checked(state: FlagFormState, name: string, fallback: boolean) {
  return state.values ? state.values[name] === "on" : fallback;
}

function chosenEnvironments(
  state: FlagFormState,
  flag: FeatureFlagAdmin | undefined
): string[] {
  const value = state.values?.environments;
  if (Array.isArray(value)) return value;
  return state.values ? [] : (flag?.audience.environments ?? []);
}

/**
 * Create (no `flag`) or edit form. The API's rejection text (for example the
 * success-metric 422) comes back through the action state, and what was typed
 * is kept because React resets uncontrolled fields after an action.
 */
export function FlagForm({ flag }: { flag?: FeatureFlagAdmin }) {
  const [state, action, pending] = useActionState(saveFlagAction, NO_STATE);
  const audience = flag?.audience;
  const environments = chosenEnvironments(state, flag);
  return (
    <form action={action} className="mt-3 grid max-w-md gap-3">
      {state.message ? (
        <p className="rounded-md border px-3 py-2 text-sm" role="alert">
          Problem: {state.message}
        </p>
      ) : null}
      {flag ? (
        <input name="flag_id" type="hidden" value={flag.id} />
      ) : (
        <>
          <label className="grid gap-1 text-sm">
            Key
            <input
              className={`${FIELD} font-mono`}
              defaultValue={single(state, "key", "")}
              maxLength={MAX_FLAG_KEY}
              name="key"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </label>
          <p className="text-xs" role="note">
            The key is permanent. Use lower-case letters, digits and hyphens.
          </p>
        </>
      )}
      <label className="grid gap-1 text-sm">
        Description
        <textarea
          className={FIELD}
          defaultValue={single(state, "description", flag?.description ?? "")}
          maxLength={2000}
          name="description"
          rows={2}
        />
      </label>
      <fieldset className="grid gap-1 text-sm">
        <legend>Switches</legend>
        <label className="flex items-center gap-2">
          <input
            defaultChecked={checked(state, "enabled", flag?.enabled ?? false)}
            name="enabled"
            type="checkbox"
          />
          Enabled
        </label>
        <label className="flex items-center gap-2">
          <input
            defaultChecked={checked(state, "exposed", flag?.exposed ?? false)}
            name="exposed"
            type="checkbox"
          />
          Exposed (visible to client apps)
        </label>
      </fieldset>
      <label className="grid gap-1 text-sm">
        Success metric (required to enable outside local)
        <textarea
          className={FIELD}
          defaultValue={single(
            state,
            "success_metric",
            flag?.success_metric ?? ""
          )}
          maxLength={4000}
          name="success_metric"
          rows={2}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Owner
        <input
          className={FIELD}
          defaultValue={single(state, "owner", flag?.owner ?? "")}
          maxLength={255}
          name="owner"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          Review by
          <input
            className={FIELD}
            defaultValue={single(
              state,
              "review_by",
              instantToDate(flag?.review_by)
            )}
            name="review_by"
            type="date"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Expires (flag turns off)
          <input
            className={FIELD}
            defaultValue={single(
              state,
              "expires_at",
              instantToDate(flag?.expires_at)
            )}
            name="expires_at"
            type="date"
          />
        </label>
      </div>
      <fieldset className="grid gap-2 rounded-md border p-3 text-sm">
        <legend className="px-1">Audience</legend>
        <p className="text-muted-foreground text-xs">
          Anyone matching a rule is included. With no rule, nobody is.
        </p>
        <label className="flex items-center gap-2">
          <input
            defaultChecked={checked(
              state,
              "everyone",
              audience?.everyone ?? false
            )}
            name="everyone"
            type="checkbox"
          />
          Everyone
        </label>
        <label className="grid gap-1">
          Organisation ids (comma or space separated)
          <textarea
            className={`${FIELD} font-mono`}
            defaultValue={single(
              state,
              "organisation_ids",
              (audience?.organisation_ids ?? []).join(", ")
            )}
            name="organisation_ids"
            rows={2}
          />
        </label>
        <label className="grid gap-1">
          User ids (UUIDs, comma or space separated)
          <textarea
            className={`${FIELD} font-mono`}
            defaultValue={single(
              state,
              "user_ids",
              (audience?.user_ids ?? []).join(", ")
            )}
            name="user_ids"
            rows={2}
          />
        </label>
        <label className="grid gap-1">
          Percentage rollout (0 to 100, empty for none)
          <input
            className={FIELD}
            defaultValue={single(
              state,
              "percentage",
              audience?.percentage?.toString() ?? ""
            )}
            inputMode="numeric"
            name="percentage"
          />
        </label>
        <fieldset className="grid gap-1">
          <legend>Only in environments (none ticked means any)</legend>
          {FLAG_ENVIRONMENTS.map((env) => (
            <label className="flex items-center gap-2" key={env}>
              <input
                defaultChecked={environments.includes(env)}
                name="environments"
                type="checkbox"
                value={env}
              />
              {env}
            </label>
          ))}
        </fieldset>
      </fieldset>
      <p className="rounded-md border px-3 py-2 text-xs" role="note">
        Other API workers cache flags for up to 30 seconds, so a change can take
        that long to reach every worker.
      </p>
      <div>
        <button className={BUTTON} disabled={pending} type="submit">
          {flag ? "Save flag" : "Create flag"}
        </button>
      </div>
    </form>
  );
}
