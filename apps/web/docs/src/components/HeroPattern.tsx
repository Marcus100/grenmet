import { GridPattern } from "@/components/GridPattern";

export function HeroPattern() {
  return (
    <div className="absolute inset-0 -z-10 mx-0 max-w-none overflow-hidden">
      <div className="absolute top-0 left-1/2 -ml-152 h-100 w-325 dark:mask-[linear-gradient(white,transparent)]">
        <div className="from-gm-sky to-gm-lime dark:from-gm-sky/30 dark:to-gm-lime/30 absolute inset-0 bg-linear-to-r mask-[radial-gradient(farthest-side_at_top,white,transparent)] opacity-40 dark:opacity-100">
          <GridPattern
            className="absolute inset-x-0 inset-y-[-50%] h-[200%] w-full skew-y-[-18deg] fill-black/40 stroke-black/50 mix-blend-overlay dark:fill-white/2.5 dark:stroke-white/5"
            height={56}
            squares={[
              [4, 3],
              [2, 1],
              [7, 3],
              [10, 6],
            ]}
            width={72}
            x={-12}
            y={4}
          />
        </div>
        <svg
          aria-hidden="true"
          className="absolute top-0 left-1/2 -ml-76 w-278.25 fill-white blur-[26px] dark:hidden"
          viewBox="0 0 1113 440"
        >
          <path d="M.016 439.5s-9.5-300 434-300S882.516 20 882.516 20V0h230.004v439.5H.016Z" />
        </svg>
      </div>
    </div>
  );
}
