"""Load tidy Eurostat CSV files bundled in data-pipeline/raw/.

Each file has the columns geo, year, value. They were exported from the
Eurostat Data Browser (or its publications) and committed so the build does
not depend on the API for these series.
"""

from __future__ import annotations

import csv
from pathlib import Path

from eurostat import _to_finite_float

RAW_DIR = Path(__file__).resolve().parent / "raw"


def load_raw_csv(filename: str) -> list[dict]:
    """Return rows of {'geo', 'time', 'value'} in the same shape as parse_jsonstat output."""
    rows = []
    with (RAW_DIR / filename).open(encoding="utf-8", newline="") as handle:
        for record in csv.DictReader(handle):
            value = _to_finite_float(record["value"])
            if value is None:
                continue
            rows.append({"geo": record["geo"], "time": record["year"], "value": value})
    return rows
