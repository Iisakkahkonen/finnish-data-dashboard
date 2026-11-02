"""Indicator definitions for the dashboard.

Each entry maps a human-readable indicator to a Eurostat dataset and the
filters that select one series. Dataset codes and dimension values below were
written from memory and MUST be verified on the Eurostat website
(https://ec.europa.eu/eurostat/databrowser) before the first real pull.
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
    unit_note: str = ""


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

GEOS = sorted(set(EU27 + PEERS + [EU_AGGREGATE]))

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
        filters={"unit": "RCH_A", "coicop": "CP00"},
        higher_is_better=False,
        unit_note="% change on previous year",
    ),
    Indicator(
        key="gdp_per_capita",
        label_en="GDP per capita (PPS)",
        label_fi="BKT asukasta kohden (PPS)",
        dataset="tec00114",
        filters={"unit": "PPS_EU27_2020_HAB"},
        higher_is_better=True,
        unit_note="purchasing power standard, EU27 = 100 basis per capita",
    ),
    Indicator(
        key="at_risk_of_poverty",
        label_en="At-risk-of-poverty rate (60% of median)",
        label_fi="Köyhyysriski (60 % mediaanitulosta)",
        dataset="ilc_li02",
        filters={"unit": "PC", "sex": "T", "age": "TOTAL", "indic_il": "LI_R_MD60"},
        higher_is_better=False,
        unit_note="% of population",
    ),
]
