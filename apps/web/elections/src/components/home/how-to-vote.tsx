import Link from "next/link";
export function HowToVote() {
  return (
    <div className="space-y-3 text-base leading-relaxed">
      <p>
        Check your entry on the relevant voters’ list, your assigned polling
        location and the current identification requirements with the
        Parliamentary Elections Office.
      </p>
      <p>
        Registration, eligibility and polling arrangements are separate
        questions. Historical reports and our illustrative maps cannot confirm
        your current voting arrangements.
      </p>
      <p>
        <a
          className="underline underline-offset-4"
          href="https://www.peogrenada.org/"
        >
          Check with the PEO
        </a>{" "}
        ·{" "}
        <Link
          className="underline underline-offset-4"
          href="/learn/registering-and-voting"
        >
          Understand registration and voting
        </Link>
      </p>
    </div>
  );
}
