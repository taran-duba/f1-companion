"""Race director: session status, track status, race control, weather, clock."""

from __future__ import annotations

import math

from .feed import fmt_clock

START_T = 60.0           # lights out, seconds after recording start
RACE_TIME_LIMIT = 7200   # seconds shown by ExtrapolatedClock


class Director:
    def __init__(self, race) -> None:
        self.race = race
        self.feed = race.feed
        self.rng = race.rng
        n = race.total
        self.events = n >= 10
        self.yellow_lap = max(3, round(0.14 * n))
        self.rain_on_lap = round(0.34 * n)
        self.dnf_lap = round(0.42 * n)
        self.rain_off_lap = round(0.48 * n)
        self.sc_laps = 3
        self.tl_lap = round(0.6 * n)
        self.vsc_lap = round(0.84 * n)
        self.timers: list[tuple[float, object]] = []
        self.rc_count = 0
        self.started = False
        self.drs_reenable_lap: int | None = 2
        self.wet_drs_off = False
        self.sc_start_lap = -1
        self.finish_t: float | None = None
        self.session_finished_t: float | None = None
        self.done = False
        self.weather = {"air": 24.2, "track": 38.6, "hum": 51.0, "press": 1012.4, "wdir": 142.0, "wspd": 2.3}

    # -- helpers ----------------------------------------------------------
    def rc_messages_snapshot(self) -> list[dict]:
        t0 = -1800.0
        msgs = [
            self._rc_obj(t0, "GREEN LIGHT - PIT EXIT OPEN", "Flag", Flag="GREEN", Scope="Track"),
            self._rc_obj(t0 + 1200, "PIT EXIT CLOSED", "Other"),
            self._rc_obj(t0 + 1500, "RISK OF RAIN FOR F1 RACE IS 40%", "Other"),
        ]
        self.rc_count = len(msgs)
        return msgs

    def _rc_obj(self, t: float, message: str, category: str, **extra) -> dict:
        obj = {"Utc": self.feed.ts(t), "Lap": self.race.current_lap(), "Category": category}
        obj.update(extra)
        obj["Message"] = message
        return obj

    def rc(self, t: float, message: str, category: str, **extra) -> None:
        obj = self._rc_obj(t, message, category, **extra)
        self.feed.patch("RaceControlMessages", {"Messages": {str(self.rc_count): obj}})
        self.rc_count += 1

    def track_status(self, status: str, message: str) -> None:
        self.feed.patch("TrackStatus", {"Status": status, "Message": message})

    def later(self, t: float, fn) -> None:
        self.timers.append((t, fn))

    def car_label(self, car) -> str:
        return f"CAR {car.num} ({car.info.tla})"

    def clock(self, t: float, extrapolating: bool) -> dict:
        remaining = RACE_TIME_LIMIT - max(0.0, t - START_T) if self.started else RACE_TIME_LIMIT
        # fmt_clock clamps at zero (long --laps races outlast the time limit).
        return {"Utc": self.feed.ts(t), "Remaining": fmt_clock(remaining), "Extrapolating": extrapolating}

    def weather_data(self) -> dict:
        w = self.weather
        return {"AirTemp": f"{w['air']:.1f}", "Humidity": f"{w['hum']:.1f}", "Pressure": f"{w['press']:.1f}",
                "Rainfall": "1" if self.race.raining else "0", "TrackTemp": f"{w['track']:.1f}",
                "WindDirection": str(int(w["wdir"]) % 360), "WindSpeed": f"{w['wspd']:.1f}"}

    # -- per step ---------------------------------------------------------
    def update(self, t: float, dt: float) -> None:
        race = self.race
        if not self.started and t >= START_T:
            self.started = True
            self.feed.patch("SessionStatus", {"Status": "Started"})
            self.feed.emit(t, "ExtrapolatedClock", self.clock(t, True))
            race.timing.start(t, race.cars)
        if self.started and int(t * 4) % (300 * 4) == 0 and self.session_finished_t is None:
            self.feed.emit(t, "ExtrapolatedClock", self.clock(t, True))
        # wetness
        if race.raining:
            race.w += dt * (0.56 - race.w) / 170.0
        else:
            race.w = max(0.0, race.w - dt * 0.0011)
        if int(t * 4) % (60 * 4) == 0 and t > 0:
            self._weather_step(t)
        if int(t * 4) % (5 * 4) == 0 and t > 0:
            self.feed.emit(t, "Heartbeat", {"Utc": self.feed.ts(t)})
        # wet-weather DRS
        if self.events and race.drs_enabled and race.w > 0.4:
            race.drs_enabled = False
            self.wet_drs_off = True
            self.rc(t, "DRS DISABLED", "Drs", Status="DISABLED")
        elif self.wet_drs_off and not race.raining and race.w < 0.2 and race.sc is None:
            self.wet_drs_off = False
            self.drs_reenable_lap = race.leader_laps + 1
        due = [x for x in self.timers if x[0] <= t]
        if due:
            self.timers = [x for x in self.timers if x[0] > t]
            for _, fn in sorted(due, key=lambda x: x[0]):
                fn(t)
        self._finish_logic(t)

    def _weather_step(self, t: float) -> None:
        w, rng, race = self.weather, self.rng, self.race
        wet = race.w
        target_air = 24.2 + 0.6 * math.sin(t / 900.0) - 3.2 * wet
        target_track = 38.6 - 0.0012 * t - 12.0 * wet
        target_hum = 51.0 + 30.0 * wet + (8.0 if race.raining else 0.0)
        w["air"] += (target_air - w["air"]) * 0.5 + rng.gauss(0, 0.05)
        w["track"] += (target_track - w["track"]) * 0.5 + rng.gauss(0, 0.1)
        w["hum"] = min(99.0, w["hum"] + (target_hum - w["hum"]) * 0.5 + rng.gauss(0, 0.3))
        w["press"] += rng.gauss(0, 0.05) - (0.04 if race.raining else 0.0)
        w["wdir"] += rng.gauss(0, 6)
        w["wspd"] = max(0.3, w["wspd"] + rng.gauss(0, 0.2) + ((3.6 if race.raining else 2.2) - w["wspd"]) * 0.2)
        self.feed.emit(t, "WeatherData", self.weather_data())

    # -- hooks from the race ---------------------------------------------
    def on_leader_lap(self, t: float, laps: int) -> None:
        race = self.race
        if self.drs_reenable_lap is not None and laps >= self.drs_reenable_lap and race.sc is None \
                and not race.vsc and not self.wet_drs_off:
            self.drs_reenable_lap = None
            race.drs_enabled = True
            self.rc(t, "DRS ENABLED", "Drs", Status="ENABLED")
        if not self.events:
            return
        if laps == self.yellow_lap:
            self.later(t + 25, self._yellow_on)
        if laps == self.dnf_lap:
            self._doom_car(t)
        if race.sc is not None and laps == self.sc_start_lap + self.sc_laps:
            race.sc.in_this_lap = True
            self.rc(t, "SAFETY CAR IN THIS LAP", "SafetyCar", Status="IN THIS LAP", Mode="SAFETY CAR")
        if laps == self.tl_lap:
            self._track_limits(t)
        if laps == self.rain_on_lap:
            race.raining = True
        if laps == self.rain_off_lap:
            race.raining = False
        if laps == self.vsc_lap:
            self.later(t + 20, self._vsc_on)

    def _yellow_on(self, t: float) -> None:
        tr = self.race.track
        corner = tr.corners[min(4, len(tr.corners) - 1)]
        sec = tr.segment_number(corner)
        self.race.yellow_seg = sec
        self.rc(t, f"YELLOW IN TRACK SECTOR {sec}", "Flag", Flag="YELLOW", Scope="Sector", Sector=sec)
        self.track_status("2", "Yellow")

        def clear(t2: float) -> None:
            self.race.yellow_seg = None
            self.rc(t2, f"CLEAR IN TRACK SECTOR {sec}", "Flag", Flag="CLEAR", Scope="Sector", Sector=sec)
            if self.race.sc is None and not self.race.vsc:
                self.track_status("1", "AllClear")
        self.later(t + 32, clear)

    def _doom_car(self, t: float) -> None:
        race = self.race
        mid = [c for c in race.order[8:16] if not c.retired and c.pit_phase is None and not c.want_pit]
        if not mid:
            return
        car = self.rng.choice(mid)
        tr = race.track
        car.doomed_s = tr.corners[min(7, len(tr.corners) - 1)] - 15.0

    def on_crash(self, t: float, car) -> None:
        race = self.race
        tr = race.track
        sec = tr.segment_number(car.retire_s)
        turn = tr.corner_at(car.retire_s)
        self.rc(t, f"DOUBLE YELLOW IN TRACK SECTOR {sec}", "Flag", Flag="DOUBLE YELLOW", Scope="Sector", Sector=sec)
        self.track_status("2", "Yellow")
        self.later(t + 3, lambda t2: self.rc(t2, f"{self.car_label(car)} STOPPED AT TURN {turn}", "CarEvent",
                                             RacingNumber=car.num))

        def deploy(t2: float) -> None:
            self.sc_start_lap = race.leader_laps
            race.deploy_sc(t2)
            self.track_status("4", "SCDeployed")
            self.rc(t2, "SAFETY CAR DEPLOYED", "SafetyCar", Status="DEPLOYED", Mode="SAFETY CAR")
            if race.drs_enabled:
                race.drs_enabled = False
                self.rc(t2, "DRS DISABLED", "Drs", Status="DISABLED")
            self.drs_reenable_lap = None
            self.later(t2 + 20, lambda t3: self.rc(t3, "LAPPED CARS WILL NOT BE ALLOWED TO OVERTAKE", "Other"))
            self.later(t2 + 150, lambda t3: self.rc(t3, f"{self.car_label(car)} RETIRED - NOTED BY THE STEWARDS", "Other"))
        self.later(t + 7, deploy)

    def on_sc_in(self, t: float) -> None:
        race = self.race
        race.yellow_seg = None
        self.track_status("1", "AllClear")
        self.rc(t, "TRACK CLEAR", "Flag", Flag="CLEAR", Scope="Track")
        self.drs_reenable_lap = race.leader_laps + 2

    def _vsc_on(self, t: float) -> None:
        race = self.race
        if race.sc is not None or race.chequered:
            return
        turn = 2
        self.rc(t, f"DEBRIS ON TRACK AT TURN {turn}", "Other")
        race.vsc = True
        self.track_status("6", "VSCDeployed")
        self.rc(t, "VIRTUAL SAFETY CAR DEPLOYED", "SafetyCar", Status="DEPLOYED", Mode="VIRTUAL SAFETY CAR")
        was_drs = race.drs_enabled
        race.drs_enabled = False

        def ending(t2: float) -> None:
            self.track_status("7", "VSCEnding")
            self.rc(t2, "VIRTUAL SAFETY CAR ENDING", "SafetyCar", Status="ENDING", Mode="VIRTUAL SAFETY CAR")

        def green(t2: float) -> None:
            race.vsc = False
            race.drs_enabled = was_drs
            self.track_status("1", "AllClear")
            self.rc(t2, "TRACK CLEAR", "Flag", Flag="CLEAR", Scope="Track")
        self.later(t + 68, ending)
        self.later(t + 80, green)

    def _track_limits(self, t: float) -> None:
        race = self.race
        best = race.timing.best_lap
        cands = [c for c in race.order[3:14] if not c.retired and c.pit_phase is None
                 and 0 < race.timing.last_lap_time[c.num] < best * 1.04]
        if not cands:
            return
        car = self.rng.choice(cands)
        lap_no = race.timing.last_lap_no[car.num]
        lap_time = race.timing.last_lap_time[car.num]
        turn = race.track.corner_at(race.track.corners[min(9, len(race.track.corners) - 1)])
        from .feed import fmt_lap
        hhmmss = self.feed.ts(t)[11:19]
        self.rc(t, f"{self.car_label(car)} TIME {fmt_lap(lap_time)} DELETED - TRACK LIMITS AT TURN {turn} "
                   f"LAP {lap_no} {hhmmss}", "CarEvent", RacingNumber=car.num)
        self.later(t + 170, lambda t2: self.rc(
            t2, f"BLACK AND WHITE FLAG FOR {self.car_label(car)} - TRACK LIMITS", "Flag",
            Flag="BLACK AND WHITE", Scope="Driver", RacingNumber=car.num))
        self.later(t + 420, lambda t2: self.rc(
            t2, f"FIA STEWARDS: 5 SECOND TIME PENALTY FOR {self.car_label(car)} - TRACK LIMITS", "CarEvent",
            RacingNumber=car.num))

    def blue_flag(self, t: float, car) -> None:
        # No blue flags while the field is neutralised: lapped cars may not be
        # passed under SC/VSC, so they would otherwise be flagged every minute.
        if self.race.sc is not None or self.race.vsc or t - car.last_blue < 60:
            return
        car.last_blue = t
        self.rc(t, f"WAVED BLUE FLAG FOR {self.car_label(car)} TIMED AT {self.feed.ts(t)[11:19]}", "Flag",
                Flag="BLUE", Scope="Driver", RacingNumber=car.num)

    def on_chequered(self, t: float) -> None:
        self.finish_t = t
        self.rc(t, "CHEQUERED FLAG", "Flag", Flag="CHEQUERED", Scope="Track")

    def _finish_logic(self, t: float) -> None:
        race = self.race
        if self.finish_t is None:
            return
        if self.session_finished_t is None:
            running = [c for c in race.cars if not c.retired and not c.finished]
            if not running or t - self.finish_t > 200:
                self.session_finished_t = t
                self.feed.patch("SessionStatus", {"Status": "Finished"})
                self.feed.emit(t, "ExtrapolatedClock", self.clock(t, False))
                self.later(t + 60, lambda t2: self.feed.patch("SessionStatus", {"Status": "Finalised"}))
                self.later(t + 60, lambda t2: self.feed.patch("SessionInfo", {"ArchiveStatus": {"Status": "Complete"}}))
                self.later(t + 75, self._end)

    def _end(self, t: float) -> None:
        self.done = True
