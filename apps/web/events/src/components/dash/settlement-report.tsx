import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { formatMoney, money } from "@/domain/money";
import type { CurrencyCode, Settlement } from "@/domain/types";
import { formatTime } from "@/lib/datetime";

const CHANNEL_LABEL = {
  online: "Online (free / registration)",
  outlet_cash: "Outlet cash",
} as const;

function amount(minor: number, currency: CurrencyCode): string {
  return formatMoney(money(minor, currency));
}

/**
 * The settlement desk: issued vs claimed vs admitted vs cancelled by channel,
 * tier stock, cash expected vs counted per till, and every mismatch listed
 * rather than netted away. Dense tables, no charts.
 */
export function SettlementReport({ report }: { report: Settlement }) {
  const { currency } = report;
  return (
    <div className="space-y-6">
      <section aria-labelledby="issues-heading" className="space-y-2">
        <h2
          className="font-display text-heading-sm font-semibold"
          id="issues-heading"
        >
          Discrepancies
        </h2>
        {report.discrepancies.length === 0 ? (
          <p className="bg-card text-body text-muted-foreground rounded-xl border px-4 py-3">
            Nothing to reconcile: every closed till matches its count.
          </p>
        ) : (
          <ul className="border-destructive/40 bg-card divide-y rounded-xl border">
            {report.discrepancies.map((issue) => (
              <li
                className="text-body flex items-start gap-2 px-4 py-2"
                key={`${issue.kind}-${issue.tillId ?? issue.message}`}
              >
                <Badge variant="light-warning">
                  {issue.kind.replaceAll("_", " ")}
                </Badge>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tickets-heading" className="space-y-2">
        <h2
          className="font-display text-heading-sm font-semibold"
          id="tickets-heading"
        >
          Tickets by channel
        </h2>
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="text-body w-full text-left">
            <thead className="text-caption text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="px-3 py-2 font-medium">Claimed</th>
                <th className="px-3 py-2 font-medium">Admitted</th>
                <th className="px-3 py-2 font-medium">Waiting</th>
                <th className="px-3 py-2 font-medium">Cancelled</th>
                <th className="px-3 py-2 font-medium">Refunded</th>
                <th className="px-3 py-2 font-medium">Cash taken</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {report.channels.map((row) => (
                <tr key={row.channel}>
                  <td className="px-3 py-2 font-sans">
                    {CHANNEL_LABEL[row.channel]}
                  </td>
                  <td className="px-3 py-2">{row.issued}</td>
                  <td className="px-3 py-2">{row.claimed}</td>
                  <td className="px-3 py-2">{row.admitted}</td>
                  <td className="px-3 py-2">{row.waiting}</td>
                  <td className="px-3 py-2">{row.cancelled}</td>
                  <td className="px-3 py-2">{row.refunded}</td>
                  <td className="px-3 py-2">
                    {amount(row.collectedMinor, currency)}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-semibold">
                <td className="px-3 py-2 font-sans">All channels</td>
                <td className="px-3 py-2">{report.totals.issued}</td>
                <td className="px-3 py-2">{report.totals.claimed}</td>
                <td className="px-3 py-2">{report.totals.admitted}</td>
                <td className="px-3 py-2">{report.totals.waiting}</td>
                <td className="px-3 py-2">{report.totals.cancelled}</td>
                <td className="px-3 py-2">{report.totals.refunded}</td>
                <td className="px-3 py-2">
                  {amount(report.cash.collectedMinor, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="tiers-heading" className="space-y-2">
        <h2
          className="font-display text-heading-sm font-semibold"
          id="tiers-heading"
        >
          Tiers
        </h2>
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="text-body w-full text-left">
            <thead className="text-caption text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Allocation</th>
                <th className="px-3 py-2 font-medium">Online</th>
                <th className="px-3 py-2 font-medium">Outlet</th>
                <th className="px-3 py-2 font-medium">Admitted</th>
                <th className="px-3 py-2 font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {report.tiers.map((tier) => (
                <tr key={tier.id}>
                  <td className="px-3 py-2 font-sans">{tier.name}</td>
                  <td className="px-3 py-2">
                    {amount(tier.priceMinor, currency)}
                  </td>
                  <td className="px-3 py-2">{tier.allocation}</td>
                  <td className="px-3 py-2">{tier.online}</td>
                  <td className="px-3 py-2">{tier.outlet}</td>
                  <td className="px-3 py-2">{tier.admitted}</td>
                  <td className="px-3 py-2">{tier.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="cash-heading" className="space-y-2">
        <h2
          className="font-display text-heading-sm font-semibold"
          id="cash-heading"
        >
          Cash by till
        </h2>
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="text-body w-full text-left">
            <thead className="text-caption text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-2 font-medium">Staff</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Float</th>
                <th className="px-3 py-2 font-medium">Sold</th>
                <th className="px-3 py-2 font-medium">Refunds</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">Counted</th>
                <th className="px-3 py-2 font-medium">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {report.tills.map((till) => (
                <tr key={till.id}>
                  <td className="px-3 py-2 font-sans">
                    {till.staffName ?? "Staff"}
                    <span className="text-caption text-muted-foreground block">
                      opened {formatTime(till.openedAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-sans">
                    {till.status === "open" ? "Open" : "Closed"}
                  </td>
                  <td className="px-3 py-2">
                    {amount(till.openingFloatMinor, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {amount(till.collectedMinor, currency)} ({till.ticketsSold})
                  </td>
                  <td className="px-3 py-2">
                    {amount(till.cashRefundsMinor, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {amount(till.expectedMinor, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {till.countedMinor === null
                      ? "—"
                      : amount(till.countedMinor, currency)}
                  </td>
                  <td
                    className={
                      till.differenceMinor
                        ? "text-destructive px-3 py-2 font-semibold"
                        : "px-3 py-2"
                    }
                  >
                    {till.differenceMinor === null
                      ? "—"
                      : amount(till.differenceMinor, currency)}
                  </td>
                </tr>
              ))}
              {report.tills.length === 0 ? (
                <tr>
                  <td
                    className="text-muted-foreground px-3 py-6 text-center"
                    colSpan={8}
                  >
                    No outlet tills were opened.
                  </td>
                </tr>
              ) : null}
              {report.tills.length > 0 ? (
                <tr className="bg-muted/40 font-semibold">
                  <td className="px-3 py-2 font-sans" colSpan={2}>
                    Total ({report.cash.closedTills} closed,{" "}
                    {report.cash.openTills} open)
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">
                    {amount(report.cash.collectedMinor, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {amount(report.cash.cashRefundsMinor, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {amount(report.cash.expectedMinor, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {amount(report.cash.countedMinor, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {amount(report.cash.differenceMinor, currency)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {report.refunds.length > 0 ? (
        <section aria-labelledby="refunds-heading" className="space-y-2">
          <h2
            className="font-display text-heading-sm font-semibold"
            id="refunds-heading"
          >
            Refunds
          </h2>
          <div className="bg-card overflow-x-auto rounded-xl border">
            <table className="text-body w-full text-left">
              <thead className="text-caption text-muted-foreground border-b">
                <tr>
                  <th className="px-3 py-2 font-medium">Ticket</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {report.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td className="px-3 py-2 font-mono tracking-wider">
                      {refund.code}
                    </td>
                    <td className="px-3 py-2">
                      {amount(refund.amountMinor, currency)}
                    </td>
                    <td className="px-3 py-2 font-sans">{refund.method}</td>
                    <td className="px-3 py-2 font-sans">
                      {refund.reference ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-sans">
                      {refund.refundedByName ?? "Staff"} at{" "}
                      {formatTime(refund.refundedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
