import { CloseButton } from "@headlessui/react";
import { clsx } from "cn";
import { motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import {
  MobileNavigation,
  useIsInsideMobileNavigation,
  useMobileNavigationStore,
} from "@/components/MobileNavigation";
import { getNavigationSection } from "@/components/Navigation";
import { MobileSearch, Search } from "@/components/Search";

function TopLevelNavItem({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        className="text-sm/5 text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        href={href}
      >
        {children}
      </Link>
    </li>
  );
}

export function Header({
  className,
  catalogue = false,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof motion.div> & { catalogue?: boolean }) {
  const { isOpen: mobileNavIsOpen } = useMobileNavigationStore();
  const isInsideMobileNavigation = useIsInsideMobileNavigation();
  const showEmergencyContacts =
    getNavigationSection(usePathname()) === "hurricane";

  const { scrollY } = useScroll();
  const bgOpacityLight = useTransform(scrollY, [0, 72], ["50%", "90%"]);

  return (
    <motion.div
      {...props}
      className={clsx(
        className,
        "fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-6 px-4 transition sm:px-6 lg:z-30 lg:px-8",
        !catalogue && "lg:left-72 xl:left-80",
        !isInsideMobileNavigation && "backdrop-blur-xs",
        isInsideMobileNavigation ? "bg-white" : "bg-white/(--bg-opacity-light)"
      )}
      ref={ref}
      style={
        {
          "--bg-opacity-light": bgOpacityLight,
        } as React.CSSProperties
      }
    >
      <div
        className={clsx(
          "absolute inset-x-0 top-full h-px transition",
          (isInsideMobileNavigation || !mobileNavIsOpen) &&
            "bg-zinc-900/7.5 dark:bg-white/7.5"
        )}
      />
      <Search />
      <div
        className={clsx("flex items-center gap-5", !catalogue && "lg:hidden")}
      >
        <MobileNavigation />
        <CloseButton aria-label="Home" as={Link} href="/">
          <Logo className="h-6" />
        </CloseButton>
      </div>
      <div className="flex items-center gap-5">
        <nav className="hidden md:block">
          <ul className="flex items-center gap-8">
            <TopLevelNavItem href="/">All documents</TopLevelNavItem>
            <TopLevelNavItem href="/quickstart">Staff guide</TopLevelNavItem>
            <TopLevelNavItem href="/hurricane-plan">
              Hurricane plan
            </TopLevelNavItem>
          </ul>
        </nav>
        <div className="hidden md:block md:h-5 md:w-px md:bg-zinc-900/10 md:dark:bg-white/15" />
        <MobileSearch />
        {showEmergencyContacts && (
          <div className="hidden min-[416px]:contents">
            <Button href="/appendix/emergency-personnel">
              Emergency contacts
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
