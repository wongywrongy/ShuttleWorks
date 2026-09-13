"""The controlled ``representation`` vocabulary (D4 / O4).

**What the field means.** ``representation`` is the association a player
COMPETES for at this event — the "Representing" line a BWF fixture prints
next to a name. It is deliberately **not** citizenship, not residency and
not a club: a player's competition association is an entry-time fact that a
tournament records, and it can differ between two events in the same season.
That is why the code is stored per workspace (on ``entry_players`` and on the
roster row), never on a cross-tournament person — the same human keeps one
identity and carries a different, historically accurate representation in each
workspace they appear in.

**Unknown has no flag.** ``None`` (absent / empty) *is* Unknown. A boolean
beside the code would be a second source of truth that can disagree with it,
and "we were not told" is exactly what a nullable column already says. Callers
render :data:`UNKNOWN_LABEL` for ``None``.

**The vocabulary.** BWF member-association codes, which are ISO 3166-1
alpha-3 for most members and deliberately are not for the ones badminton
counts separately (``ENG``/``SCO``/``WAL``, ``TPE``, ``HKG``). It is a
CONTROLLED list — an unlisted code is rejected with a 422 rather than stored,
because a free-text country column is what this field exists to replace.
Extending it is a one-line edit here; that is the intended maintenance path.

Lives in ``core/`` rather than ``shared/`` because ``core.schemas`` (the DTOs
that validate the field) may not import ``shared`` — the kernel-direction
import contract. It is a vocabulary with no domain logic, which is what the
kernel already holds (``core.constants``).
"""
from __future__ import annotations

from typing import Optional

#: What a caller renders when the code is ``None``.
UNKNOWN_LABEL = "Unknown"

#: code -> display name. BWF member associations (a curated set covering the
#: five confederations); add a row when a real entrant needs one.
REPRESENTATIONS: dict[str, str] = {
    "ALG": "Algeria",
    "ARG": "Argentina",
    "ARM": "Armenia",
    "AUS": "Australia",
    "AUT": "Austria",
    "AZE": "Azerbaijan",
    "BAN": "Bangladesh",
    "BAR": "Barbados",
    "BEL": "Belgium",
    "BLR": "Belarus",
    "BRA": "Brazil",
    "BUL": "Bulgaria",
    "CAN": "Canada",
    "CHI": "Chile",
    "CHN": "China",
    "COL": "Colombia",
    "CRO": "Croatia",
    "CUB": "Cuba",
    "CYP": "Cyprus",
    "CZE": "Czechia",
    "DEN": "Denmark",
    "DOM": "Dominican Republic",
    "ECU": "Ecuador",
    "EGY": "Egypt",
    "ENG": "England",
    "ESP": "Spain",
    "EST": "Estonia",
    "FIN": "Finland",
    "FRA": "France",
    "GER": "Germany",
    "GRE": "Greece",
    "GUA": "Guatemala",
    "HKG": "Hong Kong China",
    "HUN": "Hungary",
    "INA": "Indonesia",
    "IND": "India",
    "IRI": "Iran",
    "IRL": "Ireland",
    "ISL": "Iceland",
    "ISR": "Israel",
    "ITA": "Italy",
    "JAM": "Jamaica",
    "JOR": "Jordan",
    "JPN": "Japan",
    "KAZ": "Kazakhstan",
    "KEN": "Kenya",
    "KOR": "Korea",
    "KSA": "Saudi Arabia",
    "KUW": "Kuwait",
    "LAT": "Latvia",
    "LTU": "Lithuania",
    "LUX": "Luxembourg",
    "MAC": "Macau China",
    "MAS": "Malaysia",
    "MAW": "Malawi",
    "MDV": "Maldives",
    "MEX": "Mexico",
    "MGL": "Mongolia",
    "MKD": "North Macedonia",
    "MLT": "Malta",
    "MRI": "Mauritius",
    "MYA": "Myanmar",
    "NCL": "New Caledonia",
    "NED": "Netherlands",
    "NEP": "Nepal",
    "NGR": "Nigeria",
    "NIR": "Northern Ireland",
    "NOR": "Norway",
    "NZL": "New Zealand",
    "PAK": "Pakistan",
    "PER": "Peru",
    "PHI": "Philippines",
    "POL": "Poland",
    "POR": "Portugal",
    "PUR": "Puerto Rico",
    "QAT": "Qatar",
    "ROU": "Romania",
    "RSA": "South Africa",
    "RUS": "Russia",
    "SGP": "Singapore",
    "SCO": "Scotland",
    "SLO": "Slovenia",
    "SRI": "Sri Lanka",
    "SUI": "Switzerland",
    "SVK": "Slovakia",
    "SWE": "Sweden",
    "THA": "Thailand",
    "TPE": "Chinese Taipei",
    "TTO": "Trinidad and Tobago",
    "TUR": "Turkiye",
    "UAE": "United Arab Emirates",
    "UGA": "Uganda",
    "UKR": "Ukraine",
    "USA": "United States",
    "UZB": "Uzbekistan",
    "VIE": "Vietnam",
    "WAL": "Wales",
    "ZAM": "Zambia",
}

#: Longest code in the vocabulary — the column width and DTO bound.
REPRESENTATION_CODE_LENGTH = 3


def is_representation(code: object) -> bool:
    """Whether ``code`` is exactly one of the controlled codes (uppercase)."""
    return isinstance(code, str) and code in REPRESENTATIONS


def normalize_representation(value: object) -> Optional[str]:
    """Canonicalize an inbound representation, or raise ``ValueError``.

    Accepts ``None`` and the empty/whitespace string as **Unknown** and
    returns ``None`` for both — a form that posts an untouched select sends
    ``""``, and that is not an error. Otherwise trims, upper-cases and
    requires membership: an unlisted code raises, never silently stores.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("representation must be a string code")
    code = value.strip().upper()
    if not code:
        return None
    if code not in REPRESENTATIONS:
        raise ValueError(
            f"unknown representation code {code!r}; expected a BWF/ISO "
            "association code such as 'USA', 'ENG' or 'TPE' (leave it empty "
            "for Unknown)"
        )
    return code


def representation_name(code: object) -> str:
    """Display name for a code, or :data:`UNKNOWN_LABEL` when absent."""
    if isinstance(code, str) and code in REPRESENTATIONS:
        return REPRESENTATIONS[code]
    return UNKNOWN_LABEL
