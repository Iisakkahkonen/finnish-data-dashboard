"""Load life expectancy at birth from the bundled CSV.

Source: Eurostat, "Mortality and life expectancy statistics", table 1, total
population (exported to data-pipeline/raw/life-expectancy-total.csv). The table
only has the years 1980, 1990, 2000, 2010, 2023 and 2024.
"""

from __future__ import annotations

import csv
from pathlib import Path

from eurostat import _to_finite_float

RAW_FILE = Path(__file__).resolve().parent / "raw" / "life-expectancy-total.csv"


def load_life_expectancy_rows() -> list[dict]:
    """Return rows of {'geo', 'time', 'value'} in the same shape as parse_jsonstat output."""
    rows = []
    with RAW_FILE.open(encoding="utf-8", newline="") as handle:
        for record in csv.DictReader(handle):
            value = _to_finite_float(record["value"])
            if value is None:
                continue
            rows.append({"geo": record["geo"], "time": record["year"], "value": value})
    return rows
