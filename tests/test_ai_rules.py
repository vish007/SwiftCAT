from swiftcat.ai_rules import explain_unmatched, risk_score, suggest_match_candidates


def test_suggest_match_candidates_picks_highest_score():
    payload = {
        "message": {
            "id": "msg-1",
            "candidate_transactions": [
                {"id": "t1", "score": 0.3},
                {"id": "t2", "score": 0.8},
            ],
        }
    }
    result = suggest_match_candidates(payload)
    assert result["suggestions"][0]["transaction_id"] == "t2"


def test_explain_unmatched_below_threshold():
    payload = {"message": {"candidate_transactions": [{"id": "t1", "score": 0.5}]}}
    result = explain_unmatched(payload)
    assert "below 0.90" in result["explanation"]


def test_category7_risk_scoring_detects_factors():
    payload = {
        "message": {
            "type": "MT700",
            "text": "Soft clause with sanctioned buyer and restricted goods",
        }
    }
    result = risk_score(payload)
    assert result["risk_score"] >= 60
    assert result["recommended_queue"] == "Compliance"
