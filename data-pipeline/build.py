"""Pull the indicators from Eurostat and write one tidy JSON file.

Usage (from the repo root):
    python data-pipeline/build.py
Output: data/indicators.json
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

if __package__ in (None, ""):
    # Allow running as `python data-pipeline/build.py` from the repo root.
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from analysis import rank_by_year, to_records  # noqa: E402
from eurostat import fetch_indicator_rows  # noqa: E402
from lifeexp import load_life_expectancy_rows  # noqa: E402
from pisa import load_pisa_rows  # noqa: E402
from indicators import EU27, GEOS, INDICATORS  # noqa: E402

OUTPUT = Path(__file__).resolve().parent.parent / "data" / "indicators.json"
SOURCE = "Eurostat"
PISA_SOURCE = "OECD PISA via World Bank EdStats (CC BY 4.0)"
EU27_SET = set(EU27)


def build() -> dict:
    updated = date.today().isoformat()
    records: list[dict] = []
    ranks: dict[str, dict] = {}

    for indicator in INDICATORS:
        if indicator.source == "pisa":
            print(f"Reading {indicator.key} from bundled CSV...", flush=True)
            rows = load_pisa_rows(indicator.filters.get("subject", "mathematics"))
        elif indicator.source == "lifeexp":
            print(f"Reading {indicator.key} from bundled CSV...", flush=True)
            rows = load_life_expectancy_rows()
        else:
            print(f"Fetching {indicator.key} ({indicator.dataset})...", flush=True)
            rows = fetch_indicator_rows(indicator.dataset, indicator.filters, GEOS)
        # Keep only annual values; the datasets used here are annual already.
        rows = [r for r in rows if "time" in r and len(r["time"]) == 4]
        if not rows:
            raise RuntimeError(f"No rows returned for {indicator.key}; check dataset codes")

        source_label = PISA_SOURCE if indicator.source == "pisa" else SOURCE
        records += to_records(rows, indicator.key, source_label, updated)
        eu_rows = [r for r in rows if r["geo"] in EU27_SET]
        ranks[indicator.key] = rank_by_year(eu_rows, indicator.higher_is_better)

    return {"updated": updated, "source": SOURCE, "records": records, "ranks": ranks}


def main() -> None:
    result = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(result['records'])} records to {OUTPUT}")


if __name__ == "__main__":
    main()
