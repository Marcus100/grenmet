"""Trends summaries are derived, never hand-maintained."""


def features(contests, MAPPED):
    F = {}
    for y in MAPPED:
        rows = [c for c in contests if c["event"] == y]
        F[y] = {
            "flips": None
            if y == "1972"
            else sum(1 for r in rows if r["seat_changed_hands"] == "yes"),
            "marginal": sum(
                1 for r in rows if str(r["competitiveness"]).startswith("marginal")
            ),
            "competitive": sum(
                1 for r in rows if str(r["competitiveness"]).startswith("competitive")
            ),
            "safe": sum(
                1 for r in rows if str(r["competitiveness"]).startswith("safe")
            ),
            "medianMargin": sorted(r["margin_pct"] for r in rows)[len(rows) // 2],
            "meanENP": round(
                sum(r["effective_candidates"] for r in rows) / len(rows), 3
            ),
            "verified": sum(1 for r in rows if r["verification"] == "official"),
        }
    return F
