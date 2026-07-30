from __future__ import annotations

import asyncio
import csv
import io
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any
from xml.etree import ElementTree

import httpx


MINIMAX_PRICING_URL = "https://platform.minimax.io/docs/guides/pricing-paygo"
VIETCOMBANK_URL = "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx"
AGRIBANK_URL = "https://www.agribank.com.vn/vn/ty-gia"
ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=csvdata"
EXCHANGE_SOURCES = {
    "vietcombank": {
        "id": "vietcombank",
        "label": "Vietcombank",
        "currencies": ["VND"],
        "url": "https://www.vietcombank.com.vn/vi-VN/To-chuc/Trang-chu-DCTC/KHTC---Ti-gia---DCTC",
    },
    "agribank": {"id": "agribank", "label": "Agribank", "currencies": ["VND"], "url": AGRIBANK_URL},
    "ecb": {"id": "ecb", "label": "ECB", "currencies": ["EUR"], "url": "https://data.ecb.europa.eu/"},
}
_cache: dict[str, tuple[float, str]] = {}
_cache_lock = asyncio.Lock()


class SuggestionError(ValueError):
    pass


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self.text: list[str] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, _: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []
        elif tag == "br" and self._cell is not None:
            self._cell.append(" ")

    def handle_data(self, data: str) -> None:
        self.text.append(data)
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._row is not None and self._cell is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None


def _fetched_at() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_text(url: str) -> str:
    cached = _cache.get(url)
    if cached and time.monotonic() - cached[0] < 900:
        return cached[1]
    async with _cache_lock:
        cached = _cache.get(url)
        if cached and time.monotonic() - cached[0] < 900:
            return cached[1]
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=10, headers={"User-Agent": "IntellidocOCR/0.2"}) as client:
                response = await client.get(url)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise SuggestionError("suggestion_source_unavailable") from exc
        if len(response.content) > 2 * 1024 * 1024:
            raise SuggestionError("suggestion_source_unavailable")
        _cache[url] = (time.monotonic(), response.text)
        return response.text


def _current_price(cell: str) -> float:
    values = re.findall(r"\$(\d+(?:\.\d+)?)", cell)
    if not values:
        raise SuggestionError("model_price_unavailable")
    return float(values[-1])


def parse_minimax_price(content: str, model: str) -> dict[str, Any]:
    parser = _TableParser()
    parser.feed(content)
    wanted = model.casefold()
    for row in parser.rows:
        row_model = re.split(r"[\s(（]", row[0], maxsplit=1)[0].casefold()
        if len(row) < 4 or row_model != wanted:
            continue
        if wanted == "minimax-m3" and "512k" in row[0] and not any(mark in row[0] for mark in ("≤", "<=", "â‰¤")):
            continue
        return {
            "billing_currency": "USD",
            "input_per_million": _current_price(row[1]),
            "output_per_million": _current_price(row[2]),
            "cached_per_million": _current_price(row[3]),
            "maximum_input_tokens": 512_000 if wanted == "minimax-m3" and "512k" in row[0] else None,
            "price_basis": "standard pay-as-you-go" + ("; input <= 512k tokens" if wanted == "minimax-m3" else ""),
        }
    raise SuggestionError("model_price_unavailable")


def parse_vietcombank_quote(content: str, currency: str = "USD") -> dict[str, Any]:
    try:
        root = ElementTree.fromstring(content)
        item = next(node for node in root.iter() if node.attrib.get("CurrencyCode") == currency)
        rate = float(item.attrib["Sell"].replace(",", ""))
    except (ElementTree.ParseError, StopIteration, KeyError, ValueError) as exc:
        raise SuggestionError("exchange_source_unavailable") from exc
    return {"display_currency": "VND", "exchange_rate": rate, "rate_kind": "sell", "source_time": root.attrib.get("DateTime")}


def parse_agribank_quote(content: str, currency: str = "USD") -> dict[str, Any]:
    parser = _TableParser()
    parser.feed(content)
    try:
        row = next(row for row in parser.rows if row and row[0].strip() == currency)
        rate = float(row[-1].replace(",", ""))
    except (StopIteration, ValueError) as exc:
        raise SuggestionError("exchange_source_unavailable") from exc
    plain = " ".join(" ".join(parser.text).split())
    source_time = (re.search(r"(\d{1,2}:\d{2}\s+ngày\s+\d{1,2}/\d{1,2}/\d{4})", plain) or [None])[0]
    return {"display_currency": "VND", "exchange_rate": rate, "rate_kind": "sell", "source_time": source_time}


def parse_ecb_quote(content: str) -> dict[str, Any]:
    try:
        row = next(csv.DictReader(io.StringIO(content)))
        rate = 1 / float(row["OBS_VALUE"])
    except (StopIteration, KeyError, ValueError, ZeroDivisionError) as exc:
        raise SuggestionError("exchange_source_unavailable") from exc
    return {"display_currency": "EUR", "exchange_rate": rate, "rate_kind": "reference", "source_time": row.get("TIME_PERIOD")}


async def exchange_quote(source_id: str) -> dict[str, Any]:
    if source_id not in EXCHANGE_SOURCES:
        raise SuggestionError("invalid_exchange_source")
    if source_id == "vietcombank":
        quote = parse_vietcombank_quote(await _get_text(VIETCOMBANK_URL))
    elif source_id == "agribank":
        quote = parse_agribank_quote(await _get_text(AGRIBANK_URL))
    else:
        quote = parse_ecb_quote(await _get_text(ECB_URL))
    return {
        **quote,
        "source_id": source_id,
        "source_url": EXCHANGE_SOURCES[source_id]["url"],
        "fetched_at": _fetched_at(),
    }


async def price_suggestion(provider_profile_id: str, model: str, exchange_source: str) -> dict[str, Any]:
    if not model.casefold().startswith("minimax-"):
        raise SuggestionError("model_price_unavailable")
    price = parse_minimax_price(await _get_text(MINIMAX_PRICING_URL), model)
    quote = await exchange_quote(exchange_source)
    fetched_at = _fetched_at()
    return {
        "provider_profile_id": provider_profile_id,
        "model": model,
        **price,
        "price_source": "minimax",
        "price_source_url": MINIMAX_PRICING_URL,
        "price_fetched_at": fetched_at,
        "exchange_source": exchange_source,
        "display_currency": quote["display_currency"],
        "exchange_rate": quote["exchange_rate"],
        "exchange_rate_kind": quote["rate_kind"],
        "exchange_source_url": quote["source_url"],
        "exchange_source_time": quote["source_time"],
        "exchange_fetched_at": quote["fetched_at"],
    }
