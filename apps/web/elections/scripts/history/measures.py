"""Pure measures and source labels; preserved from the checked archive exporter."""


def source_of(y, e):
    s = e.get("src")
    if s == "peo":
        return (
            "PEO Final Report, Elections 2013"
            if y == "2013"
            else f"PEO General Election Report {y}"
        ), e.get("page")
    if s == "peo-old":
        return "PEO Old Elections Results (1984–2008), candidate table", e.get("page")
    if s == "gazette1972":
        return "Government Gazette No. 20, 11 March 1972", e.get("page")
    if s == "gazette-newsletter-1990":
        return (
            "Government Gazette No. 15, 16 March 1990 (winners); The Grenada Newsletter, 24 March 1990 (others)",
            None,
        )
    if s == "newsletter-1976":
        return (
            "The Grenada Newsletter, 11 December 1976 (votes); Government Gazette No. 58, 30 November 1976 (electors)",
            None,
        )
    if e.get("gazette"):
        return (
            f"ElectionPassport (secondary); winner checked against {e['gazette']}",
            None,
        )
    return "ElectionPassport compilation (secondary)", None


def status_of(e):
    fl = [k[3] if len(k) > 3 else "official" for k in e["c"]]
    if "check" in fl:
        return "conflict"
    if all(f == "official" for f in fl):
        return "official"
    if all(f in ("official", "corroborated") for f in fl):
        return "corroborated"
    if any(f == "official" for f in fl):
        return "partly verified"
    return "unverified"


def feats(e):
    c = sorted(e["c"], key=lambda k: -k[2])
    valid = sum(k[2] for k in c) or 0
    s = [k[2] / valid for k in c] if valid else []
    ndc = sum(k[2] for k in c if k[1] == "NDC")
    nnp = sum(k[2] for k in c if k[1] == "NNP")
    margin = (s[0] - (s[1] if len(s) > 1 else 0)) if s else None
    return {
        "valid": valid,
        "winner": c[0][0],
        "winner_party": c[0][1],
        "runner_up": c[1][0] if len(c) > 1 else "",
        "runner_up_party": c[1][1] if len(c) > 1 else "",
        "majority": c[0][2] - (c[1][2] if len(c) > 1 else 0),
        "margin_pct": margin,
        "winner_share": s[0] if s else None,
        "enp": (1 / sum(x * x for x in s)) if s else None,
        "candidates": len(c),
        "ndc_two_party": ndc / (ndc + nnp) if ndc + nnp else None,
        "competitiveness": None
        if margin is None
        else (
            "marginal (<5 pts)"
            if margin < 0.05
            else "competitive (5–15 pts)"
            if margin < 0.15
            else "safe (15+ pts)"
        ),
        "turnout": (e["cast"] / e["reg"]) if e.get("reg") and e.get("cast") else None,
    }
