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


def test_pisa_subjects_load_separately():
    from pisa import load_pisa_rows

    reading = load_pisa_rows("reading")
    science = load_pisa_rows("science")
    fi_2022_reading = [r["value"] for r in reading if r["geo"] == "FI" and r["time"] == "2022"]
    fi_2022_science = [r["value"] for r in science if r["geo"] == "FI" and r["time"] == "2022"]
    assert fi_2022_reading == [490.0]
    assert fi_2022_science == [511.0]
    assert {r["geo"] for r in reading} == {r["geo"] for r in load_pisa_rows("mathematics")}


def test_former_csv_indicators_fetch_from_eurostat():
    # Codes and filters confirmed against the Eurostat API on 2026-11-04; for
    # Finland they reproduce the values of the CSV exports they replace.
    from indicators import INDICATORS

    by_key = {i.key: i for i in INDICATORS}
    expected = {
        "life_expectancy": ("demo_mlexpec", {"unit": "YR", "sex": "T", "age": "Y_LT1"}),
        "gini": ("ilc_di12", {"age": "TOTAL", "statinfo": "GINI_HND"}),
        "median_income_pps": ("ilc_di03", {"age": "TOTAL", "sex": "T", "statinfo": "MED_EI", "unit": "PPS"}),
        "median_income_eur": ("ilc_di03", {"age": "TOTAL", "sex": "T", "statinfo": "MED_EI", "unit": "EUR"}),
    }
    for key, (dataset, filters) in expected.items():
        indicator = by_key[key]
        assert indicator.source == "eurostat", key
        assert indicator.dataset == dataset and indicator.filters == filters, key


def test_only_pisa_uses_bundled_files():
    from indicators import INDICATORS

    assert {i.source for i in INDICATORS} == {"eurostat", "pisa"}
    for indicator in INDICATORS:
        if indicator.source == "eurostat":
            assert indicator.dataset, indicator.key


def test_rank_by_distance_from_target():
    rows = [
        {"geo": "A", "time": "2024", "value": 2.2},
        {"geo": "B", "time": "2024", "value": -0.5},
        {"geo": "C", "time": "2024", "value": 1.9},
        {"geo": "D", "time": "2024", "value": 6.0},
    ]
    ranks = rank_by_year(rows, higher_is_better=False, target=2.0)
    assert [g for g, _ in sorted(ranks.items(), key=lambda kv: kv[1][2024])] == ["C", "A", "B", "D"]


def test_pisa_subjects_start_where_their_scale_starts():
    from pisa import load_pisa_rows

    assert min(int(r["time"]) for r in load_pisa_rows("reading")) == 2000
    assert min(int(r["time"]) for r in load_pisa_rows("mathematics")) == 2003
    assert min(int(r["time"]) for r in load_pisa_rows("science")) == 2006



def test_debt_and_tertiary_indicators_use_confirmed_codes():
    # Codes and filters confirmed against the Eurostat API on 2026-11-04.
    from indicators import INDICATORS

    by_key = {i.key: i for i in INDICATORS}
    debt = by_key["government_debt"]
    assert debt.dataset == "gov_10dd_edpt1"
    assert debt.filters == {"unit": "PC_GDP", "sector": "S13", "na_item": "GD"}
    assert debt.higher_is_better is False and debt.source == "eurostat"

    tertiary = by_key["tertiary_attainment"]
    assert tertiary.dataset == "edat_lfse_03"
    assert tertiary.filters == {"sex": "T", "age": "Y25-34", "isced11": "ED5-8", "unit": "PC"}
    assert tertiary.higher_is_better is True and tertiary.source == "eurostat"


def test_every_indicator_has_text_in_both_languages():
    import json

    from indicators import INDICATORS

    i18n = Path(__file__).resolve().parents[2] / "web" / "src" / "i18n"
    for name in ("en.json", "fi.json"):
        text = json.loads((i18n / name).read_text(encoding="utf-8"))
        for indicator in INDICATORS:
            assert indicator.key in text["indicators"], (name, indicator.key)
            assert indicator.key in text["explain"], (name, indicator.key)
            assert indicator.key in text["gapUnits"], (name, indicator.key)


def test_poverty_rate_uses_the_median_threshold():
    # ilc_li02 also holds the share below 60% of the MEAN income. Without
    # statinfo pinned, both series came back mixed (FI 2024: 12.6 vs 18.2).
    from indicators import INDICATORS

    poverty = {i.key: i for i in INDICATORS}["at_risk_of_poverty"]
    assert poverty.filters["statinfo"] == "MED_EI"
    assert poverty.filters["rskpovth"] == "B_60"
