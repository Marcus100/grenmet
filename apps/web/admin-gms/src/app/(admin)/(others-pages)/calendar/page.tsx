import type { Metadata } from "next";
import { Calendar } from "@/components/calendar/event-calendar";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Duty and events calendar",
};

export default function CalendarPage() {
  return <Calendar />;
}
