"""Load PISA mean scores from the bundled CSV.

Source: OECD PISA results, as mirrored by the World Bank EdStats data (CC BY 4.0).
The files are committed in data-pipeline/raw/ so the build does not depend on an
outside download:
- pisa-scores.csv: 2000 to 2018, from the DataHub mirror above.
- pisa-2022-and-oecd-averages.csv: the 2022 mathematics means and the OECD average
  for 2003 to 2022, transcribed from the OECD PISA report tables (PISA 2003 to 2022).
  Luxembourg is missing because it does not appear in the extracted 2022 tables.
"""

from __future__ import annotations

import csv
from pathlib import Path

from eurostat import _to_finite_float

RAW_DIR = Path(__file__).resolve().parent / "raw"
RAW_FILES = [RAW_DIR / "pisa-scores.csv", RAW_DIR / "pisa-2022-and-oecd-averages.csv"]

# PISA used ISO 3166 alpha-3 codes. Map them to the Eurostat-style codes the
# rest of the pipeline uses. Countries not listed here are left out.
ISO3_TO_GEO = {
    "AUT": "AT", "BEL": "BE", "BGR": "BG", "HRV": "HR", "CYP": "CY",
    "CZE": "CZ", "DNK": "DK", "EST": "EE", "FIN": "FI", "FRA": "FR",
    "DEU": "DE", "GRC": "EL", "HUN": "HU", "ISL": "IS", "IRL": "IE",
    "ITA": "IT", "LVA": "LV", "LTU": "LT", "LUX": "LU", "MLT": "MT",
    "NLD": "NL", "NOR": "NO", "POL": "PL", "PRT": "PT", "ROU": "RO",
    "SVK": "SK", "SVN": "SI", "ESP": "ES", "SWE": "SE",
    # Non-European countries that take PISA but are not in the Eurostat data.
    "ALB": "AL", "DZA": "DZ", "ARG": "AR", "AUS": "AU", "AZE": "AZ", "BLR": "BY",
    "BIH": "BA", "BRA": "BR", "BRN": "BN", "CAN": "CA", "CHL": "CL", "CHN": "CN",
    "COL": "CO", "CRI": "CR", "DOM": "DO", "GEO": "GE", "HKG": "HK", "IDN": "ID",
    "ISR": "IL", "JPN": "JP", "JOR": "JO", "KAZ": "KZ", "KOR": "KR", "XKX": "XK",
    "KGZ": "KG", "LBN": "LB", "LIE": "LI", "MAC": "MO", "MYS": "MY", "MUS": "MU",
    "MEX": "MX", "MDA": "MD", "MNE": "ME", "MAR": "MA", "NZL": "NZ", "MKD": "MK",
    "PAN": "PA", "PER": "PE", "PHL": "PH", "QAT": "QA", "RUS": "RU", "SAU": "SA",
    "SRB": "RS", "SGP": "SG", "CHE": "CH", "THA": "TH", "TTO": "TT", "TUN": "TN",
    "TUR": "TR", "UKR": "UA", "ARE": "AE", "GBR": "GB", "USA": "US", "URY": "UY",
    "VNM": "VN", "MNG": "MN", "UZB": "UZ", "GTM": "GT", "SLV": "SV", "PRY": "PY",
    "KHM": "KH", "TWN": "TW", "PSE": "PS",
}

# The OECD average appears in the file as "OECD members" with this code.
OECD_CODE = "OED"
OECD_GEO = "OECD"

# Mathematics was a major domain only from 2003 on. Earlier scores are not
# comparable with the later rounds.
FIRST_COMPARABLE_YEAR = 2003


def load_pisa_rows(subject: str = "mathematics") -> list[dict]:
    """Return rows of {'geo', 'time', 'value'} in the same shape as parse_jsonstat output."""
    rows = []
    for raw_file in RAW_FILES:
        with raw_file.open(encoding="utf-8", newline="") as handle:
            for record in csv.DictReader(handle):
                if record["subject"] != subject:
                    continue
                year = int(record["year"])
                if year < FIRST_COMPARABLE_YEAR:
                    continue

                code = record["country_code"]
                if code == OECD_CODE:
                    geo = OECD_GEO
                elif code in ISO3_TO_GEO:
                    geo = ISO3_TO_GEO[code]
                else:
                    continue

                value = _to_finite_float(record["mean_score"])
                if value is None:
                    continue
                rows.append({"geo": geo, "time": str(year), "value": value})
    return rows
