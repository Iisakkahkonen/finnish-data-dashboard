import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analysis import rank_by_year, to_records  # noqa: E402
from eurostat import build_params, parse_jsonstat  # noqa: E402

# Two countries x two years, flat array with geo as the slow dimension.
SAMPLE = {
    "id": ["geo", "time"],
    "size": [2, 2],
    "dimension": {
        "geo": {"category": {"index": {"FI": 0, "SE": 1}}},
        "time": {"category": {"index": {"2022": 0, "2023": 1}}},
    },
    "value": {"0": 7.0, "1": 7.5, "2": 6.5, "3": None},
}


def test_parse_jsonstat_decodes_positions_and_skips_nulls():
    rows = parse_jsonstat(SAMPLE)
    got = {(r["geo"], r["time"], r["value"]) for r in rows}
    assert got == {("FI", "2022", 7.0), ("FI", "2023", 7.5), ("SE", "2022", 6.5)}


def test_parse_jsonstat_drops_nan_inf_and_text_values():
    payload = dict(SAMPLE)
    payload["value"] = {"0": float("nan"), "1": float("inf"), "2": ":", "3": 6.1}
    rows = parse_jsonstat(payload)
    assert rows == [{"geo": "SE", "time": "2023", "value": 6.1}]


def test_parse_jsonstat_accepts_list_index():
    payload = dict(SAMPLE)
    payload["dimension"] = {
        "geo": {"category": {"index": ["FI", "SE"]}},
        "time": {"category": {"index": ["2022", "2023"]}},
    }
    assert len(parse_jsonstat(payload)) == 3


def test_rank_higher_is_worse_for_unemployment():
    rows = [
        {"geo": "FI", "time": "2023", "value": 7.5},
        {"geo": "SE", "time": "2023", "value": 7.7},
        {"geo": "AT", "time": "2023", "value": 5.0},
    ]
    ranks = rank_by_year(rows, higher_is_better=False)
    assert ranks["AT"][2023] == 1
    assert ranks["FI"][2023] == 2
    assert ranks["SE"][2023] == 3


def test_rank_higher_is_better_for_gdp():
    rows = [
        {"geo": "FI", "time": "2023", "value": 90.0},
        {"geo": "SE", "time": "2023", "value": 110.0},
    ]
    ranks = rank_by_year(rows, higher_is_better=True)
    assert ranks["SE"][2023] == 1
    assert ranks["FI"][2023] == 2


def test_build_params_keeps_repeated_geo():
    params = build_params({"unit": "PC_ACT"}, ["FI", "SE"])
    assert ("geo", "FI") in params and ("geo", "SE") in params


def test_pisa_loader_uses_comparable_years_and_known_codes():
    from pisa import load_pisa_rows

    rows = load_pisa_rows()
    years = {int(r["time"]) for r in rows}
    geos = {r["geo"] for r in rows}

    assert min(years) == 2003 and max(years) == 2022  # no 2000
    assert "FI" in geos and "SE" in geos and "OECD" in geos
    assert all(len(g) == 2 or g == "OECD" for g in geos)  # no raw ISO3 codes leak through
    finland_2003 = [r["value"] for r in rows if r["geo"] == "FI" and r["time"] == "2003"]
    assert finland_2003 == [544.3]
    finland_2022 = [r["value"] for r in rows if r["geo"] == "FI" and r["time"] == "2022"]
    assert finland_2022 == [484.0]
    oecd_2022 = [r["value"] for r in rows if r["geo"] == "OECD" and r["time"] == "2022"]
    assert oecd_2022 == [472.0]


def test_to_records_shape():
    rows = [{"geo": "FI", "time": "2023", "value": 7.5}]
    records = to_records(rows, "unemployment", "Eurostat", "2026-11-02")
    assert records == [
        {
            "indicator": "unemployment",
            "geo": "FI",
            "year": 2023,
            "value": 7.5,
            "source": "Eurostat",
            "updated": "2026-11-02",
        }
    ]
