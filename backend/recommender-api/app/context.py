"""Calendar deadline extraction & daily-context inference (issue #65).

This is a *context inference pipeline*, not just calendar parsing: it classifies
events, extracts academic deadlines, and estimates each day's time pressure /
available cooking energy so the recommender can adapt (the ``deadline_stress``
input to ``/recommend``).

Everything is pure and deterministic — a ``today`` reference date can be passed
in — so it is fully unit-testable without a clock, DB, or network. Only derived
features are returned; raw event titles are never persisted (privacy).
"""

from collections.abc import Callable
from datetime import date, datetime, timedelta

# ── Event classification ─────────────────────────────────────────────────────

# Ordered by priority: the first category whose keywords match wins.
CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("deadline", ("deadline", "due", "submission", "submit", "coursework", "assignment", "hand-in", "handin")),
    ("exam", ("exam", "midterm", "final exam", "quiz", "test", "viva")),
    ("meeting", ("meeting", "standup", "stand-up", "sync", "call", "1:1", "interview", "supervision")),
    ("study", ("lecture", "tutorial", "lab", "seminar", "revision", "study", "class")),
    ("travel", ("flight", "train", "travel", "trip", "commute")),
    ("social", ("party", "dinner", "drinks", "social", "birthday", "lunch with")),
    ("exercise", ("gym", "run", "workout", "exercise", "training", "yoga")),
]

DEADLINE_CATEGORIES = {"deadline", "exam"}

# Whether an event counts as academic workload (drives the academic/general
# split the frontend shows and the cooking-effort reduction it applies).
ACADEMIC_CATEGORIES = {"deadline", "exam", "study"}

# Short labelled descriptions used for embedding-based classification of titles
# the keyword pass can't place. Embedding the title and picking the nearest
# anchor reuses the recipe embedding model already loaded on the GPU, so it is
# cheap (one batched call) and generalises to phrasings the keywords miss
# ("OS problem sheet", "dissertation chapter", "society social").
CATEGORY_ANCHORS: dict[str, str] = {
    "deadline": "coursework deadline, assignment submission, project hand-in, report due",
    "exam": "exam, midterm, final test, quiz, viva assessment",
    "study": "lecture, tutorial, lab session, seminar, revision class, study session",
    "meeting": "meeting, supervisor sync, standup, call, interview, catch up",
    "social": "party, dinner with friends, drinks, birthday, society social, night out",
    "exercise": "gym workout, run, sports training, yoga, swimming",
    "travel": "flight, train journey, travel, trip away, commute",
}

# Minimum cosine similarity to accept an embedding-based label; below this the
# title is too generic to confidently classify, so it stays "generic".
EMBED_SIM_THRESHOLD = 0.30

EmbedFn = Callable[[list[str]], list[list[float]]]


def event_type(category: str) -> str:
    """Map a fine-grained category to the academic/general split."""
    return "academic" if category in ACADEMIC_CATEGORIES else "general"

# How much each category contributes to a day's stress.
CATEGORY_STRESS = {
    "deadline": 1.0,
    "exam": 1.0,
    "work_shift": 0.6,
    "travel": 0.5,
    "study": 0.4,
    "meeting": 0.3,
    "social": 0.2,
    "exercise": 0.15,
    "generic": 0.2,
}

# Rough effort (hours) a deadline-type event implies.
EFFORT_HOURS = {"exam": 6.0, "deadline": 3.0}

# Effort estimate per category for *any* classified event (not just deadlines),
# used to drive the frontend's per-event workload model.
EVENT_EFFORT_HOURS = {"exam": 6.0, "deadline": 3.0, "study": 2.0, "meeting": 1.0}

WAKING_HOURS = 16.0
EVENING_HOUR = 18  # events at/after this hour eat into cooking time
WORK_SHIFT_HOURS = 6.0  # long timed events are treated as work shifts


