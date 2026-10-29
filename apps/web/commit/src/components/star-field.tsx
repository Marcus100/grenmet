import { cn } from "@barrelsgd/ui/lib/utils";

// Static star field from the Commit template. The template animated it with
// `motion`; here each star twinkles with the CSS `twinkle` keyframes in
// tailwind.css (turned off under prefers-reduced-motion), so no animation
// library and no client JavaScript.

type Star = [x: number, y: number, dim?: boolean, blur?: boolean];

const stars: Star[] = [
  [4, 4, true, true],
  [4, 44, true],
  [36, 22],
  [50, 146, true, true],
  [64, 43, true, true],
  [76, 30, true],
  [101, 116],
  [140, 36, true],
  [149, 134],
  [162, 74, true],
  [171, 96, true, true],
  [210, 56, true, true],
  [235, 90],
  [275, 82, true, true],
  [306, 6],
  [307, 64, true, true],
  [380, 68, true],
  [380, 108, true, true],
  [391, 148, true, true],
  [405, 18, true],
  [412, 86, true, true],
  [426, 210, true, true],
  [427, 56, true, true],
  [538, 138],
  [563, 88, true, true],
  [611, 154, true, true],
  [637, 150],
  [651, 146, true],
  [682, 70, true, true],
  [683, 128],
  [781, 82, true, true],
  [785, 158, true],
  [832, 146, true, true],
  [852, 89],
];

const constellations: Star[][] = [
  [
    [247, 103],
    [261, 86],
    [307, 104],
    [357, 36],
  ],
  [
    [586, 120],
    [516, 100],
    [491, 62],
    [440, 107],
    [477, 180],
    [516, 100],
  ],
  [
    [733, 100],
    [803, 120],
    [879, 113],
    [823, 164],
    [803, 120],
  ],
];

const BLUR_ID = "star-field-blur";

function StarPoint({
  index,
  point: [cx, cy, dim, blur],
}: {
  index: number;
  point: Star;
}) {
  return (
    <circle
      className={cn("star", dim ? "star-dim" : "star-bright")}
      cx={cx}
      cy={cy}
      filter={blur ? `url(#${BLUR_ID})` : undefined}
      r={1}
      style={{
        transformOrigin: `${cx / 16}rem ${cy / 16}rem`,
        // Deterministic spread so server and client render the same markup.
        animationDelay: `${(index * 0.37) % 2}s`,
        animationDuration: `${2 + ((index * 0.61) % 2)}s`,
      }}
    />
  );
}

function uniquePoints(points: Star[]): Star[] {
  return points.filter(
    (point, index) =>
      points.findIndex((p) => String(p) === String(point)) === index
  );
}

export function StarField({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute w-220.25 origin-top-right rotate-30 overflow-visible opacity-70",
        className
      )}
      fill="white"
      viewBox="0 0 881 211"
    >
      <defs>
        <filter id={BLUR_ID}>
          <feGaussianBlur in="SourceGraphic" stdDeviation=".5" />
        </filter>
      </defs>
      {constellations.map((points) => (
        <g key={String(points[0])}>
          <path
            d={`M ${points.join("L")}`}
            fill={
              uniquePoints(points).length === points.length
                ? "transparent"
                : "rgb(255 255 255 / 0.02)"
            }
            stroke="white"
            strokeOpacity="0.2"
          />
          {uniquePoints(points).map((point, index) => (
            <StarPoint index={index} key={String(point)} point={point} />
          ))}
        </g>
      ))}
      {stars.map((point, index) => (
        <StarPoint index={index} key={String(point)} point={point} />
      ))}
    </svg>
  );
}
