"use client";

import Link from "next/link";
import {
  type ComponentProps,
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/utils";

/**
 * The hero's selected tab (`now` or a `YYYY-MM-DD` day), held on the client so
 * switching tabs is instant: every tab's panel is already on the page, so no
 * server round trip is needed. Each tab stays a real link, so opening one in a
 * new tab, sharing it, or loading it without JavaScript still shows that day.
 */
interface HeroSelection {
  select: (slug: string, href: string) => void;
  selected: string;
}

const HeroSelectionContext = createContext<HeroSelection | null>(null);

function useHeroSelection(): HeroSelection {
  const context = useContext(HeroSelectionContext);
  if (!context) {
    throw new Error("Hero tabs must be inside a HeroSelectionProvider");
  }
  return context;
}

export function HeroSelectionProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** The tab the server rendered for this URL. */
  initial: string;
}) {
  const [selected, setSelected] = useState(initial);
  const [seen, setSeen] = useState(initial);
  // A navigation that lands on a different day resets the selection.
  if (initial !== seen) {
    setSeen(initial);
    setSelected(initial);
  }
  const select = useCallback((slug: string, href: string) => {
    setSelected(slug);
    // Keep the address bar and shared links in step without a navigation.
    window.history.replaceState(null, "", href);
  }, []);
  const value = useMemo(() => ({ select, selected }), [select, selected]);
  return (
    <HeroSelectionContext.Provider value={value}>
      {children}
    </HeroSelectionContext.Provider>
  );
}

type TabLinkProps = Omit<
  ComponentProps<typeof Link>,
  "aria-current" | "className" | "href" | "onClick" | "scroll"
> & {
  children: ReactNode;
  className: string;
  /** Added to `className` while this tab is selected. */
  currentClassName: string;
  href: string;
  /** Added to `className` while another tab is selected. */
  idleClassName: string;
  slug: string;
};

/** A tab link that selects its panel on a plain click and otherwise behaves as a link. */
export function TabLink({
  children,
  className,
  currentClassName,
  href,
  idleClassName,
  slug,
  ...rest
}: TabLinkProps) {
  const { select, selected } = useHeroSelection();
  const current = selected === slug;

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const modified =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || event.button !== 0 || modified) {
      return;
    }
    event.preventDefault();
    select(slug, href);
  }

  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={cn(className, current ? currentClassName : idleClassName)}
      href={href}
      onClick={onClick}
      scroll={false}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** Shows the panel for the selected tab, falling back to Now. */
export function ByTab({ panels }: { panels: Record<string, ReactNode> }) {
  const { selected } = useHeroSelection();
  return <>{panels[selected] ?? panels.now}</>;
}
