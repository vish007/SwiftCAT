from dataclasses import dataclass
from datetime import date

LEFT_TYPES = {"103", "202", "910"}
RIGHT_TYPES = {"940", "950"}
VALID_BIC_PAIRINGS = {("BICAAA", "BICBBB"), ("BIC111", "BIC222")}


@dataclass
class CandidateMatch:
    msg_id_left: int
    msg_id_right: int
    confidence: float
    rationale: str
    match_type: str


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def generate_candidate(left: dict, right: dict) -> CandidateMatch | None:
    if left["currency"] != right["currency"]:
        return None

    if (
        left["ref"]
        and right["ref"]
        and left["ref"] == right["ref"]
        and left["amount"] == right["amount"]
    ):
        return CandidateMatch(
            msg_id_left=left["id"],
            msg_id_right=right["id"],
            confidence=1.0,
            rationale="exact: ref+amount+currency",
            match_type="exact",
        )

    days = abs((parse_date(left["value_date"]) - parse_date(right["value_date"])).days)
    bic_pair = (left["bic"], right["bic"]) in VALID_BIC_PAIRINGS
    if left["amount"] == right["amount"] and days <= 1 and bic_pair:
        return CandidateMatch(
            msg_id_left=left["id"],
            msg_id_right=right["id"],
            confidence=0.82,
            rationale="fuzzy: amount + date±1 + BIC pairing",
            match_type="fuzzy",
        )

    return None


def find_best_matches(left_messages: list[dict], right_messages: list[dict]) -> list[CandidateMatch]:
    used_right = set()
    matches: list[CandidateMatch] = []
    for left in left_messages:
        candidates = []
        for right in right_messages:
            if right["id"] in used_right:
                continue
            c = generate_candidate(left, right)
            if c:
                candidates.append(c)
        if candidates:
            best = sorted(candidates, key=lambda x: x.confidence, reverse=True)[0]
            matches.append(best)
            used_right.add(best.msg_id_right)
    return matches
