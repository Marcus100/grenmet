interface UpdateBannerProps {
  readonly onReload: () => void;
}

/**
 * A new version of the scanner is ready. It never reloads by itself: a reload
 * stops the camera, so staff choose a quiet moment.
 */
export function UpdateBanner({ onReload }: UpdateBannerProps) {
  return (
    <div
      className="bg-px-surface border-px-rule fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-2xl border p-3"
      role="status"
    >
      <p className="text-sm">A new version of the scanner is ready.</p>
      <button
        className="bg-px-green text-px-ink focus-visible:outline-px-paper min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={onReload}
        type="button"
      >
        Reload
      </button>
    </div>
  );
}
