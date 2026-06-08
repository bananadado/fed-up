"""Canonical text values shared by API validation and recommendation filters."""

from collections.abc import Iterable


TAG_ALIASES = {
    "peanuts": "peanut",
    "eggs": "egg",
}


def canonical_tag(value: object) -> str:
    text = str(value).strip().lower()
    text = " ".join(text.split())
    return TAG_ALIASES.get(text, text)


def canonical_tags(values: object) -> list[str]:
    if values is None:
        return []
    if isinstance(values, str):
        raw_values: Iterable[object] = [values]
    elif isinstance(values, Iterable):
        raw_values = values
    else:
        raw_values = [values]

    tags: list[str] = []
    seen: set[str] = set()
    for value in raw_values:
        tag = canonical_tag(value)
        if tag and tag not in seen:
            tags.append(tag)
            seen.add(tag)
    return tags
