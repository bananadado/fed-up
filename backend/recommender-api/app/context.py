"""Calendar deadline extraction & daily-context inference (issue #65).

This is a *context inference pipeline*, not just calendar parsing: it classifies
events, extracts academic deadlines, and estimates each day's time pressure /
available cooking energy so the recommender can adapt (the ``deadline_stress``
input to ``/recommend``).

Everything is pure and deterministic — a ``today`` reference date can be passed
in — so it is fully unit-testable without a clock, DB, or network. Only derived
features are returned; raw event titles are never persisted (privacy).
"""

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

WAKING_HOURS = 16.0
EVENING_HOUR = 18  # events at/after this hour eat into cooking time
WORK_SHIFT_HOURS = 6.0  # long timed events are treated as work shifts


def classify_event(title: str, duration_hours: float = 0.0) -> str:
    t = (title or "").lower()
    for category, words in CATEGORY_KEYWORDS:
        if any(w in t for w in words):
            return category
    if duration_hours >= WORK_SHIFT_HOURS:
        return "work_shift"
    return "generic"


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


def normalize_event(event: dict) -> dict | None:
    """Turn a raw calendar event into derived features. Returns None if undated."""
    start = _parse_dt(event.get("start"))
    if start is None:
        return None
    end = _parse_dt(event.get("end"))
    all_day = bool(event.get("all_day"))

    duration_hours = 0.0
    if end and end > start and not all_day:
        duration_hours = (end - start).total_seconds() / 3600.0

    category = classify_event(event.get("title", ""), duration_hours)
    return {
        "title": event.get("title", ""),
        "date": start.date(),
        "start_hour": None if all_day else start.hour,
        "duration_hours": duration_hours,
        "all_day": all_day,
        "category": category,
        "is_deadline": category in DEADLINE_CATEGORIES,
    }


# ── Deadline extraction ──────────────────────────────────────────────────────

def _urgency(days_until: int) -> str:
    if days_until <= 1:
        return "high"
    if days_until <= 3:
        return "medium"
    return "low"


def extract_deadlines(events: list[dict], today: date) -> list[dict]:
    """Future academic deadlines/exams, sorted by date."""
    deadlines = []
    for event in events:
        norm = normalize_event(event)
        if norm is None or not norm["is_deadline"]:
            continue
        if norm["date"] < today:
            continue
        days_until = (norm["date"] - today).days
        deadlines.append({
            "title": norm["title"],
            "date": norm["date"].isoformat(),
            "category": norm["category"],
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


def extract_context(events: list[dict], today: date | None = None, horizon_days: int = 14) -> dict:
    """Full pipeline: classified deadlines + per-day context over the horizon."""
    today = today or date.today()
    horizon_days = max(0, horizon_days)

    norm_events = [n for n in (normalize_event(e) for e in events) if n is not None]
    norm_deadlines = [
        {"date": date.fromisoformat(d["date"]), "category": d["category"]}
        for d in extract_deadlines(events, today)
    ]
    deadlines = extract_deadlines(events, today)

    days = [
        daily_context(today + timedelta(days=offset), norm_events, norm_deadlines, horizon_days)
        for offset in range(horizon_days + 1)
    ]

    return {
        "today": today.isoformat(),
        "horizon_days": horizon_days,
        "deadlines": deadlines,
        "days": days,
    }
