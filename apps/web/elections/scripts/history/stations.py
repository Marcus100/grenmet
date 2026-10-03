"""Polling returns retain historical numbering and incomplete-source rows."""


def station_rows(R, REF):
    stations = []
    for y in ("2013", "2018", "2022"):
        for c, rows in R["stations"][y].items():
            for div, sub, place, reg, cast, rej, votes in rows:
                for party, v in votes.items():
                    stations.append(
                        {
                            "event": y,
                            "constituency_code": c,
                            "division": div,
                            "station": sub or "",
                            "place": place,
                            "registered": reg,
                            "ballots_cast": cast,
                            "rejected": rej,
                            "option": party,
                            "votes": v,
                            "source": f"PEO report {y}",
                            "division_numbering": "current",
                        }
                    )
    for c, e in R["results"]["1972"].items():
        d = e.get("divisions")
        if not d:
            continue
        [k[0] for k in sorted(e["c"], key=lambda k: -k[2])]
        for no, place, electors, v1, v2 in d["rows"]:
            for cand, v in zip(d["cands"], (v1, v2)):
                stations.append(
                    {
                        "event": "1972",
                        "constituency_code": c,
                        "division": no,
                        "station": "",
                        "place": place,
                        "registered": electors,
                        "ballots_cast": "",
                        "rejected": "",
                        "option": cand,
                        "votes": v,
                        "source": f"Government Gazette No. 20 of 1972, p. {e.get('page')}",
                        "division_numbering": "1972",
                    }
                )
    for ev, key in (("2016r", "2016"), ("2018r", "2018")):
        for c, rows in REF[key]["stations"].items():
            for r in rows:
                for opt in ("yes", "no"):
                    stations.append(
                        {
                            "event": ev,
                            "constituency_code": c,
                            "division": r["div"],
                            "station": r.get("sub") or "",
                            "place": r.get("place", ""),
                            "registered": r["reg"],
                            "ballots_cast": r["voted"],
                            "rejected": r["rej"],
                            "option": opt.upper(),
                            "votes": r[opt],
                            "source": "PEO referendum certificates 2016"
                            if key == "2016"
                            else "Government Gazette No. 52 of 2018",
                            "division_numbering": "current",
                        }
                    )
    return stations
