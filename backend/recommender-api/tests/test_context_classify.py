"""Tests for embedding-assisted event classification & the academic/general
split added when wiring the #65 deadline-context pipeline to the frontend."""

from datetime import date

from app.context import (
    CATEGORY_ANCHORS,
    classify_events,
    event_type,
    extract_context,
)

TODAY = date(2026, 6, 1)
LABELS = list(CATEGORY_ANCHORS)


def _stub_embed(title_to_label: dict[str, str]):
    """Deterministic embed_fn: anchors and mapped titles become one-hot vectors;
    anything unmapped is the zero vector (cosine 0 → below threshold)."""

    def embed(texts: list[str]) -> list[list[float]]:
        vectors = []
        for text in texts:
            label = next((lab for lab, anchor in CATEGORY_ANCHORS.items() if anchor == text), None)
            if label is None:
                label = title_to_label.get(text)
            vec = [0.0] * len(LABELS)
            if label is not None:
                vec[LABELS.index(label)] = 1.0
            vectors.append(vec)
        return vectors

    return embed


# ── event_type mapping ────────────────────────────────────────────────────────

def test_event_type_academic_vs_general():
    assert event_type("deadline") == "academic"
    assert event_type("exam") == "academic"
    assert event_type("study") == "academic"
    assert event_type("social") == "general"
    assert event_type("meeting") == "general"
    assert event_type("generic") == "general"


# ── classify_events: keyword batch ──────────────────────────────────────────

def test_classify_events_keyword_batch_is_pure_without_embed_fn():
    events = [
        {"title": "Coursework deadline"},
        {"title": "Final exam"},
        {"title": "Wander about"},
    ]
    assert classify_events(events) == ["deadline", "exam", "generic"]


# ── classify_events: embedding fallback ──────────────────────────────────────

def test_embedding_refines_generic_titles():
    events = [{"title": "Dissertation chapter writeup"}]
    # Keyword path can't place it -> generic; embedding maps it to deadline.
    assert classify_events(events) == ["generic"]
    refined = classify_events(events, _stub_embed({"Dissertation chapter writeup": "deadline"}))
    assert refined == ["deadline"]


def test_embedding_does_not_override_keyword_matches():
    events = [{"title": "Final Exam"}]
    # Even if the stub would call it social, the keyword "exam" wins.
    assert classify_events(events, _stub_embed({"Final Exam": "social"})) == ["exam"]


def test_embedding_below_threshold_stays_generic():
    events = [{"title": "Mystery block"}]
    # Unmapped -> zero vector -> no anchor clears the similarity threshold.
    assert classify_events(events, _stub_embed({})) == ["generic"]


def test_classify_events_handles_empty_and_blank_titles():
    assert classify_events([]) == []
    assert classify_events([{"title": "   "}], _stub_embed({})) == ["generic"]


# ── extract_context: per-event classification + academic deadlines ───────────

def test_context_includes_per_event_classification():
    events = [
        {"title": "Coursework deadline", "start": "2026-06-03T23:59:00"},
        {"title": "Gym session", "start": "2026-06-02T08:00:00"},
    ]
    out = extract_context(events, today=TODAY, horizon_days=7)
    assert [e["index"] for e in out["events"]] == [0, 1]
    assert out["events"][0]["event_type"] == "academic"
    assert out["events"][0]["is_deadline"] is True
    assert out["events"][1]["event_type"] == "general"
    assert out["deadlines"][0]["event_type"] == "academic"


def test_context_embedding_promotes_event_to_deadline_and_raises_stress():
    events = [{"title": "Dissertation chapter", "start": "2026-06-02T18:00:00"}]
    plain = extract_context(events, today=TODAY, horizon_days=7)
    embedded = extract_context(
        events, today=TODAY, horizon_days=7,
        embed_fn=_stub_embed({"Dissertation chapter": "deadline"}),
    )
    assert plain["deadlines"] == []
    assert len(embedded["deadlines"]) == 1
    assert embedded["deadlines"][0]["event_type"] == "academic"
    # The promoted deadline should now pressure the day it falls on.
    assert embedded["days"][1]["stress"] > plain["days"][1]["stress"]