def classify_event(title: str, duration_hours: float = 0.0) -> str:
    """Deterministic keyword + structure classification (the fast path)."""
    t = (title or "").lower()
    for category, words in CATEGORY_KEYWORDS:
        if any(w in t for w in words):
            return category
    if duration_hours >= WORK_SHIFT_HOURS:
        return "work_shift"
    return "generic"


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _embedding_classify(titles: list[str], embed_fn: EmbedFn) -> list[str | None]:
    """Nearest-anchor classification for titles the keywords didn't place.

    One batched embedding call covers the anchors and all titles. Returns the
    best category per title, or ``None`` when no anchor clears the similarity
    threshold (so the caller keeps it ``generic``).
    """
    if not titles:
        return []
    labels = list(CATEGORY_ANCHORS)
    anchor_texts = [CATEGORY_ANCHORS[label] for label in labels]
    vectors = embed_fn(anchor_texts + titles)
    anchor_vecs = vectors[: len(labels)]
    title_vecs = vectors[len(labels):]

    out: list[str | None] = []
    for tv in title_vecs:
        best_label, best_sim = None, -1.0
        for label, av in zip(labels, anchor_vecs):
            sim = _cosine(tv, av)
            if sim > best_sim:
                best_sim, best_label = sim, label
        out.append(best_label if best_sim >= EMBED_SIM_THRESHOLD else None)
    return out


def _event_duration_hours(event: dict) -> float:
    start = _parse_dt(event.get("start"))
    end = _parse_dt(event.get("end"))
    if start and end and end > start and not event.get("all_day"):
        return (end - start).total_seconds() / 3600.0
    return 0.0


def classify_events(events: list[dict], embed_fn: EmbedFn | None = None) -> list[str]:
    """Classify a batch of events: keyword fast path, embedding fallback.

    Pure and deterministic when ``embed_fn`` is ``None`` (keyword only). When an
    embedding function is supplied, titles that fall through to ``generic`` are
    refined against the category anchors.
    """
    titles = [(e.get("title") or "") for e in events]
    categories = [
        classify_event(title, _event_duration_hours(e))
        for title, e in zip(titles, events)
    ]

    if embed_fn is not None:
        pending = [i for i, c in enumerate(categories) if c == "generic" and titles[i].strip()]
        if pending:
            refined = _embedding_classify([titles[i] for i in pending], embed_fn)
            for i, label in zip(pending, refined):
                if label is not None:
                    categories[i] = label

    return categories


# ── Parsing ──────────────────────────────────────────────────────────────────

def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        try:
            return datetime.combine(date.fromisoformat(raw[:10]), datetime.min.time())
        except ValueError:
            return None
    return dt.replace(tzinfo=None)


def normalize_event(event: dict, category: str | None = None) -> dict | None:
    """Turn a raw calendar event into derived features. Returns None if undated.

    ``category`` may be passed in when it has already been computed in a batch
    (e.g. with embedding refinement); otherwise it falls back to the keyword
    classifier so standalone callers keep working unchanged.
    """
    start = _parse_dt(event.get("start"))
    if start is None:
        return None
    end = _parse_dt(event.get("end"))
    all_day = bool(event.get("all_day"))

    duration_hours = 0.0
    if end and end > start and not all_day:
        duration_hours = (end - start).total_seconds() / 3600.0

    if category is None:
        category = classify_event(event.get("title", ""), duration_hours)
    return {
        "title": event.get("title", ""),
        "date": start.date(),
        "start_hour": None if all_day else start.hour,
        "duration_hours": duration_hours,
        "all_day": all_day,
        "category": category,
        "event_type": event_type(category),
        "is_deadline": category in DEADLINE_CATEGORIES,
    }


# ── Deadline extraction ──────────────────────────────────────────────────────

def _urgency(days_until: int) -> str:
    if days_until <= 1:
        return "high"
    if days_until <= 3:
        return "medium"
    return "low"


def extract_deadlines(events: list[dict], today: date, categories: list[str] | None = None) -> list[dict]:
    """Future academic deadlines/exams, sorted by date.

    ``categories`` (aligned with ``events``) lets the caller reuse a batch
    classification; otherwise each event is classified on the keyword path.
    """
    deadlines = []
    for i, event in enumerate(events):
        category = categories[i] if categories is not None else None
        norm = normalize_event(event, category)
        if norm is None or not norm["is_deadline"]:
            continue
        if norm["date"] < today:
            continue
        days_until = (norm["date"] - today).days
        deadlines.append({
            "title": norm["title"],
            "date": norm["date"].isoformat(),
            "category": norm["category"],
            "event_type": norm["event_type"],
            "days_until": days_until,
            "effort_hours": EFFORT_HOURS.get(norm["category"], 2.0),
            "urgency": _urgency(days_until),
        })
    deadlines.sort(key=lambda d: d["date"])
    return deadlines


