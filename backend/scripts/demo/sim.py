"""Time-stepped race simulation that drives every feed topic."""

from __future__ import annotations

import math
import random
from datetime import datetime

from f1live.decode import encode_z

from . import roster, strategy, telemetry
from .cars import Car, SafetyCar
from .director import START_T, Director
from .feed import Feed
from .timing import Timing
from .track import PIT_SPEED, V_MAX, Track, _accel

DT = 0.25
STOP_GAP = 4.0          # minimum nose-to-tail distance (m)


class Race:
    def __init__(self, seed: int = 2026, laps: int = 50) -> None:
        self.rng = random.Random(seed)
        self.total = laps
        self.track = Track()
        self.feed = Feed(datetime.fromisoformat(roster.RECORDING_START_UTC))
        rng = self.rng
        infos = roster.drivers()
        pace = {d.num: d.team_pace + rng.gauss(0.0, 0.0022) for d in infos}
        grid = sorted(infos, key=lambda d: pace[d.num] + rng.gauss(0.0, 0.0018))
        plans = strategy.make_plans(rng, grid, laps)
        self.cars: list[Car] = []
        for gi, d in enumerate(grid):
            start, plan = plans[d.num]
            car = Car(i=gi, info=d, pace=max(0.0, pace[d.num]), grid=gi + 1, dist=-(8.0 + 8.0 * gi),
                      plan=plan, compound=start, used_compounds=[start],
                      grid_lat=3.5 if gi % 2 == 0 else -3.5)
            car.launch_t = START_T + rng.uniform(0.18, 0.45)
            car.launch_k = rng.uniform(0.9, 1.06)
            self.cars.append(car)
        for car in self.cars:
            car.k = self.track.ref_lap_time / strategy.lap_target(car, laps, 0.0, rng)
        self.order = list(self.cars)
        self.positions = {c.num: c.grid for c in self.cars}
        self.timing = Timing(self.track, self.feed, self.cars, laps)
        self.w = 0.0
        self.raining = False
        self.drs_enabled = False
        self.sc: SafetyCar | None = None
        self.vsc = False
        self.yellow_seg: int | None = None
        self.leader_laps = 0
        self.chequered = False
        self.samples: list[dict] = []
        self.stats = {"overtakes": 0, "pit_stops": 0, "events": []}
        self.director = Director(self)

    # -- small helpers ----------------------------------------------------
    def phys(self, a, b) -> float:
        """Signed on-track distance of ``a`` ahead of ``b`` (ignores lap count)."""
        L = self.track.length
        return (a.dist - b.dist + L / 2) % L - L / 2

    def current_lap(self) -> int:
        return max(1, min(self.total, self.leader_laps + 1))

    def note(self, t: float, what: str) -> None:
        self.stats["events"].append((round(t, 1), what))

    def deploy_sc(self, t: float) -> None:
        leader = next((c for c in self.order if not c.retired and not c.finished), None)
        if leader is None:
            return
        self.sc = SafetyCar(leader.dist + 160.0)
        self.sc.v = max(30.0, leader.v * 0.8)
        for c in self.cars:
            c.pass_target = None
            if c.retired or c.pit_phase or c.want_pit or c.finished:
                continue
            if (self.track.pit_entry - c.dist) % self.track.length < 350:
                continue
            c.want_pit = strategy.decide_under_sc(c, self.total, self.w, self.rng)
        self.note(t, "safety car deployed")

    # -- main loop --------------------------------------------------------
    def run(self) -> list:
        from .snapshot import emit_snapshot
        emit_snapshot(self)
        step = 0
        while True:
            t = round(step * DT, 3)
            self.director.update(t, DT)
            if t >= START_T:
                self._move(t)
            self._update_order(t)
            self._sample(t)
            if step % 2 == 1:
                self._emit_telemetry(t)
            self.feed.flush(t)
            if self.director.done:
                break
            step += 1
        return self.feed.messages

    # -- motion -----------------------------------------------------------
    def _caps(self, c: Car, t: float) -> float:
        tr = self.track
        s = c.dist % tr.length
        vp = tr.v_prof[tr.idx(s)]
        cap = vp * c.k
        if c.drs_open:
            cap *= 1.035
        if c.pass_target is not None and t < c.pass_until:
            cap *= 1.05
        if t < c.yield_until:
            cap *= c.yield_factor
        if self.yellow_seg is not None and tr.segment_number(s) == self.yellow_seg:
            cap = min(cap, vp * c.k * 0.9)
        if self.sc is not None:
            cap = min(cap, vp * 0.88, 66.0)
        if self.vsc:
            cap = min(cap, vp * 0.66)
        if c.finished:
            cap = min(cap, vp * 0.6, 55.0)
        if c.pit_phase is None and c.want_pit and not self.chequered:
            d = (tr.pit_entry - s) % tr.length
            if d < 500:
                cap = min(cap, math.sqrt(PIT_SPEED ** 2 + 2 * 20.0 * d))
        elif c.pit_phase == "in":
            d = (tr.pit_box - s) % tr.length
            cap = min(PIT_SPEED, math.sqrt(2 * 9.0 * d) + 0.4)
        elif c.pit_phase == "box":
            cap = 0.0
        elif c.pit_phase == "out":
            cap = PIT_SPEED
        if t < c.launch_t:
            cap = 0.0
        return cap

    def _ring(self) -> list:
        L = self.track.length
        ents: list = [c for c in self.cars if not c.retired and not c.finished and c.pit_phase is None]
        if self.sc is not None:
            ents.append(self.sc)
        ents.sort(key=lambda e: e.dist % L)
        return ents

    def _ahead(self, ring: list, idx: int, c: Car, t: float):
        L = self.track.length
        n = len(ring)
        for k in range(1, n):
            e = ring[(idx + k) % n]
            gap = (e.dist - c.dist) % L
            if gap > 250:
                return None, 1e9
            if isinstance(e, Car):
                if e is c.pass_target:
                    continue
                if e.dist < e.grace_until:
                    continue
            return e, gap
        return None, 1e9

    def _move(self, t: float) -> None:
        tr = self.track
        L = tr.length
        ring = self._ring()
        pos_in_ring = {id(e): k for k, e in enumerate(ring)}
        new_v: dict[int, float] = {}
        for c in self.cars:
            if c.retired:
                continue
            if c.pit_phase == "box" and t >= c.box_until:
                c.pit_phase = "out"
            cap = self._caps(c, t)
            c.ahead, c.ahead_gap = None, 1e9
            if id(c) in pos_in_ring:
                ahead, gap = self._ahead(ring, pos_in_ring[id(c)], c, t)
                if ahead is not None:
                    c.ahead, c.ahead_gap = ahead, gap
                    sc_mode = self.sc is not None
                    if sc_mode or ahead is self.sc:
                        follow = 0.7
                    elif c.pass_target is not None:
                        follow = 0.15     # tuck in after the car being passed
                    else:
                        follow = c.follow_t
                    g_t = max(6.0, follow * ahead.v)
                    cap = min(cap, max(0.0, ahead.v + 0.9 * (gap - g_t)))
                    if isinstance(ahead, Car) and c.dist - ahead.dist > L * 0.5 and gap < 1.5 * max(c.v, 20):
                        self.director.blue_flag(t, ahead)
                        if c.pass_target is None and not sc_mode and not self.vsc:
                            self._grant_pass(c, ahead, t, lapped=True)
            acc = _accel(c.v) * (c.launch_k if c.laps_done == 0 else 1.0)
            v = max(min(cap, c.v + acc * DT), c.v - 45.0 * DT, 0.0)
            new_v[id(c)] = v
        if self.sc is not None:
            sc = self.sc
            vp = tr.v_at(sc.dist)
            sc.v = min(vp * 0.66, 47.0, sc.v + 8.0 * DT)
            d0 = sc.dist
            sc.dist += sc.v * DT
            if sc.in_this_lap and self._crossed(d0, sc.dist, tr.pit_entry):
                self.sc = None
                self.note(t, "safety car in")
                self.director.on_sc_in(t)
        moving = [c for c in self.cars if not c.retired]
        start = {}
        for c in moving:
            v = new_v[id(c)]
            start[id(c)] = c.dist
            c.dist += 0.5 * (c.v + v) * DT
            c.a = (v - c.v) / DT
            c.v = v
        for c in moving:
            # never drive through the car ahead without permission
            if c.ahead is not None and c.ahead is not c.pass_target:
                gap = self.phys(c.ahead, c)
                if gap < STOP_GAP:
                    c.dist = max(start[id(c)], c.dist - (STOP_GAP - gap))
                    c.v = min(c.v, c.ahead.v)
        for c in moving:
            self._crossings(c, start[id(c)], c.dist, t)
        for c in moving:
            tgt = c.pass_target
            if tgt is None:
                continue
            ahead_by = -self.phys(tgt, c)
            if ahead_by > 6.0 or tgt.retired or tgt.pit_phase or c.pit_phase or self.sc is not None:
                if ahead_by > 6.0 and c.dist - tgt.dist < L * 0.5:
                    self.stats["overtakes"] += 1
                c.pass_target = None
            elif t >= c.pass_until:
                if c.dist - tgt.dist > L * 0.5 and ahead_by > -60:
                    self._grant_pass(c, tgt, t, lapped=True)   # blue flag: keep going
                else:
                    c.pass_target = None

    @staticmethod
    def _crossed_mod(s0: float, travelled: float, point: float, L: float) -> bool:
        return travelled > 0 and 0 < (point - s0) % L <= travelled

    def _crossed(self, d0: float, d1: float, point: float) -> bool:
        L = self.track.length
        return self._crossed_mod(d0 % L, d1 - d0, point, L)

    # -- events along the lap ----------------------------------------------
    def _crossings(self, c: Car, d0: float, d1: float, t: float) -> None:
        tr = self.track
        L = tr.length
        if d1 <= d0:
            return
        s0, trav = d0 % L, d1 - d0
        hit = lambda p: self._crossed_mod(s0, trav, p, L)  # noqa: E731
        # timing points
        while not c.finished:
            g = c.next_g
            b = (g // tr.ntp) * L + tr.tps[g % tr.ntp]
            if b > d1:
                break
            tc = t - DT + DT * (b - d0) / (d1 - d0)
            self._timing_point(c, g, tc, t)
            c.next_g += 1
            if c.retired:
                return
        if c.finished:
            return
        # pit lane
        if c.pit_phase is None and c.want_pit and not self.chequered and hit(tr.pit_entry):
            c.pit_phase = "in"
            c.stops += 1
            self.stats["pit_stops"] += 1
            c.drs_open, c.drs_eligible = False, None
            self.feed.line("TimingData", c.num, {"InPit": True, "PitOut": False, "NumberOfPitStops": c.stops})
        elif c.pit_phase == "in" and (hit(tr.pit_box) or (c.v < 0.5 and (tr.pit_box - d1 % L) % L < 3.0)):
            c.pit_phase = "box"
            c.v = 0.0
            c.box_until = t + (self.rng.uniform(2.1, 3.0) if self.rng.random() > 0.08 else self.rng.uniform(4.5, 7.0)) + 1.2
            self._new_stint(c, c.want_pit or "MEDIUM")
            c.want_pit = None
        elif c.pit_phase == "out" and hit(tr.pit_exit):
            c.pit_phase = None
            c.pit_out_flag = True
            c.grace_until = c.dist + 260.0
            self.feed.line("TimingData", c.num, {"InPit": False, "PitOut": True})
        if c.doomed_s is not None and hit(c.doomed_s):
            self._retire(c, t)
            return
        if c.pit_phase is not None:
            return
        # DRS
        for zi, (det, z0, z1) in enumerate(tr.drs_zones):
            if hit(det):
                ok = (self.drs_enabled and isinstance(c.ahead, Car) and c.ahead_gap / max(c.v, 20.0) < 1.0)
                c.drs_eligible = zi if ok else None
            if hit(z0) and c.drs_eligible == zi and self.drs_enabled:
                c.drs_open = True
            if hit(z1):
                if c.drs_open or c.drs_eligible == zi:
                    c.drs_open, c.drs_eligible = False, None
        for p in tr.overtake_points:
            if hit(p):
                self._try_overtake(c, t)
        for trap, p in tr.speed_traps.items():
            if hit(p) and c.laps_done < self.total:
                self.timing.speed(c, trap, c.v * 3.6)

    def _try_overtake(self, c: Car, t: float) -> None:
        if self.sc is not None or self.vsc or t < START_T:
            return
        ahead = c.ahead
        if not isinstance(ahead, Car) or c.ahead_gap / max(c.v, 20.0) > 1.0:
            return
        lapped = c.dist - ahead.dist > self.track.length * 0.5
        if lapped:
            p = 0.95
        else:
            adv = c.k / max(ahead.k, 0.5) - 1.0 + (0.03 if c.drs_open else 0.0)
            if ahead.pit_out_flag:
                adv += 0.02
            p = max(0.0, min(0.8, -0.02 + 10.0 * adv))
            if c.laps_done == 0:
                p = min(0.8, p * 1.5 + 0.08)
        if self.rng.random() < p:
            self._grant_pass(c, ahead, t, lapped)

    def _grant_pass(self, c: Car, ahead: Car, t: float, lapped: bool) -> None:
        c.pass_target = ahead
        c.pass_until = t + 12.0
        ahead.yield_until = c.pass_until
        ahead.yield_factor = 0.93 if lapped else 0.985

    def _retire(self, c: Car, t: float) -> None:
        tr = self.track
        c.retired = True
        c.retire_t = t
        c.retire_s = c.dist % tr.length
        c.retire_lateral = -tr.pit_side * 16.0
        c.v = 0.0
        c.doomed_s = None
        c.want_pit = None
        self.feed.line("TimingData", c.num, {"Retired": True, "Stopped": True})
        self.note(t, f"car {c.num} retired")
        self.director.on_crash(t, c)

    def _new_stint(self, c: Car, compound: str) -> None:
        # The in-lap (finished on the new set just after the box) belongs to the
        # old stint; the new stint skips it, so stint laps sum to laps completed.
        self.feed.line("TimingAppData", c.num, {"Stints": {str(c.stint_idx): {"TotalLaps": c.tyre_age + 1}}})
        c.stint_idx += 1
        c.compound = compound
        c.used_compounds.append(compound)
        c.tyre_age = 0
        c.skip_age = True
        c.outlap = True
        c.k = min(c.k, self.track.ref_lap_time / (strategy.BASE_LAP * 1.04))
        self.feed.line("TimingAppData", c.num, {"Stints": {str(c.stint_idx): {
            "LapFlags": 0, "Compound": compound, "New": "true", "TyresNotChanged": "0",
            "TotalLaps": 0, "StartLaps": 0}}})

    def _timing_point(self, c: Car, g: int, tc: float, t: float) -> None:
        tr = self.track
        i = g % tr.ntp
        in_pit = c.pit_phase is not None
        slow = self.sc is not None or self.vsc or in_pit or c.pit_out_flag or c.outlap
        lap_time = self.timing.on_tp(c, g, tc, in_pit, slow)
        if c.pit_out_flag and tr.tp_sector[i] == 0 and i == tr.seg_counts[0] - 1:
            c.pit_out_flag = False
            self.feed.line("TimingData", c.num, {"PitOut": False})
        if lap_time is not None:
            self._lap_complete(c, t)
        self.timing.update_gaps(c, self.order, self.current_lap())

    def _lap_complete(self, c: Car, t: float) -> None:
        c.laps_done += 1
        if c.skip_age:
            c.skip_age = False
        else:
            c.tyre_age += 1
            c.outlap = False
        self.feed.line("TimingAppData", c.num, {"Stints": {str(c.stint_idx): {"TotalLaps": c.tyre_age}}})
        if c.laps_done > self.leader_laps:
            self.leader_laps = c.laps_done
            self.feed.patch("LapCount", {"CurrentLap": self.current_lap(), "TotalLaps": self.total})
            if c.laps_done >= self.total and not self.chequered:
                self.chequered = True
                self.note(t, f"chequered flag, winner {c.num}")
                self.director.on_chequered(t)
            self.director.on_leader_lap(t, c.laps_done)
        if self.chequered:
            c.finished = True
            c.finish_t = t
            c.finish_laps = c.laps_done
            c.drs_open, c.drs_eligible, c.pass_target = False, None, None
            return
        c.follow_t = self.rng.uniform(0.45, 1.0)
        target = strategy.lap_target(c, self.total, self.w, self.rng)
        c.k = self.track.ref_lap_time / target
        if c.want_pit is None and c.pit_phase is None:
            c.want_pit = strategy.decide_at_line(c, self.total, self.w, self.raining, self.rng)

    # -- classification -------------------------------------------------
    def _rank_key(self, c: Car):
        L = self.track.length
        if c.retired:
            return (0, c.laps_done, c.retire_t)
        if c.finished:
            return (1, c.finish_laps * L + 0.5 - c.finish_t * 1e-6, 0)
        return (1, c.dist, 0)

    def _update_order(self, t: float) -> None:
        order = sorted(self.cars, key=self._rank_key, reverse=True)
        changed = []
        for p, c in enumerate(order, 1):
            if self.positions[c.num] != p:
                self.positions[c.num] = p
                changed.append(c)
        self.order = order
        if not changed:
            return
        for c in changed:
            p = self.positions[c.num]
            self.feed.line("TimingData", c.num, {"Position": str(p), "Line": p})
            self.feed.patch("DriverList", {c.num: {"Line": p}})
            self.feed.line("TimingAppData", c.num, {"Line": p})
        if t >= START_T:
            for c in changed:
                if not c.retired and not c.finished:
                    self.timing.update_gaps(c, order, self.current_lap())

    # -- telemetry --------------------------------------------------------
    def _sample(self, t: float) -> None:
        tr = self.track
        cars = {}
        for c in self.cars:
            c.moving_soon = t >= START_T - 5.0
            s = c.dist % tr.length
            flat = tr.v_prof[tr.idx(s)] >= V_MAX * 0.985 and c.v > 0.9 * V_MAX * c.k and c.a > -1.0
            drs = 12 if c.drs_open else (8 if c.drs_eligible is not None else 0)
            cars[c.num] = {"Channels": telemetry.channels(c, c.a, flat, drs, self.rng)}
        pos = {c.num: telemetry.position(tr, c) for c in self.cars}
        self.samples.append({"t": t, "cars": cars, "pos": pos})

    def _emit_telemetry(self, t: float) -> None:
        a, b = self.samples[-2], self.samples[-1]
        car_data = {"Entries": [{"Utc": self.feed.ts(s["t"]), "Cars": s["cars"]} for s in (a, b)]}
        self.feed.emit(t, "CarData.z", encode_z(car_data))
        pos = {"Position": [{"Timestamp": self.feed.ts(b["t"]), "Entries": b["pos"]}]}
        self.feed.emit(t, "Position.z", encode_z(pos))
        self.samples = []
