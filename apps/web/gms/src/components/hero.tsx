export function Hero() {
  return (
    <div className="relative overflow-hidden bg-gm-blue px-10 pt-18 pb-38">
      <svg
        aria-hidden="true"
        className="absolute inset-0 block h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1440 420"
      >
        <title>Decorative wave pattern</title>
        <g
          className="stroke-gm-text-inverse"
          fill="none"
          strokeOpacity="0.16"
          strokeWidth="2"
        >
          <path d="M-60 300C180 250 300 120 560 130s360 150 620 96 340-130 400-150" />
          <path d="M-60 350C160 320 320 200 600 196s380 140 640 84 300-120 340-140" />
          <path d="M-60 240C140 180 280 60 520 66s400 160 660 110 300-140 340-160" />
        </g>
      </svg>
      <h1 className="relative font-bold text-gm-text-inverse text-heading-lg leading-heading-lg tracking-tight">
        Your spice weather
      </h1>
    </div>
  );
}
