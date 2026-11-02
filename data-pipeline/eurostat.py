"""Fetch and parse Eurostat datasets in JSON-stat 2.0 format."""

from __future__ import annotations

import requests

BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
TIMEOUT_SECONDS = 60


def build_params(filters: dict, geos: list[str]) -> list[tuple[str, str]]:
    """Return query parameters as a list so repeated geo= values are kept."""
    params = [("format", "JSON"), ("lang", "EN")]
    params += [(dim, code) for dim, code in filters.items()]
    params += [("geo", geo) for geo in geos]
    return params


def fetch_dataset(dataset: str, filters: dict, geos: list[str]) -> dict:
    response = requests.get(
        f"{BASE_URL}/{dataset}",
        params=build_params(filters, geos),
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def parse_jsonstat(payload: dict) -> list[dict]:
    """Flatten a JSON-stat dataset into rows of {dimension: code, ..., 'value': x}.

    Eurostat stores values in a flat array (or a sparse dict keyed by string
    index). The position of each value is a mixed-radix number over the
    dimensions in payload['id'], with the last dimension varying fastest.
    """
    dims: list[str] = payload["id"]
    sizes: list[int] = payload["size"]

    # Map each dimension position back to its category code.
    code_at: dict[str, dict[int, str]] = {}
    for dim in dims:
        index = payload["dimension"][dim]["category"]["index"]
        if isinstance(index, dict):
            code_at[dim] = {pos: code for code, pos in index.items()}
        else:  # list: position == list index
            code_at[dim] = {pos: code for pos, code in enumerate(index)}

    values = payload["value"]
    if isinstance(values, dict):
        items = ((int(k), v) for k, v in values.items())
    else:
        items = enumerate(values)

    rows = []
    for flat_index, value in items:
        if value is None:
            continue
        row = {}
        remainder = flat_index
        for dim, size in reversed(list(zip(dims, sizes))):
            position = remainder % size
            remainder //= size
            row[dim] = code_at[dim][position]
        row["value"] = float(value)
        rows.append(row)
    return rows


def fetch_indicator_rows(dataset: str, filters: dict, geos: list[str]) -> list[dict]:
    return parse_jsonstat(fetch_dataset(dataset, filters, geos))
