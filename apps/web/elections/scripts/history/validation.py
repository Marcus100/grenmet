"""Rerun the original 94 source/reconciliation checks on the current archive."""

from collections import Counter


def validate(R, REF, REG, GEO, candidates, contests, references):
    checks = []
    CONS = {k: v[0] for k, v in R["cons"].items()}

    def check(area, name, ok, detail="", known=False):
        checks.append(
            {
                "area": area,
                "check": name,
                "status": "pass" if ok else ("known" if known else "fail"),
                "detail": detail,
            }
        )

    SUMMARY = references["recorded-totals"]["SUMMARY"]
    for y, s in SUMMARY.items():
        cons = R["results"][y]
        party = Counter()
        for e in cons.values():
            for k in e["c"]:
                party[k[1]] += k[2]
        for p in ("NNP", "NDC"):
            check(
                f"{y} election",
                f"{p} total equals the PEO Final Summary ({s[p]:,})",
                party[p] == s[p],
                f"got {party[p]:,}",
            )
        for k, lab in (
            ("_rej", "rejected ballots"),
            ("_cast", "ballots cast"),
            ("_reg", "registered voters"),
        ):
            tot = (
                sum(
                    (e.get(k[1:] if k != "_reg" else "reg") or 0) for e in cons.values()
                )
                if k != "_rej"
                else sum(e.get("rej") or 0 for e in cons.values())
            )
            tot = sum(
                e.get({"_rej": "rej", "_cast": "cast", "_reg": "reg"}[k]) or 0
                for e in cons.values()
            )
            check(
                f"{y} election",
                f"Sum of constituency {lab} equals the Final Summary ({s[k]:,})",
                tot == s[k],
                f"got {tot:,}",
            )
        bad = [
            c
            for c, e in cons.items()
            if e.get("cast") is not None
            and e.get("rej") is not None
            and e["cast"] != sum(k[2] for k in e["c"]) + e["rej"]
        ]
        check(
            f"{y} election",
            "Every constituency: ballots cast = valid votes + rejected",
            not bad,
            ", ".join(bad),
        )
        bad = []
        for c, e in cons.items():
            rows = R["stations"][y].get(c, [])
            sv = Counter()
            for r in rows:
                for p, v in r[6].items():
                    sv[p] += v
            if (
                rows
                and dict(sv) != {k[1]: k[2] for k in e["c"]}
                and not (y == "2022" and c == "P")
            ):
                bad.append(c)
        check(
            f"{y} election",
            "Polling stations add up to each constituency result",
            not bad,
            ", ".join(bad)
            or "St. Patrick East 2022 excluded: report pages missing (E-07)",
        )
    REGTOT = references["recorded-totals"]["REGTOT"]
    for y, t in REGTOT.items():
        s = sum(e.get("reg") or 0 for e in R["results"][y].values())
        check(
            f"{y} election",
            f"Registered voters by constituency sum to the national total ({t:,})",
            s == t,
            f"got {s:,}",
        )
    e90 = R["results"]["1990"]
    check(
        "1990 election",
        "Electors on the roll available for every constituency",
        all(e.get("reg") for e in e90.values()),
        "from The Grenada Newsletter; the PEO document’s column is unusable (E-04)",
    )
    GZ9095 = references["gazette-winners"]
    bad = [
        c
        for c, (sn, party, v) in GZ9095["1990"]["w"].items()
        if max(e90[c]["c"], key=lambda k: k[2])[2] != v
    ]
    check(
        "1990 election",
        "All 15 winners’ votes equal the Supervisor of Elections’ Gazette declaration",
        not bad,
        ", ".join(bad),
    )
    NL1990 = references["newsletter-1990"]
    bad = [
        c for c, (reg, cast, rows) in NL1990.items() if sum(r[2] for r in rows) != cast
    ]
    check(
        "1990 election",
        "Each constituency’s candidates sum to the votes cast printed in The Grenada Newsletter",
        not bad,
        "; ".join(
            f"{c}: {sum(r[2] for r in NL1990[c][2])} vs {NL1990[c][1]} (likely rejected ballots)"
            for c in bad
        ),
        known=bool(bad),
    )
    e76 = R["results"]["1976"]
    check(
        "1976 election",
        "Electors in the 15 constituencies sum to the Gazette’s stated 63,193",
        sum(e["reg"] for e in e76.values()) == 63193,
    )
    check(
        "1976 election",
        "Candidate votes reproduce the Newsletter’s printed totals (Alliance 19,671; GULP 21,085)",
        sum(k[2] for e in e76.values() for k in e["c"] if k[1] != "GULP") == 19671
        and sum(k[2] for e in e76.values() for k in e["c"] if k[1] == "GULP") == 21085,
    )
    g72 = R["results"]["1972"]
    check(
        "1972 election",
        "Electors in the 15 constituencies sum to the Gazette’s stated 41,529",
        sum(e["reg"] for e in g72.values()) == 41529,
    )
    for c, e in g72.items():
        d = e.get("divisions")
        if d:
            sums = [sum(r[i] for r in d["rows"]) for i in (2, 3, 4)]
            [e["reg"]] + [
                sum(k[2] for k in e["c"] if k[0])
            ]  # placeholder, per-column below
            ok = sums[0] == e["reg"]
            cand_ok = sorted(sums[1:]) == sorted(k[2] for k in e["c"])
            check(
                "1972 election",
                f"{CONS[c]}: polling divisions add up to printed totals",
                ok and cand_ok,
                "" if ok and cand_ok else e.get("note", ""),
                known=bool(e.get("note")),
            )
    SEATS = references["recorded-totals"]["SEATS"]
    for y, s in SEATS.items():
        got = Counter(
            max(e["c"], key=lambda k: k[2])[1] for e in R["results"][y].values()
        )
        check(
            f"{y} election",
            f"Seat totals match the recorded outcome ({', '.join(f'{p} {n}' for p, n in s.items())})",
            dict(got) == s,
            str(dict(got)),
        )
    r16 = REF["2016"]["stations"]
    tot16 = {k: sum(r[k] for rows in r16.values() for r in rows) for k in ("yes", "no")}
    check(
        "2016 referendum",
        "Station Yes/No totals equal the certificate’s national total (51,946 / 100,140)",
        tot16 == {"yes": 51946, "no": 100140},
        str(tot16),
    )
    bad = [
        f"{r['div']}{r.get('sub') or ''}"
        for rows in REF["2018"]["stations"].values()
        for r in rows
        if r["yes"] + r["no"] + r["rej"] != r["voted"]
    ]
    check(
        "2018 referendum",
        "Every readable station: Yes + No + rejected = voted",
        not bad,
        ", ".join(bad),
    )
    check(
        "2018 referendum",
        "All stations readable in the official Gazette",
        False,
        "5 constituencies unreadable in the damaged PDF (R-04)",
        known=True,
    )
    for s in REG["snapshots"]:
        empty = [d for d, v in s["div"].items() if v[0] <= 0]
        check(
            "Voter register",
            f"{s['date']}: every polling division has electors",
            not empty,
            ", ".join(empty),
        )
        blank = {
            d: v[0] - v[1] - v[2] for d, v in s["div"].items() if v[0] - v[1] - v[2]
        }
        check(
            "Voter register",
            f"{s['date']}: sex recorded for every elector",
            not blank,
            "; ".join(
                f"{d}: {n} elector(s) with sex blank or unreadable in the published list"
                for d, n in blank.items()
            ),
            known=bool(blank),
        )
    geo_missing = sorted(
        {r[0] for rows in R["stations"]["2022"].values() for r in rows}
        - set(GEO["divisions"])
    )
    check(
        "Map",
        "Every 2022 polling division has a shape",
        not geo_missing,
        ", ".join(geo_missing),
    )
    neg = [c for c in candidates if c["votes"] != "" and c["votes"] < 0]
    check("All elections", "No negative vote counts", not neg)
    zero_contest = [
        f"{c['event']} {c['constituency']}"
        for c in contests
        if c["type"] == "general"
        and c["valid_votes"] == 0
        and c["competitiveness"] != "unopposed"
    ]
    check(
        "All elections",
        "Every contested seat has votes",
        not zero_contest,
        ", ".join(zero_contest),
    )
    ver = Counter(c["verification"] for c in candidates)
    summary = {
        "pass": sum(1 for c in checks if c["status"] == "pass"),
        "fail": sum(1 for c in checks if c["status"] == "fail"),
        "known": sum(1 for c in checks if c["status"] == "known"),
        "candidateVerification": dict(ver),
    }
    return {"summary": summary, "checks": checks}
