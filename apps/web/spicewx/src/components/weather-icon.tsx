import { cn } from "@/lib/utils";

interface WeatherIconProps {
  className?: string;
  condition:
    | "sunny"
    | "partly-cloudy"
    | "cloudy"
    | "rain"
    | "storm"
    | "clear-night";
}

export function WeatherIcon({ condition, className }: WeatherIconProps) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {condition === "sunny" && <SunIcon />}
      {condition === "partly-cloudy" && <PartlyCloudyIcon />}
      {condition === "cloudy" && <CloudyIcon />}
      {condition === "rain" && <RainIcon />}
      {condition === "storm" && <StormIcon />}
      {condition === "clear-night" && <ClearNightIcon />}
    </div>
  );
}

function SunIcon() {
  const rays = [
    0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270,
    292.5, 315, 337.5,
  ];
  return (
    <div className="relative flex size-28 items-center justify-center">
      {/* Glow */}
      <div className="absolute size-20 animate-pulse rounded-full bg-amber-300/30 blur-xl" />
      {/* Rotating rays */}
      <svg
        aria-hidden="true"
        className="absolute size-28"
        style={{ animation: "spin 24s linear infinite" }}
        viewBox="0 0 112 112"
      >
        {rays.map((angle) => (
          <rect
            fill="#f59e0b"
            height="14"
            key={angle}
            rx="2.5"
            transform={`rotate(${angle} 56 56)`}
            width="5"
            x="53.5"
            y="4"
          />
        ))}
      </svg>
      {/* Sun body */}
      <div className="relative size-16 rounded-full bg-linear-to-br from-amber-300 via-amber-400 to-amber-500 shadow-amber-400/60 shadow-lg" />
    </div>
  );
}

function PartlyCloudyIcon() {
  return (
    <div className="relative flex size-28 items-center justify-center">
      {/* Sun behind */}
      <div
        className="absolute top-2 right-2"
        style={{ animation: "spin 24s linear infinite" }}
      >
        <svg aria-hidden="true" className="size-14" viewBox="0 0 64 64">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <rect
              fill="#f59e0b"
              height="10"
              key={angle}
              rx="2"
              transform={`rotate(${angle} 32 32)`}
              width="4"
              x="30"
              y="2"
            />
          ))}
          <circle cx="32" cy="32" fill="#fbbf24" r="12" />
        </svg>
      </div>
      {/* Cloud */}
      <div
        className="absolute bottom-1 left-0"
        style={{ animation: "float 4s ease-in-out infinite" }}
      >
        <CloudShape size="lg" />
      </div>
    </div>
  );
}

function CloudyIcon() {
  return (
    <div className="relative flex size-28 items-center justify-center">
      <div
        className="absolute top-4 right-4 opacity-60"
        style={{ animation: "float 4s ease-in-out 0.5s infinite" }}
      >
        <CloudShape color="fill-slate-300" size="sm" />
      </div>
      <div style={{ animation: "float 4s ease-in-out infinite" }}>
        <CloudShape color="fill-slate-400" size="lg" />
      </div>
    </div>
  );
}

function RainIcon() {
  return (
    <div className="relative flex size-28 items-center justify-center">
      {/* Cloud */}
      <div className="absolute top-3">
        <CloudShape color="fill-slate-500" size="lg" />
      </div>
      {/* Rain drops */}
      <svg
        aria-hidden="true"
        className="absolute bottom-2 size-20"
        viewBox="0 0 80 40"
      >
        {[10, 22, 34, 46, 58, 70, 16, 28, 40, 52, 64].map((x, i) => (
          <line
            key={x}
            stroke="#60a5fa"
            strokeLinecap="round"
            strokeWidth="2.5"
            style={{
              animation: "rain 1.4s linear infinite",
              animationDelay: `${(i * 0.13) % 1.4}s`,
            }}
            x1={x}
            x2={x - 4}
            y1="0"
            y2="16"
          />
        ))}
      </svg>
    </div>
  );
}

function StormIcon() {
  return (
    <div className="relative flex size-28 items-center justify-center">
      <div className="absolute top-2">
        <CloudShape color="fill-slate-600" size="lg" />
      </div>
      <svg
        aria-hidden="true"
        className="absolute bottom-1 size-16"
        viewBox="0 0 60 50"
      >
        {/* Rain */}
        {[8, 22, 36, 50].map((x, i) => (
          <line
            key={x}
            stroke="#60a5fa"
            strokeLinecap="round"
            strokeWidth="2"
            style={{
              animation: "rain 1.4s linear infinite",
              animationDelay: `${i * 0.15}s`,
            }}
            x1={x}
            x2={x - 3}
            y1="0"
            y2="12"
          />
        ))}
        {/* Lightning bolt */}
        <polyline
          fill="none"
          points="34,4 26,24 33,24 22,44"
          stroke="#fbbf24"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
    </div>
  );
}

function ClearNightIcon() {
  return (
    <div className="relative flex size-28 items-center justify-center">
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Stars */}
        {[
          [20, 15],
          [75, 20],
          [60, 70],
          [15, 65],
          [85, 55],
        ].map(([cx, cy], i) => (
          <div
            className="absolute size-1 rounded-full bg-amber-200"
            key={`${cx}-${cy}`}
            style={{
              top: `${cy}%`,
              left: `${cx}%`,
              animation: `pulse ${1.5 + i * 0.3}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
      {/* Moon */}
      <svg aria-hidden="true" className="size-20" viewBox="0 0 80 80">
        <defs>
          <mask id="moon-mask">
            <rect fill="white" height="80" width="80" />
            <circle cx="50" cy="25" fill="black" r="22" />
          </mask>
        </defs>
        <circle cx="38" cy="42" fill="#fde68a" mask="url(#moon-mask)" r="24" />
      </svg>
    </div>
  );
}

interface CloudShapeProps {
  color?: string;
  size?: "sm" | "lg";
}

function CloudShape({ size = "lg", color = "fill-white" }: CloudShapeProps) {
  if (size === "sm") {
    return (
      <svg aria-hidden="true" className="h-auto w-16" viewBox="0 0 80 44">
        <path
          className={color}
          d="M64 36H16A16 16 0 0 1 16 4a14 14 0 0 1 13.7 11.1A12 12 0 1 1 52 28h12a8 8 0 0 1 0 8z"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="h-auto w-24" viewBox="0 0 110 60">
      <path
        className={color}
        d="M88 50H22A22 22 0 0 1 22 6a19 19 0 0 1 18.8 15.3A16 16 0 1 1 71 39h17a11 11 0 0 1 0 11z"
        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}
      />
    </svg>
  );
}

interface SmallWeatherIconProps {
  className?: string;
  condition: WeatherIconProps["condition"];
}

export function SmallWeatherIcon({
  condition,
  className,
}: SmallWeatherIconProps) {
  const icons: Record<WeatherIconProps["condition"], string> = {
    sunny: "☀️",
    "partly-cloudy": "⛅",
    cloudy: "☁️",
    rain: "🌧️",
    storm: "⛈️",
    "clear-night": "🌙",
  };
  return (
    <span
      aria-label={condition}
      className={cn("text-2xl", className)}
      role="img"
    >
      {icons[condition]}
    </span>
  );
}
