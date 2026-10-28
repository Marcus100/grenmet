import { type ReactNode, useId } from "react";
import { Intro, IntroFooter } from "@/components/intro";
import { StarField } from "@/components/star-field";
import { ThemeToggle } from "@/components/theme-toggle";

function Timeline() {
  const id = useId();

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden lg:right-[calc(max(2rem,50%-38rem)+40rem)] lg:min-w-lg lg:overflow-visible">
      <svg
        aria-hidden="true"
        className="absolute top-0 left-[max(0px,calc(50%-18.125rem))] h-full w-1.5 lg:left-full lg:ml-1 xl:right-1 xl:left-auto xl:ml-0"
      >
        <defs>
          <pattern height="8" id={id} patternUnits="userSpaceOnUse" width="6">
            <path
              className="stroke-sky-900/10 xl:stroke-white/10 dark:stroke-white/10"
              d="M0 0H6M0 8H6"
              fill="none"
            />
          </pattern>
        </defs>
        <rect fill={`url(#${id})`} height="100%" width="100%" />
      </svg>
    </div>
  );
}

function Glow() {
  const id = useId();

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-gray-950 lg:right-[calc(max(2rem,50%-38rem)+40rem)] lg:min-w-lg">
      <svg
        aria-hidden="true"
        className="absolute -bottom-48 left-[-40%] h-320 w-[180%] lg:top-[-40%] lg:-right-40 lg:bottom-auto lg:left-auto lg:h-[180%] lg:w-7xl"
      >
        <defs>
          <radialGradient cx="100%" id={`${id}-desktop`}>
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.3)" />
            <stop offset="53.95%" stopColor="rgba(0, 71, 255, 0.09)" />
            <stop offset="100%" stopColor="rgba(10, 14, 23, 0)" />
          </radialGradient>
          <radialGradient cy="100%" id={`${id}-mobile`}>
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.3)" />
            <stop offset="53.95%" stopColor="rgba(0, 71, 255, 0.09)" />
            <stop offset="100%" stopColor="rgba(10, 14, 23, 0)" />
          </radialGradient>
        </defs>
        <rect
          className="hidden lg:block"
          fill={`url(#${id}-desktop)`}
          height="100%"
          width="100%"
        />
        <rect
          className="lg:hidden"
          fill={`url(#${id}-mobile)`}
          height="100%"
          width="100%"
        />
      </svg>
      <div className="absolute inset-x-0 right-0 bottom-0 h-px bg-white mix-blend-overlay lg:top-0 lg:left-auto lg:h-auto lg:w-px" />
    </div>
  );
}

function FixedSidebar({
  main,
  footer,
}: {
  main: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex-none overflow-hidden px-6 lg:pointer-events-none lg:fixed lg:inset-0 lg:z-40 lg:flex lg:px-0">
      <Glow />
      <div className="relative flex w-full lg:pointer-events-auto lg:mr-[calc(max(2rem,50%-38rem)+40rem)] lg:min-w-lg lg:overflow-y-auto lg:overflow-x-hidden lg:pl-[max(4rem,calc(50%-38rem))]">
        <div className="mx-auto max-w-lg lg:mx-0 lg:flex lg:w-96 lg:max-w-none lg:flex-col lg:before:flex-1 lg:before:pt-6">
          <div className="pt-20 pb-16 sm:pt-32 sm:pb-20 lg:py-20">
            <div className="relative">
              <StarField className="top-14 -right-44" />
              {main}
            </div>
          </div>
          <div className="flex flex-1 items-end justify-center pb-4 lg:justify-start lg:pb-6">
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FixedSidebar footer={<IntroFooter />} main={<Intro />} />
      <ThemeToggle />
      <div className="relative flex-auto">
        <Timeline />
        <main className="space-y-20 py-20 sm:space-y-32 sm:py-32">
          {children}
        </main>
      </div>
    </>
  );
}
