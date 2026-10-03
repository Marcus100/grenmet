"""Election and referendum contest/candidacy export rows."""

from measures import feats, source_of, status_of


def election_rows(R, REF, DATES):
    CONS = {k: v[0] for k, v in R["cons"].items()}
    CODES = list(CONS)
    MAPPED = list(R["results"])

    contests, candidates = [], []
    prev = {}
    for y in sorted([*R["early"].keys(), *R["results"].keys()], key=lambda k: DATES[k]):
        if y in R["results"]:
            rows = [(c, CONS[c], R["results"][y][c]) for c in CODES]
        else:
            rows = [(None, r["name"].strip(), r) for r in R["early"][y]]
        for code, name, e in rows:
            if not e["c"]:
                continue
            f = feats(e)
            src, page = source_of(y, e)
            p = prev.get(code) if code else None
            pf = feats(p) if p else None
            row = {
                "event": y,
                "type": "general",
                "date": DATES[y],
                "constituency_code": code or "",
                "constituency": name,
                "boundaries": "1972–present (15 seats)" if y in MAPPED else "pre-1972",
                "registered": e.get("reg") or "",
                "ballots_cast": "" if e.get("castIsValid") else (e.get("cast") or ""),
                "rejected": e.get("rej") if e.get("rej") is not None else "",
                "valid_votes": f["valid"],
                "turnout": round(f["turnout"], 4) if f["turnout"] else "",
                "turnout_basis": "valid votes"
                if e.get("castIsValid")
                else "ballots cast",
                "winner": f["winner"],
                "winner_party": f["winner_party"],
                "runner_up": f["runner_up"],
                "runner_up_party": f["runner_up_party"],
                "majority": "" if e.get("unopposed") else f["majority"],
                "margin_pct": ""
                if e.get("unopposed")
                else round(f["margin_pct"] * 100, 2),
                "winner_share_pct": ""
                if e.get("unopposed")
                else round(f["winner_share"] * 100, 2),
                "effective_candidates": ""
                if e.get("unopposed")
                else round(f["enp"], 3),
                "candidates": f["candidates"],
                "competitiveness": "unopposed"
                if e.get("unopposed")
                else f["competitiveness"],
                "seat_changed_hands": ""
                if not pf
                else ("yes" if pf["winner_party"] != f["winner_party"] else "no"),
                "previous_winner_party": pf["winner_party"] if pf else "",
                "ndc_two_party_pct": round(f["ndc_two_party"] * 100, 2)
                if f["ndc_two_party"] is not None
                else "",
                "swing_to_ndc_pts": round(
                    (f["ndc_two_party"] - pf["ndc_two_party"]) * 100, 2
                )
                if pf
                and f["ndc_two_party"] is not None
                and pf["ndc_two_party"] is not None
                else "",
                "source": src,
                "source_page": page or "",
                "verification": status_of(e),
                "note": e.get("note", ""),
            }
            contests.append(row)
            for i, k in enumerate(sorted(e["c"], key=lambda k: -k[2])):
                candidates.append(
                    {
                        "event": y,
                        "date": DATES[y],
                        "constituency_code": code or "",
                        "constituency": name,
                        "candidate": k[0].replace("*", ""),
                        "party": k[1],
                        "votes": "" if e.get("unopposed") else k[2],
                        "share_pct": ""
                        if e.get("unopposed") or not f["valid"]
                        else round(k[2] / f["valid"] * 100, 2),
                        "rank": i + 1,
                        "elected": "yes" if i == 0 else "no",
                        "verification": k[3] if len(k) > 3 else "official",
                        "source": src,
                        "source_page": page or "",
                    }
                )
            if code:
                prev[code] = e
    # referendums at constituency level
    for ev, key in (("2016r", "2016"), ("2018r", "2018")):
        st = REF[key]["stations"]
        for c in CODES:
            rows = st.get(c, [])
            if key == "2018" and c not in REF["2018"]["complete"]:
                continue
            if not rows:
                continue
            y, n, rej, v, reg = (
                sum(r[k] for r in rows) for k in ("yes", "no", "rej", "voted", "reg")
            )
            contests.append(
                {
                    "event": ev,
                    "type": "referendum",
                    "date": DATES[ev],
                    "constituency_code": c,
                    "constituency": CONS[c],
                    "boundaries": "1972–present (15 seats)",
                    "registered": reg,
                    "ballots_cast": v,
                    "rejected": rej,
                    "valid_votes": y + n,
                    "turnout": round(v / reg, 4),
                    "turnout_basis": "persons voted",
                    "winner": "Yes" if y > n else "No",
                    "winner_party": "YES" if y > n else "NO",
                    "runner_up": "No" if y > n else "Yes",
                    "runner_up_party": "",
                    "majority": abs(y - n),
                    "margin_pct": round(abs(y - n) / (y + n) * 100, 2),
                    "winner_share_pct": round(max(y, n) / (y + n) * 100, 2),
                    "effective_candidates": "",
                    "candidates": 2,
                    "competitiveness": "",
                    "seat_changed_hands": "",
                    "previous_winner_party": "",
                    "ndc_two_party_pct": "",
                    "swing_to_ndc_pts": "",
                    "source": "PEO referendum certificates 2016"
                    if key == "2016"
                    else REF["2018"]["source"],
                    "source_page": "",
                    "verification": "official",
                    "note": "Yes/No summed over seven bills" if key == "2016" else "",
                }
            )
    return contests, candidates
