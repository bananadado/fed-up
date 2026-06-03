"""Endpoint tests for the deadline/context extraction API (issue #65)."""


def _payload(**overrides):
    base = {
        "today": "2026-06-01",
        "horizon_days": 7,
        "events": [
            {"title": "COMP40005 Coursework Deadline", "start": "2026-06-02T23:59:00Z"},
            {"title": "Team standup", "start": "2026-06-01T10:00:00", "end": "2026-06-01T10:30:00"},
        ],
    }
    base.update(overrides)
    return base


def test_context_deadlines_returns_deadlines_and_days(client):
    resp = client.post("/context/deadlines", json=_payload())
    assert resp.status_code == 200
    body = resp.json()
    assert body["today"] == "2026-06-01"
    assert len(body["days"]) == 8
    assert len(body["deadlines"]) == 1
    assert body["deadlines"][0]["urgency"] == "high"


def test_context_deadlines_stress_present_for_each_day(client):
    body = client.post("/context/deadlines", json=_payload()).json()
    for day in body["days"]:
        assert 0.0 <= day["stress"] <= 1.0
        assert "recommended_constraints" in day


def test_context_deadlines_empty_events(client):
    resp = client.post("/context/deadlines", json={"today": "2026-06-01", "horizon_days": 3, "events": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["deadlines"] == []
    assert len(body["days"]) == 4
    assert all(d["stress"] == 0.0 for d in body["days"])


def test_context_deadlines_requires_event_start(client):
    resp = client.post("/context/deadlines", json={"events": [{"title": "No start"}]})
    assert resp.status_code == 422


def test_context_deadlines_rejects_out_of_range_horizon(client):
    resp = client.post("/context/deadlines", json={"events": [], "horizon_days": 999})
    assert resp.status_code == 422


def test_context_deadlines_defaults_today_when_omitted(client):
    resp = client.post("/context/deadlines", json={"events": [], "horizon_days": 1})
    assert resp.status_code == 200
    assert len(resp.json()["days"]) == 2
