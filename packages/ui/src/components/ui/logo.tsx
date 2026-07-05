import { cn } from "@grenmet/ui/lib/utils";
import Image, { type StaticImageData } from "next/image";
import iconColor from "../../assets/logo/logo-icon-color.png";
import primaryWhite from "../../assets/logo/logo-primary-all-white.png";
import primaryNavy from "../../assets/logo/logo-primary-navy.png";
import submarkNavyBlue from "../../assets/logo/logo-submark-navy-blue.png";
import submarkWhite from "../../assets/logo/logo-submark-white.png";
import wordmarkNavy from "../../assets/logo/logo-wordmark-navy.png";
import wordmarkWhite from "../../assets/logo/logo-wordmark-white.png";

export type LogoVariant = "primary" | "submark" | "wordmark" | "icon";

interface LogoAsset {
  readonly dark: StaticImageData;
  readonly light: StaticImageData;
}

// Each variant pairs a dark-ink asset (for light surfaces) with a white asset
// (for dark surfaces). `icon` is full-colour and reads on either surface, so it
// uses the same asset for both.
const LOGO_ASSETS: Record<LogoVariant, LogoAsset> = {
  primary: { light: primaryNavy, dark: primaryWhite },
  submark: { light: submarkNavyBlue, dark: submarkWhite },
  wordmark: { light: wordmarkNavy, dark: wordmarkWhite },
  icon: { light: iconColor, dark: iconColor },
};

interface LogoProps {
  readonly alt?: string;
  /**
   * Size/layout classes. The caller must constrain the size — e.g.
   * `className="h-7 w-auto"` for a lockup, `className="size-7"` for the icon.
   */
  readonly className?: string;
  readonly priority?: boolean;
  readonly sizes?: string;
  /** Which lockup to render. Defaults to the horizontal `primary` lockup. */
  readonly variant?: LogoVariant;
}

/**
 * Grenada Meteorological Service brand mark. Theme-aware: on dark surfaces the
 * white asset is shown via the `dark` class variant, with no client JS and no
 * hydration flash (both images render server-side; CSS hides the wrong one).
 */
export function Logo({
  variant = "primary",
  className,
  alt = "Grenada Meteorological Service",
  priority,
  sizes,
}: LogoProps) {
  const { light, dark } = LOGO_ASSETS[variant];

  if (light === dark) {
    return (
      <Image
        alt={alt}
        className={className}
        priority={priority}
        sizes={sizes}
        src={light}
      />
    );
  }

  return (
    <>
      <Image
        alt={alt}
        className={cn("dark:hidden", className)}
        priority={priority}
        sizes={sizes}
        src={light}
      />
      <Image
        alt={alt}
        className={cn("hidden dark:block", className)}
        priority={priority}
        sizes={sizes}
        src={dark}
      />
    </>
  );
}
