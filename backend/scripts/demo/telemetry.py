"""Car telemetry channels and positions consistent with the simulated motion."""

from __future__ import annotations

import random

# Upper speed (kph) of each gear; index 0 is neutral.
GEAR_TOP = [0, 98, 138, 172, 207, 242, 274, 304, 350]


def gear_for(kph: float) -> int:
    for g in range(1, 9):
        if kph <= GEAR_TOP[g] * 0.97:
            return g
    return 8


def channels(car, accel: float, flat_out: bool, drs: int, rng: random.Random) -> dict:
    """CarData channels: 0 rpm, 2 speed, 3 gear, 4 throttle, 5 brake, 45 DRS."""
    kph = car.v * 3.6
    if car.retired:
        return {"0": 0, "2": 0, "3": 0, "4": 0, "5": 0, "45": 0}
    if kph < 2.0:
        gear = 1 if car.moving_soon else 0
        return {"0": 4100 + rng.randint(-60, 60) + (3000 if car.moving_soon else 0), "2": 0, "3": gear,
                "4": 15 if car.moving_soon else 0, "5": 0 if car.moving_soon else 100, "45": 0}
    gear = gear_for(kph)
    top = GEAR_TOP[gear]
    rpm = int(max(6400, min(12100, 11850 * kph / top)) + rng.randint(-40, 40))
    if car.pit_phase is not None and kph > 60:
        gear, rpm = 3, 7000 + rng.randint(-60, 60)   # pit limiter
    if accel < -6.0:
        throttle, brake = 0, 100
    elif accel > 0.6 or flat_out:
        throttle, brake = 100, 0
    else:
        throttle = int(max(0, min(99, 38 + 22 * accel + rng.randint(-4, 4))))
        brake = 0
    return {"0": rpm, "2": int(round(kph)), "3": gear, "4": throttle, "5": brake, "45": drs}


def position(track, car) -> dict:
    s = car.dist % track.length
    if car.retired:
        x, y, z = track.xyz(car.retire_s, car.retire_lateral)
        status = "OffTrack"
    else:
        lateral = car.lateral(track)
        x, y, z = track.xyz(s, lateral)
        status = "OnTrack"
    return {"Status": status, "X": int(round(x * 10)), "Y": int(round(y * 10)), "Z": int(round(z * 10))}
