"""Derived views: rank among EU27 members, and tidy output records."""

from __future__ import annotations

from collections import defaultdict


def rank_by_year(rows: list[dict], higher_is_better: bool) -> dict[str, dict[int, int]]:
    """Rank each geo among the countries present in `rows`, per year.

    `rows` are dicts with keys 'geo', 'time' (year string), and 'value'.
    Rank 1 is best. Returns {geo: {year: rank}}.
    """
    by_year: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for row in rows:
        by_year[row["time"]].append((row["geo"], row["value"]))

    ranks: dict[str, dict[int, int]] = defaultdict(dict)
    for year, pairs in by_year.items():
        ordered = sorted(pairs, key=lambda p: p[1], reverse=higher_is_better)
        for position, (geo, _) in enumerate(ordered, start=1):
            ranks[geo][int(year)] = position
    return dict(ranks)


def to_records(rows: list[dict], indicator_key: str, source: str, updated: str) -> list[dict]:
    """Convert Eurostat rows to the tidy shape written to data/indicators.json."""
    return [
        {
            "indicator": indicator_key,
            "geo": row["geo"],
            "year": int(row["time"]),
            "value": row["value"],
            "source": source,
            "updated": updated,
        }
        for row in rows
    ]
