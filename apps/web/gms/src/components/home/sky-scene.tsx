import { cn } from "@/lib/utils";
import type { WeatherCondition } from "@/lib/weather-icons";

const RAYS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4;
  const at = (radius: number) => ({
    x: 60 + radius * Math.cos(angle),
    y: 44 + radius * Math.sin(angle),
  });
  return { from: at(25), to: at(33) };
});

function Sun({ big }: { big: boolean }) {
  return (
    <g className="text-gm-lime">
      {big && (
        <g stroke="currentColor" strokeLinecap="round" strokeWidth={4}>
          {RAYS.map(({ from, to }) => (
            <line
              key={`${from.x}-${from.y}`}
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          ))}
        </g>
      )}
      <circle
        cx={big ? 60 : 78}
        cy={big ? 44 : 30}
        fill="currentColor"
        r={big ? 18 : 15}
      />
    </g>
  );
}

function Cloud() {
  return (
    <g className="text-gm-text-inverse" fill="currentColor">
      <circle cx={42} cy={56} r={14} />
      <circle cx={60} cy={46} r={19} />
      <circle cx={80} cy={58} r={12} />
      <rect height={18} rx={9} width={66} x={30} y={54} />
    </g>
  );
}

function Rain() {
  return (
    <g
      className="text-gm-sky"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={3}
    >
      {[40, 54, 68, 82].map((x) => (
        <line key={x} x1={x} x2={x - 3} y1={80} y2={90} />
      ))}
    </g>
  );
}

/**
 * A small sky picture for the Now and day summaries: sun, sun and cloud,
 * cloud, or cloud with rain. Decorative; the words beside it carry the sky.
 */
export function SkyScene({
  className,
  sky,
}: {
  className?: string;
  sky: WeatherCondition;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-auto w-full shrink-0", className)}
      viewBox="0 0 120 96"
    >
      {sky === "sunny" && <Sun big />}
      {sky === "partly-cloudy" && <Sun big={false} />}
      {sky !== "sunny" && <Cloud />}
      {sky === "showers" && <Rain />}
    </svg>
  );
}
