import { IconLink } from "@/components/icon-link";
import { StarField } from "@/components/star-field";

export default function NotFound() {
  return (
    <div className="relative isolate flex flex-auto flex-col items-center justify-center overflow-hidden bg-gray-950 text-center">
      <svg
        aria-hidden="true"
        className="absolute top-[-10vh] left-1/2 -z-10 h-[120vh] w-[120vw] min-w-240 -translate-x-1/2"
      >
        <defs>
          <radialGradient cy="0%" id="gradient">
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.3)" />
            <stop offset="53.95%" stopColor="rgba(0, 71, 255, 0.09)" />
            <stop offset="100%" stopColor="rgba(10, 14, 23, 0)" />
          </radialGradient>
        </defs>
        <rect fill="url(#gradient)" height="100%" width="100%" />
      </svg>
      <StarField className="sm:-mt-16" />

      <p className="font-display text-4xl/tight font-light text-white">404</p>
      <h1 className="font-display mt-4 text-xl/8 font-semibold text-white">
        Page not found
      </h1>
      <p className="mt-2 text-sm/6 text-gray-300">
        Sorry, we couldn’t find the page you’re looking for.
      </p>
      <IconLink className="mt-4" href="/">
        Go back home
      </IconLink>
    </div>
  );
}
