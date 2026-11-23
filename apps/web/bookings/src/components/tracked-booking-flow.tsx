"use client";

import {
  BookingFlow,
  type BookingFlowProps,
  type BookingTrackEvent,
  type BookingTrackProperties,
} from "@barrelsgd/bookings-web/components/booking-flow";
import { createFunnel } from "@barrelsgd/ui/lib/funnel-analytics";

const funnel = createFunnel("bookings");

/**
 * The booking flow with the cookieless funnel bound to this business. Only the
 * business slug and the service id reach analytics (ADR-0037).
 */
export function TrackedBookingFlow({
  slug,
  ...props
}: BookingFlowProps & { slug: string }) {
  const track = (
    event: BookingTrackEvent,
    properties: BookingTrackProperties
  ) => funnel.capture(event, { ...properties, organisation: slug });
  return <BookingFlow {...props} track={track} />;
}
