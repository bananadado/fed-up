"""Tests for the calendar deadline / daily-context inference pipeline (issue #65)."""

from datetime import date

import pytest

from app.context import (
    classify_event,
    daily_context,
    extract_context,
    extract_deadlines,
    normalize_event,
)

TODAY = date(2026, 6, 1)


# ── classification ───────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "title,expected",
    [
        ("COMP40005 Coursework Deadline", "deadline"),
        ("Assignment submission", "deadline"),
        ("Final Exam: Algorithms", "exam"),
        ("Team standup meeting", "meeting"),
        ("Lecture: Databases", "study"),
        ("Project supervision", "study"),
        ("Module workshop", "study"),
        ("Flight to Paris", "travel"),
        ("Birthday party", "social"),
        ("Gym session", "exercise"),
        ("Wander around", "generic"),
    ],
)
def test_classify_event_keywords(title, expected):
    assert classify_event(title) == expected


def test_deadline_keyword_beats_study_keyword():
    # contains both "lab" (study) and "deadline" — deadline wins by priority
    assert classify_event("Lab report deadline") == "deadline"


def test_long_untitled_event_is_work_shift():
    assert classify_event("Pharmacy", duration_hours=8) == "work_shift"
    assert classify_event("Pharmacy", duration_hours=2) == "generic"


# ── normalization ────────────────────────────────────────────────────────────

def test_normalize_parses_zulu_time_and_hour():
    norm = normalize_event({"title": "Due", "start": "2026-06-10T23:59:00Z"})
    assert norm["date"] == date(2026, 6, 10)
    assert norm["start_hour"] == 23
    assert norm["is_deadline"] is True


def test_normalize_computes_duration():
    norm = normalize_event(
        {"title": "Shift", "start": "2026-06-02T09:00:00", "end": "2026-06-02T17:00:00"}
    )
    assert norm["duration_hours"] == 8.0
    assert norm["category"] == "work_shift"


def test_normalize_all_day_has_no_hour_or_duration():
    norm = normalize_event({"title": "Holiday", "start": "2026-06-02", "all_day": True})
    assert norm["start_hour"] is None
    assert norm["duration_hours"] == 0.0


def test_normalize_undated_event_returns_none():
    assert normalize_event({"title": "No date"}) is None
    assert normalize_event({"title": "Bad", "start": "not-a-date"}) is None


# ── deadline extraction ──────────────────────────────────────────────────────

def test_extract_deadlines_filters_past_and_sorts():
    events = [
        {"title": "Exam", "start": "2026-06-10T09:00:00"},
        {"title": "Coursework deadline", "start": "2026-06-02T23:59:00"},
        {"title": "Old deadline", "start": "2026-05-20T09:00:00"},
        {"title": "Standup", "start": "2026-06-03T10:00:00"},
    ]
    deadlines = extract_deadlines(events, TODAY)
    assert [d["date"] for d in deadlines] == ["2026-06-02", "2026-06-10"]


def test_extract_deadlines_urgency_and_effort():
    events = [
        {"title": "Coursework deadline", "start": "2026-06-02T23:59:00"},
        {"title": "Final exam", "start": "2026-06-20T09:00:00"},
    ]
    deadlines = extract_deadlines(events, TODAY)
    cw, exam = deadlines
    assert cw["urgency"] == "high" and cw["effort_hours"] == 3.0
    assert exam["urgency"] == "low" and exam["effort_hours"] == 6.0


# ── daily context ────────────────────────────────────────────────────────────

def test_same_day_deadline_raises_stress():
    deadline = [{"date": date(2026, 6, 1), "category": "exam"}]
    busy = daily_context(TODAY, [], deadline, horizon_days=14)
    calm = daily_context(TODAY, [], [], horizon_days=14)
    assert busy["stress"] > calm["stress"]
    assert busy["hard_deadlines"] == 1
    assert busy["available_cooking_energy"] == round(1 - busy["stress"], 4)


def test_high_stress_tightens_constraints():
    deadline = [{"date": date(2026, 6, 1), "category": "exam"}]
    ctx = daily_context(TODAY, [], deadline, horizon_days=14)
    assert ctx["recommended_constraints"]["max_prep_minutes"] == 15
    calm = daily_context(TODAY, [], [], horizon_days=14)
    assert calm["recommended_constraints"]["max_prep_minutes"] == 60


def test_late_event_removes_free_evening():
    events = [normalize_event({"title": "Dinner with team", "start": "2026-06-01T19:00:00",
                               "end": "2026-06-01T21:00:00"})]
    ctx = daily_context(TODAY, events, [], horizon_days=14)
    assert ctx["free_evening"] is False


def test_dense_study_day_raises_stress_without_deadline():
    events = [
        normalize_event({
            "title": "Algorithms lecture",
            "start": "2026-06-01T09:00:00",
            "end": "2026-06-01T12:00:00",
        }),
        normalize_event({
            "title": "Systems lab",
            "start": "2026-06-01T13:00:00",
            "end": "2026-06-01T17:00:00",
        }),
    ]
    ctx = daily_context(TODAY, events, [], horizon_days=14)
    calm = daily_context(TODAY, [], [], horizon_days=14)
    assert ctx["stress"] > calm["stress"]
    assert ctx["academic_hours"] == 7.0
    assert ctx["recommended_constraints"]["max_prep_minutes"] < 60


def test_distant_deadline_less_pressing_than_near_one():
    near = daily_context(TODAY, [], [{"date": date(2026, 6, 2), "category": "deadline"}], 14)
    far = daily_context(TODAY, [], [{"date": date(2026, 6, 14), "category": "deadline"}], 14)
    assert near["stress"] > far["stress"]


# ── full pipeline ────────────────────────────────────────────────────────────

def test_extract_context_shape_and_horizon():
    out = extract_context(
        [{"title": "Coursework deadline", "start": "2026-06-03T23:59:00"}],
        today=TODAY,
        horizon_days=7,
    )
    assert out["today"] == "2026-06-01"
    assert len(out["days"]) == 8  # today + 7
    assert out["days"][0]["date"] == "2026-06-01"
    assert len(out["deadlines"]) == 1


def test_extract_context_is_deterministic_with_fixed_today():
    events = [{"title": "Exam", "start": "2026-06-05T09:00:00"}]
    assert extract_context(events, today=TODAY) == extract_context(events, today=TODAY)
