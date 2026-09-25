import { redirect } from "next/navigation";

export const metadata = { title: "Warnings in effect" };

export default function AdvisoriesPage() {
  redirect("/warnings");
}