# ── Daily context / pressure scoring ─────────────────────────────────────────

def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def _recommended_constraints(stress: float) -> dict:
    if stress >= 0.66:
        return {"max_prep_minutes": 15, "max_cleanup": 1, "max_complexity": 0.3}
    if stress >= 0.4:
        return {"max_prep_minutes": 30, "max_cleanup": 2, "max_complexity": 0.55}
    return {"max_prep_minutes": 60, "max_cleanup": 3, "max_complexity": 1.0}


def daily_context(target: date, norm_events: list[dict], norm_deadlines: list[dict], horizon_days: int) -> dict:
    """Compute the pressure features and stress score for a single day."""
    same_day = [e for e in norm_events if e["date"] == target]

    occupied = sum(e["duration_hours"] for e in same_day)
    meeting_hours = sum(e["duration_hours"] for e in same_day if e["category"] == "meeting")
    density = _clamp(occupied / WAKING_HOURS)
    event_count = len(same_day)
    late_event = any(
        (e["start_hour"] is not None and e["start_hour"] >= EVENING_HOUR) for e in same_day
    )

    # Deadline proximity: nearer upcoming deadlines (incl. today) pile pressure
    # onto the day, weighted by category severity.
    deadline_pressure = 0.0
    for dl in norm_deadlines:
        days_until = (dl["date"] - target).days
        if 0 <= days_until <= horizon_days:
            proximity = 1.0 - days_until / (horizon_days + 1)
            deadline_pressure += CATEGORY_STRESS[dl["category"]] * proximity
    deadline_pressure = _clamp(deadline_pressure)

    stress = _clamp(
        0.70 * deadline_pressure
        + 0.15 * density
        + 0.10 * _clamp(meeting_hours / 6.0)
        + 0.03 * _clamp(event_count / 6.0)
        + 0.02 * (1.0 if late_event else 0.0)
    )

    return {
        "date": target.isoformat(),
        "stress": round(stress, 4),
        "available_cooking_energy": round(1.0 - stress, 4),
        "free_evening": not late_event,
        "meeting_hours": round(meeting_hours, 2),
        "calendar_density": round(density, 4),
        "event_count": event_count,
        "hard_deadlines": sum(1 for dl in norm_deadlines if dl["date"] == target),
        "recommended_constraints": _recommended_constraints(stress),
    }


def extract_context(
    events: list[dict],
    today: date | None = None,
    horizon_days: int = 14,
    embed_fn: EmbedFn | None = None,
) -> dict:
    """Full pipeline: per-event classification, deadlines, per-day context.

    ``embed_fn`` (optional) enables embedding-assisted classification of titles
    the keyword pass can't place; without it the pipeline is pure keyword logic
    and fully deterministic.
    """
    today = today or date.today()
    horizon_days = max(0, horizon_days)

    categories = classify_events(events, embed_fn)

    norm_events = [
        n for n in (normalize_event(e, c) for e, c in zip(events, categories)) if n is not None
    ]
    deadlines = extract_deadlines(events, today, categories)
    norm_deadlines = [
        {"date": date.fromisoformat(d["date"]), "category": d["category"]}
        for d in deadlines
    ]

    # Per-event classification, aligned to the input order so the caller can map
    # results back onto its own events. Titles are not echoed back here — only
    # derived features (privacy).
    classified_events = []
    for i, (event, category) in enumerate(zip(events, categories)):
        start = _parse_dt(event.get("start"))
        ev_date = start.date() if start else None
        days_until = (ev_date - today).days if ev_date and ev_date >= today else None
        classified_events.append({
            "index": i,
            "date": ev_date.isoformat() if ev_date else None,
            "category": category,
            "event_type": event_type(category),
            "is_deadline": category in DEADLINE_CATEGORIES,
            "days_until": days_until,
            "urgency": _urgency(days_until) if days_until is not None else "low",
            "effort_hours": EVENT_EFFORT_HOURS.get(category, 0.0),
        })

    days = [
        daily_context(today + timedelta(days=offset), norm_events, norm_deadlines, horizon_days)
        for offset in range(horizon_days + 1)
    ]

    return {
        "today": today.isoformat(),
        "horizon_days": horizon_days,
        "deadlines": deadlines,
        "events": classified_events,
        "days": days,
    }
