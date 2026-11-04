"""Indicator definitions for the dashboard.

Each entry maps a human-readable indicator to its source: a Eurostat dataset
and the filters that select one series, or a bundled CSV in data-pipeline/raw/.
Dataset codes and filters were checked in the Eurostat Data Browser.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Indicator:
    key: str                  # stable id used in JSON output and URLs
    label_en: str
    label_fi: str
    dataset: str              # Eurostat dataset code
    filters: dict = field(default_factory=dict)  # dimension -> code
    higher_is_better: bool = True  # used for rank charts
    target: float | None = None  # if set, rank by distance from this value instead
    unit_note: str = ""
    source: str = "eurostat"  # "eurostat" or "pisa" (bundled CSV, see pisa.py)


# Finland, peers, and the EU aggregate. Eurostat geo codes.
FOCUS_COUNTRY = "FI"
PEERS = ["SE", "DK", "NO", "AT"]
EU_AGGREGATE = "EU27_2020"

# All EU27 members, for rank-over-time. Greece is "EL" in Eurostat.
EU27 = [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "EL",
    "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
    "SI", "ES", "SE",
]

# Non-EU European countries pulled for comparison. Not part of the EU27 ranking.
OTHER_EUROPEAN = ["IS"]

GEOS = sorted(set(EU27 + PEERS + OTHER_EUROPEAN + [EU_AGGREGATE]))

INDICATORS = [
    Indicator(
        key="unemployment",
        label_en="Unemployment rate, 15-74",
        label_fi="Työttömyysaste, 15–74-vuotiaat",
        dataset="une_rt_a",
        filters={"unit": "PC_ACT", "sex": "T", "age": "Y15-74"},
        higher_is_better=False,
        unit_note="% of active population",
    ),
    Indicator(
        key="inflation",
        label_en="HICP inflation, annual rate",
        label_fi="Kuluttajahintojen inflaatio (HICP), vuosimuutos",
        dataset="prc_hicp_aind",
        filters={"unit": "RCH_A_AVG", "coicop": "CP00"},
        higher_is_better=False,
        target=2.0,  # central bank target; closest to 2% ranks first
        unit_note="% change on previous year",
    ),
    Indicator(
        key="gdp_per_capita",
        label_en="GDP per capita in PPS (EU27 = 100)",
        label_fi="BKT asukasta kohden PPS (EU27 = 100)",
        dataset="tec00114",
        filters={"indic_ppp": "VI_PPS_EU27_2020_HAB", "ppp_cat18": "GDP"},
        higher_is_better=True,
        unit_note="volume index, EU27 = 100",
    ),
    Indicator(
        key="government_debt",
        label_en="General government gross debt (% of GDP)",
        label_fi="Julkinen velka (% BKT:sta)",
        dataset="gov_10dd_edpt1",
        filters={"unit": "PC_GDP", "sector": "S13", "na_item": "GD"},
        higher_is_better=False,  # a simplification; the explanation says so
        unit_note="consolidated gross debt (Maastricht definition), % of GDP",
    ),
    Indicator(
        key="at_risk_of_poverty",
        label_en="At-risk-of-poverty rate (60% of median)",
        label_fi="Köyhyysriski (60 % mediaanitulosta)",
        dataset="ilc_li02",
        filters={"unit": "PC", "sex": "T", "age": "TOTAL", "rskpovth": "B_60"},
        higher_is_better=False,
        unit_note="% of population",
    ),
    Indicator(
        key="pisa_math",
        label_en="PISA mathematics mean score (age 15)",
        label_fi="PISA-matematiikan keskiarvo (15-vuotiaat)",
        dataset="",  # not used for PISA; data comes from raw/pisa-scores.csv
        filters={},
        higher_is_better=True,
        unit_note="mean score on the PISA scale; 2003 to 2022",
        source="pisa",
    ),
    Indicator(
        key="pisa_reading",
        label_en="PISA reading mean score (age 15)",
        label_fi="PISA-lukutaidon keskiarvo (15-vuotiaat)",
        dataset="",
        filters={"subject": "reading"},
        higher_is_better=True,
        unit_note="mean score on the PISA scale; 2003 to 2022",
        source="pisa",
    ),
    Indicator(
        key="pisa_science",
        label_en="PISA science mean score (age 15)",
        label_fi="PISA-luonnontieteiden keskiarvo (15-vuotiaat)",
        dataset="",
        filters={"subject": "science"},
        higher_is_better=True,
        unit_note="mean score on the PISA scale; 2003 to 2022",
        source="pisa",
    ),
    Indicator(
        key="tertiary_attainment",
        label_en="Tertiary educational attainment, ages 25–34 (%)",
        label_fi="Korkeakoulutettujen osuus, 25–34-vuotiaat (%)",
        dataset="edat_lfse_03",
        filters={"sex": "T", "age": "Y25-34", "isced11": "ED5-8", "unit": "PC"},
        higher_is_better=True,
        unit_note="% of people aged 25-34 with a tertiary degree (ISCED 5-8)",
    ),
    Indicator(
        key="life_expectancy",
        label_en="Life expectancy at birth (years)",
        label_fi="Elinajanodote syntyessä (vuotta)",
        dataset="",
        filters={"file": "life-expectancy.csv"},
        higher_is_better=True,
        unit_note="years, total population, annual",
        source="csv",
    ),
    Indicator(
        key="gini",
        label_en="Gini coefficient of equivalised income (0–100)",
        label_fi="Gini-kerroin, ekvivalentti tulo (0–100)",
        dataset="",
        filters={"file": "gini.csv"},
        higher_is_better=False,
        unit_note="scale 0 to 100; higher means more unequal income",
        source="csv",
    ),
    Indicator(
        key="median_income_pps",
        label_en="Median equivalised net income (PPS)",
        label_fi="Mediaanitulo, ekvivalentti (PPS)",
        dataset="",
        filters={"file": "median-income-pps.csv"},
        higher_is_better=True,
        unit_note="PPS per person per year, total population",
        source="csv",
    ),
    Indicator(
        key="median_income_eur",
        label_en="Median equivalised net income (EUR)",
        label_fi="Mediaanitulo, ekvivalentti (euroa)",
        dataset="",
        filters={"file": "median-income-eur.csv"},
        higher_is_better=True,
        unit_note="euro per person per year, total population",
        source="csv",
    ),
]
