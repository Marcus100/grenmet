import {
  Briefcase,
  Church,
  Cpu,
  HeartPulse,
  type LucideIcon,
  Music,
  Palette,
  PartyPopper,
  Trophy,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import type { EventCategory } from "@/domain/types";

/**
 * Each category gets a flyer tone from the events palette and an icon. Tones
 * are AA pairings documented in docs/design/events.md.
 */
export const CATEGORY_STYLE: Record<
  EventCategory,
  { readonly icon: LucideIcon; readonly tone: string }
> = {
  fete: { icon: PartyPopper, tone: "bg-events-hibiscus text-white" },
  music: { icon: Music, tone: "bg-events-ink text-events-lime" },
  food: { icon: UtensilsCrossed, tone: "bg-events-lime text-events-ink" },
  sport: { icon: Trophy, tone: "bg-events-sea text-white" },
  business: { icon: Briefcase, tone: "bg-events-ink text-white" },
  tech: { icon: Cpu, tone: "bg-events-sea text-white" },
  culture: {
    icon: Palette,
    tone: "bg-events-hibiscus-soft text-events-hibiscus-deep",
  },
  faith: { icon: Church, tone: "bg-events-sand text-events-ink" },
  family: { icon: Users, tone: "bg-events-lime text-events-ink" },
  wellness: { icon: HeartPulse, tone: "bg-events-sand text-events-ink" },
};
