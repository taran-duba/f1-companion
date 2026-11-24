"""Team radio for the demo race: a few short, fictional exchanges at key moments.

Each capture goes out on the ``TeamRadio`` topic like the real feed's, plus a
demo-only ``Text`` transcript (the real feed has no transcripts). The audio is
pre-rendered by ``make_radio.py`` into ``data/demo/radio/`` from the same
:data:`LINES`, so the generator never needs a speech engine. Nothing here
draws from the race's RNG: adding radio leaves the race itself unchanged.
"""

from __future__ import annotations

ENGINEER, DRIVER = "engineer", "driver"
SPOKEN = {"SOFT": "softs", "MEDIUM": "mediums", "HARD": "hards", "INTERMEDIATE": "inters", "WET": "full wets"}

# moment -> [(speaker, template)]. Fields: {first} {last} of the car's driver,
# {ahead} last name of the car ahead, {compound} spoken tyre name ("mediums").
LINES: dict[str, list[tuple[str, str]]] = {
    "battle": [(ENGINEER, "Gap to {ahead} is eight tenths. DRS is enabled, push now."),
               (DRIVER, "Copy. His rears are going.")],
    "rain": [(DRIVER, "It's raining at turn five. Getting slippery."),
             (ENGINEER, "Understood. Inters are ready if you need them.")],
    "inters": [(ENGINEER, "Box this lap, box this lap. Inters are ready."),
               (DRIVER, "Copy, boxing.")],
    "crash": [(DRIVER, "I've lost the rear. I'm in the wall, sorry guys."),
              (ENGINEER, "Are you OK, {first}?"),
              (DRIVER, "Yeah, I'm OK.")],
    "sc_stay": [(ENGINEER, "Safety car, safety car. Stay out, stay out.")],
    "sc_box": [(ENGINEER, "Safety car. Box, box. Box this lap for {compound}.")],
    "slicks": [(DRIVER, "Track is drying fast. These inters are cooked."),
               (ENGINEER, "Agreed. Box this lap for {compound}.")],
    "vsc": [(ENGINEER, "VSC, VSC. Keep the delta positive.")],
    "fastest": [(ENGINEER, "Fastest lap of the race, {first}. Great lap."),
                (DRIVER, "Yes! Car feels mega now.")],
    "winner": [(ENGINEER, "P1! That's P1, {first}! What a drive!"),
               (DRIVER, "Get in there! Thank you everyone, what a race!")],
}


class Radio:
    def __init__(self, race) -> None:
        self.race = race
        self.count = 0
        self.per_driver: dict[str, int] = {}
        self.done: set[str] = set()
        # Rendered clips for make_radio.py: [(path, [(speaker, text)])].
        self.clips: list[tuple[str, list[tuple[str, str]]]] = []

    def say(self, t: float, moment: str, car, delay: float = 2.0, **fields) -> None:
        """Queue one capture for ``car``, ``delay`` s after ``t``; each moment is used at most once."""
        if moment in self.done or car is None:
            return
        self.done.add(moment)
        info = car.info
        fields = {"first": info.first, "last": info.last, **fields}
        parts = [(who, text.format(**fields)) for who, text in LINES[moment]]
        n = self.per_driver[info.tla] = self.per_driver.get(info.tla, 0) + 1
        path = f"TeamRadio/{info.tla}_{n}.m4a"
        self.clips.append((path, parts))

        def emit(t2: float) -> None:
            capture = {"Utc": self.race.feed.ts(t2), "RacingNumber": car.num, "Path": path,
                       "Text": " ".join(text for _, text in parts)}
            self.race.feed.patch("TeamRadio", {"Captures": {str(self.count): capture}})
            self.count += 1
            self.race.note(t2, f"radio {path}")
        self.race.director.later(t + delay, emit)

    def _running(self) -> list:
        return [c for c in self.race.order if not c.retired and not c.finished]

    # -- hooks ---------------------------------------------------------
    def on_leader_lap(self, t: float, laps: int, rain_on_lap: int) -> None:
        running = self._running()
        if laps == 4 and len(running) >= 2 and self.race.drs_enabled:
            self.say(t, "battle", running[1], ahead=running[0].info.last)
        if laps == rain_on_lap + 1 and running:
            self.say(t, "rain", running[0], delay=6.0)

    def on_pit_call(self, t: float, car, compound: str | None, old: str) -> None:
        if compound == "INTERMEDIATE":
            self.say(t, "inters", car)
        elif compound and old == "INTERMEDIATE":
            self.say(t, "slicks", car, compound=SPOKEN.get(compound, compound.lower()))

    def on_safety_car(self, t: float) -> None:
        running = self._running()
        stay = next((c for c in running if not c.want_pit), None)
        box = next((c for c in running if c.want_pit), None)
        self.say(t, "sc_stay", stay, delay=1.0)
        if box is not None:
            self.say(t, "sc_box", box, compound=SPOKEN.get(box.want_pit, box.want_pit.lower()), delay=4.0)

    def on_vsc(self, t: float) -> None:
        running = self._running()
        self.say(t, "vsc", running[min(2, len(running) - 1)] if running else None)

    def on_fastest_lap(self, t: float, car) -> None:
        if self.race.leader_laps >= 0.6 * self.race.total:
            self.say(t, "fastest", car)

    def on_crash(self, t: float, car) -> None:
        self.say(t, "crash", car, delay=4.0)

    def on_chequered(self, t: float, winner) -> None:
        self.say(t, "winner", winner, delay=3.0)
