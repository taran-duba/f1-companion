"""Fictional teams, drivers and event metadata for the demo race.

Every name here is invented. Nothing refers to a real driver, team,
circuit or event.
"""

from __future__ import annotations

from dataclasses import dataclass

# (team name, hex colour, relative pace deficit as a fraction of lap time)
TEAMS: list[tuple[str, str, float]] = [
    ("Halcyon Racing", "E8402A", 0.000),
    ("Nordlys Grand Prix", "2F6FE0", 0.002),
    ("Cobalt Dynamics", "F59E0B", 0.005),
    ("Ironbark Motorsport", "15B39A", 0.008),
    ("Solstice F1 Team", "9B5DE5", 0.011),
    ("Meridian Works", "C9CED6", 0.014),
    ("Talon Racing", "36C24A", 0.018),
    ("Aster Velocity", "FF5FA2", 0.022),
    ("Kinetic Forge", "5468FF", 0.027),
    ("Brightwater GP", "FFD400", 0.035),
]

# (racing number, first name, last name, TLA, team index, country code)
DRIVERS: list[tuple[int, str, str, str, int, str]] = [
    (3, "Tomas", "Halvorsen", "HAL", 0, "NOR"),
    (17, "Ade", "Okafor", "OKA", 0, "NGA"),
    (6, "Lucien", "Marchetti", "MAR", 1, "FRA"),
    (29, "Kenji", "Arakawa", "ARA", 1, "JPN"),
    (11, "Soren", "Lindqvist", "LIN", 2, "SWE"),
    (42, "Diego", "Ferreyra", "FEY", 2, "ARG"),
    (9, "Callum", "Pemberton", "PEM", 3, "GBR"),
    (36, "Ilya", "Vashenko", "VAS", 3, "UKR"),
    (21, "Noah", "Delacroix", "DEX", 4, "BEL"),
    (25, "Matteo", "Varenna", "VAR", 4, "ITA"),
    (12, "Elias", "Kowalczyk", "KOW", 5, "POL"),
    (48, "Jonah", "Whitlock", "WHI", 5, "USA"),
    (19, "Rafa", "Montiel", "MTL", 6, "ESP"),
    (52, "Anders", "Brekke", "BRK", 6, "DEN"),
    (26, "Theo", "Lamberti", "LMB", 7, "SUI"),
    (39, "Yusuf", "Demirel", "DEM", 7, "TUR"),
    (66, "Oscar", "Quintero", "QUI", 8, "MEX"),
    (15, "Felix", "Aumann", "AUM", 8, "AUT"),
    (88, "Hugo", "Sandoval", "SDV", 9, "CHI"),
    (32, "Kai", "Tanabe", "TNB", 9, "NZL"),
]

MEETING = {
    "Key": 9901,
    "Name": "Solmara Grand Prix",
    "OfficialName": "FORMULA 1 SOLMARA COAST GRAND PRIX 2026 (DEMO)",
    "Location": "Kestrel Bay",
    "Country": {"Key": 901, "Code": "SLM", "Name": "Solmara"},
    "Circuit": {"Key": 9901, "ShortName": "Kestrel Bay"},
}

SESSION_KEY = 99001
SESSION_DATE_LOCAL = "2026-06-14T15:00:00"
GMT_OFFSET = "02:00:00"
# UTC instant of t=0 in the recording (race start is t=START_T later).
RECORDING_START_UTC = "2026-06-14T12:59:00+00:00"


@dataclass(slots=True)
class DriverInfo:
    num: str
    first: str
    last: str
    tla: str
    team: str
    colour: str
    country: str
    team_pace: float

    @property
    def full_name(self) -> str:
        return f"{self.first} {self.last.upper()}"

    @property
    def broadcast(self) -> str:
        return f"{self.first[0]} {self.last.upper()}"


def drivers() -> list[DriverInfo]:
    out = []
    for num, first, last, tla, team_idx, country in DRIVERS:
        team, colour, pace = TEAMS[team_idx]
        out.append(DriverInfo(str(num), first, last, tla, team, colour, country, pace))
    return out


def session_info() -> dict:
    return {
        "Meeting": dict(MEETING),
        "ArchiveStatus": {"Status": "Generating"},
        "Key": SESSION_KEY,
        "Type": "Race",
        "Name": "Race",
        "StartDate": SESSION_DATE_LOCAL,
        "EndDate": "2026-06-14T17:00:00",
        "GmtOffset": GMT_OFFSET,
        "Path": "2026/2026-06-14_Solmara_Grand_Prix/2026-06-14_Race/",
    }


def driver_list_entry(d: DriverInfo, line: int) -> dict:
    return {
        "RacingNumber": d.num,
        "BroadcastName": d.broadcast,
        "FullName": d.full_name,
        "Tla": d.tla,
        "Line": line,
        "TeamName": d.team,
        "TeamColour": d.colour,
        "FirstName": d.first,
        "LastName": d.last,
        "Reference": f"{d.first[:3].upper()}{d.last[:3].upper()}01",
        "CountryCode": d.country,
    }
