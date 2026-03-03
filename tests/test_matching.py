from matching import generate_candidate, find_best_matches


def test_exact_match_has_full_confidence():
    left = {"id": 1, "ref": "ABC", "amount": 100.0, "currency": "USD", "value_date": "2026-01-01", "bic": "BICAAA"}
    right = {"id": 2, "ref": "ABC", "amount": 100.0, "currency": "USD", "value_date": "2026-01-03", "bic": "BICBBB"}
    c = generate_candidate(left, right)
    assert c is not None
    assert c.match_type == "exact"
    assert c.confidence == 1.0


def test_fuzzy_match_uses_bic_pair_and_date_window():
    left = {"id": 1, "ref": "ABC", "amount": 100.0, "currency": "USD", "value_date": "2026-01-01", "bic": "BICAAA"}
    right = {"id": 2, "ref": "ZZZ", "amount": 100.0, "currency": "USD", "value_date": "2026-01-02", "bic": "BICBBB"}
    c = generate_candidate(left, right)
    assert c is not None
    assert c.match_type == "fuzzy"


def test_best_match_picks_highest_confidence():
    left = [{"id": 1, "ref": "ABC", "amount": 100.0, "currency": "USD", "value_date": "2026-01-01", "bic": "BICAAA"}]
    right = [
        {"id": 2, "ref": "ZZZ", "amount": 100.0, "currency": "USD", "value_date": "2026-01-02", "bic": "BICBBB"},
        {"id": 3, "ref": "ABC", "amount": 100.0, "currency": "USD", "value_date": "2026-01-01", "bic": "BICBBB"},
    ]
    matches = find_best_matches(left, right)
    assert len(matches) == 1
    assert matches[0].msg_id_right == 3
