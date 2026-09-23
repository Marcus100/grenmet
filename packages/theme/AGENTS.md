# @barrelsgd/theme — agent context

Brand-neutral display preferences: theme mode (light/dark/system), presets, layout, and fonts.

- `src/lib/`: `theme.ts` (mode and preset options), `preferences-*` (config, storage, store), cookie/local-storage helpers (`*.client.ts`), `server-actions.ts`, layout utils. `src/components/`: `preferences-provider.tsx`, `theme-boot.tsx` (prevents a flash of the wrong theme). `src/styles/presets/`: preset CSS.
- Consumer: gaa-admin.
- Stays brand-neutral: brand palettes come from the consuming app or `@barrelsgd/gms`. The brand preset is stored as `"default"` and labelled "Default". Never change a stored `value`: it would reset saved user preferences.
- Client-only modules end in `.client.ts`; don't import them from Server Components.
