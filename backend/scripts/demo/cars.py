"""Per-car and safety-car state used by the simulation."""

from __future__ import annotations

from dataclasses import dataclass, field

from . import roster, strategy


@dataclass(eq=False)
class Car:
    i: int
    info: roster.DriverInfo
    pace: float
    grid: int
    dist: float
    plan: strategy.Plan
    compound: str
    v: float = 0.0
    a: float = 0.0
    k: float = 0.95
    laps_done: int = 0
    tyre_age: int = 0
    used_compounds: list = field(default_factory=list)
    stint_idx: int = 0
    stops: int = 0
    want_pit: str | None = None
    pit_phase: str | None = None
    box_until: float = 0.0
    outlap: bool = False
    pit_out_flag: bool = False
    skip_age: bool = False
    retired: bool = False
    retire_t: float = 0.0
    retire_s: float = 0.0
    retire_lateral: float = 0.0
    doomed_s: float | None = None
    finished: bool = False
    finish_t: float = 0.0
    finish_laps: int = 0
    launch_t: float = 0.0
    launch_k: float = 1.0
    pass_target: object = None
    pass_until: float = 0.0
    yield_until: float = 0.0
    yield_factor: float = 1.0
    follow_t: float = 0.6
    drs_eligible: int | None = None
    drs_open: bool = False
    next_g: int = 0
    grace_until: float = -1e9
    last_blue: float = -1e9
    grid_lat: float = 0.0
    moving_soon: bool = False
    ahead: object = None
    ahead_gap: float = 1e9

    @property
    def num(self) -> str:
        return self.info.num

    def lateral(self, track) -> float:
        if self.pit_phase is not None:
            return track.pit_lateral(self.dist)
        if self.dist < 250:
            return self.grid_lat * max(0.0, min(1.0, 1.0 - self.dist / 250.0))
        return 0.0


class SafetyCar:
    def __init__(self, dist: float) -> None:
        self.dist = dist
        self.v = 40.0
        self.in_this_lap = False
