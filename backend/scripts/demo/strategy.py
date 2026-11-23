"""Tyres, pace model and pit-stop decisions."""

from __future__ import annotations

import random
from dataclasses import dataclass

# Lap-time model (seconds) per compound: offset vs a new MEDIUM, linear
# degradation per lap of age, and the age after which wear accelerates.
COMPOUNDS = {
    "SOFT": {"offset": -0.55, "deg": 0.075, "cliff": 19, "cliff_rate": 0.22},
    "MEDIUM": {"offset": 0.0, "deg": 0.045, "cliff": 29, "cliff_rate": 0.18},
    "HARD": {"offset": 0.45, "deg": 0.028, "cliff": 42, "cliff_rate": 0.12},
    "INTERMEDIATE": {"offset": 0.0, "deg": 0.04, "cliff": 30, "cliff_rate": 0.1},
    "WET": {"offset": 0.0, "deg": 0.03, "cliff": 40, "cliff_rate": 0.1},
}
SLICKS = ("SOFT", "MEDIUM", "HARD")
BASE_LAP = 82.4          # best car, no fuel, new MEDIUM, dry (seconds)
FUEL_PER_LAP = 0.034     # seconds per lap of fuel still on board
NOISE = 0.17             # per-lap random variation (seconds, 1 sigma)


def wet_factor(compound: str, w: float) -> float:
    """Fractional lap-time penalty for a compound at track wetness ``w`` (0..1)."""
    if compound in SLICKS:
        return 0.20 * w ** 1.3
    if compound == "INTERMEDIATE":
        return 0.035 + 0.065 * (1.0 - w) ** 2
    return 0.06 + 0.10 * (1.0 - w) ** 2


@dataclass
class Plan:
    stops: list[tuple[int, str]]   # (pit at end of this lap, next compound)
    wet_threshold: float           # wetness at which the team calls for inters
    dry_threshold: float           # wetness below which inters come off


def make_plans(rng: random.Random, grid: list, total_laps: int) -> dict[str, tuple[str, Plan]]:
    """Return {racing number: (starting compound, plan)} for every car."""
    out = {}
    n = total_laps
    for pos, car in enumerate(grid):
        r = rng.random()
        if pos < 10:
            start = "MEDIUM" if r < 0.55 else "SOFT"
        else:
            start = "HARD" if r < 0.3 else ("MEDIUM" if r < 0.7 else "SOFT")
        stops: list[tuple[int, str]] = []
        if n >= 8:
            two_stop = rng.random() < (0.55 if start == "SOFT" else 0.3)
            if two_stop:
                a = int(n * rng.uniform(0.27, 0.34))
                b = int(n * rng.uniform(0.6, 0.68))
                stops = [(a, "MEDIUM"), (b, "SOFT" if rng.random() < 0.5 else "MEDIUM")]
            else:
                frac = {"SOFT": 0.36, "MEDIUM": 0.5, "HARD": 0.6}[start] + rng.uniform(-0.06, 0.06)
                nxt = "HARD" if start != "HARD" else "MEDIUM"
                if start == "HARD":
                    nxt = "SOFT" if rng.random() < 0.5 else "MEDIUM"
                stops = [(max(2, int(n * frac)), nxt)]
        plan = Plan(stops, wet_threshold=rng.uniform(0.28, 0.75), dry_threshold=rng.uniform(0.18, 0.32))
        out[car.num] = (start, plan)
    return out


def lap_target(car, laps_total: int, w: float, rng: random.Random) -> float:
    """Target lap time (seconds) for the lap ``car`` is starting."""
    c = COMPOUNDS[car.compound]
    age = car.tyre_age
    t = BASE_LAP * (1.0 + car.pace * (1.3 if w > 0.3 else 1.0))
    t += c["offset"] + c["deg"] * age
    if age > c["cliff"]:
        t += c["cliff_rate"] * (age - c["cliff"]) ** 1.3
    t += FUEL_PER_LAP * max(0, laps_total - car.laps_done)
    t += BASE_LAP * wet_factor(car.compound, w)
    if car.outlap:
        t += 1.1
    t += rng.gauss(0.0, NOISE * (1.6 if w > 0.2 else 1.0))
    return t


def choose_slick(car, laps_left: int, total: int, rng: random.Random | None = None) -> str:
    used = {s for s in car.used_compounds if s in SLICKS}
    r = rng.random() if rng else 0.5
    if laps_left <= 0.28 * total:
        pick = "SOFT"
    elif laps_left <= 0.5 * total:
        pick = "SOFT" if r < 0.35 else "MEDIUM"
    else:
        pick = "MEDIUM" if r < 0.35 else "HARD"
    # Respect the two-dry-compounds rule when no wet tyre has been used.
    if "INTERMEDIATE" not in car.used_compounds and used == {pick}:
        pick = "MEDIUM" if pick != "MEDIUM" else ("SOFT" if laps_left < 0.4 * total else "HARD")
    return pick


def wants_inters(car, w: float, raining: bool, laps_left: int) -> bool:
    """Inters replace the planned dry stop(s), so only cars yet to stop switch."""
    if car.compound not in SLICKS or laps_left <= 4 or not (raining or w > 0.25):
        return False
    return car.stops == 0 and w >= car.plan.wet_threshold


def decide_at_line(car, total: int, w: float, raining: bool, rng: random.Random) -> str | None:
    """Called when ``car`` starts a lap; returns a compound to pit for at the end of it."""
    laps_left = total - car.laps_done
    if laps_left <= 1:
        return None
    if wants_inters(car, w, raining, laps_left):
        car.plan.stops = []
        return "INTERMEDIATE"
    if car.compound == "INTERMEDIATE":
        if not raining and w <= car.plan.dry_threshold:
            return choose_slick(car, laps_left, total, rng)
        return None
    if w > 0.3:
        return None  # nobody swaps slicks for slicks on a wet track
    for lap, compound in list(car.plan.stops):
        if car.laps_done + 1 >= lap:
            car.plan.stops.remove((lap, compound))
            if compound in car.used_compounds and len(set(car.used_compounds) & set(SLICKS)) == 1:
                compound = choose_slick(car, laps_left, total, rng)
            return compound
    c = COMPOUNDS[car.compound]
    if car.tyre_age >= c["cliff"] + 4 and laps_left > 5:
        return choose_slick(car, laps_left, total, rng)
    if car.stops == 0 and total >= 8 and laps_left <= 3:
        return choose_slick(car, laps_left, total, rng)
    return None


def decide_under_sc(car, total: int, w: float, rng: random.Random) -> str | None:
    """A cheap stop under the safety car if one is due soon."""
    laps_left = total - car.laps_done
    if laps_left < 4 or car.compound not in SLICKS:
        return None
    if w > 0.2:
        if wants_inters(car, w / 0.85, True, laps_left):
            car.plan.stops = []
            return "INTERMEDIATE"
        return None
    due = min((lap for lap, _ in car.plan.stops), default=None)
    if due is not None and due - car.laps_done <= 0.25 * total and rng.random() < 0.85:
        car.plan.stops.pop(0)
        return choose_slick(car, laps_left, total, rng)
    if car.tyre_age > 0.3 * total and rng.random() < 0.6:
        car.plan.stops = []
        return choose_slick(car, laps_left, total, rng)
    return None
