"""Synthetic closed circuit: geometry, speed profile and timing points.

The centreline is a centripetal Catmull-Rom spline through hand-placed
control points (a long main straight, a back straight, a hairpin, a chicane
and a few sweepers), resampled at ~2 m. All distances are metres; the feed
uses decimetres, so callers multiply X/Y/Z by 10.
"""

from __future__ import annotations

import math

# Corner vertices (x, y, radius) in metres before scaling, counter-clockwise.
# Straights join consecutive vertices; each vertex is rounded with an arc of
# the given radius. Vertex 0 -> 1 is the main straight, 6 -> 7 the back straight.
VERTICES: list[tuple[float, float, float]] = [
    (-820, 0, 70),      # final corner onto the main straight
    (900, 0, 42),       # T1 heavy braking
    (960, 300, 70),
    (640, 380, 48),
    (600, 650, 130),
    (850, 850, 85),
    (820, 1150, 26),    # tight hairpin-like corner onto the back straight
    (-350, 1080, 24),   # chicane
    (-450, 980, 26),
    (-700, 960, 95),
    (-760, 600, 60),
    (-500, 420, 34),
    (-880, 260, 62),
]
START_LINE_X = -200.0           # unscaled x of the start/finish line on the main straight
BACK_STRAIGHT_VERTEX = 6

V_MAX = 93.0                    # m/s (335 kph)
PIT_SPEED = 80 / 3.6            # pit lane speed limit, m/s
PIT_OFFSET = 22.0               # pit lane lateral offset from the centreline, m


def _unit(dx: float, dy: float) -> tuple[float, float]:
    n = math.hypot(dx, dy)
    return dx / n, dy / n


def _fillet_path(step: float = 0.5) -> tuple[list[tuple[float, float]], list[tuple[int, int]]]:
    """Dense centreline points plus (arc start index, arc end index) per vertex."""
    vs = VERTICES
    n = len(vs)
    arcs = []
    for i in range(n):
        px, py, _ = vs[i - 1]
        vx, vy, r = vs[i]
        nx_, ny_, _ = vs[(i + 1) % n]
        d1 = _unit(vx - px, vy - py)
        d2 = _unit(nx_ - vx, ny_ - vy)
        cross = d1[0] * d2[1] - d1[1] * d2[0]
        dot = d1[0] * d2[0] + d1[1] * d2[1]
        theta = math.atan2(cross, dot)
        t = r * math.tan(abs(theta) / 2)
        a = (vx - d1[0] * t, vy - d1[1] * t)
        b = (vx + d2[0] * t, vy + d2[1] * t)
        sign = 1.0 if theta > 0 else -1.0
        c = (a[0] - d1[1] * r * sign, a[1] + d1[0] * r * sign)
        arcs.append((a, b, c, r, theta, sign))
    pts: list[tuple[float, float]] = []
    marks: list[tuple[int, int]] = []
    for i in range(n):
        a, b, c, r, theta, sign = arcs[i]
        a0 = math.atan2(a[1] - c[1], a[0] - c[0])
        k = max(2, int(abs(theta) * r / step))
        i0 = len(pts)
        for j in range(k):
            ang = a0 + theta * j / k
            pts.append((c[0] + r * math.cos(ang), c[1] + r * math.sin(ang)))
        marks.append((i0, len(pts)))
        nb = arcs[(i + 1) % n][0]
        seg = math.dist(b, nb)
        if seg < 1.0:
            raise ValueError(f"corner {i} radius too large for its straights")
        k = max(1, int(seg / step))
        for j in range(k):
            f = j / k
            pts.append((b[0] + (nb[0] - b[0]) * f, b[1] + (nb[1] - b[1]) * f))
    return pts, marks


def _accel(v: float) -> float:
    return max(0.6, 15.0 * (1.0 - (v / 97.0) ** 2))


def _brake(v: float) -> float:
    return 17.0 + 30.0 * (v / 90.0) ** 2


class Track:
    def __init__(self, target_length: float = 5000.0, ds: float = 2.0) -> None:
        dense, marks = _fillet_path()
        cum = [0.0]
        for i in range(1, len(dense) + 1):
            cum.append(cum[-1] + math.dist(dense[i - 1], dense[i % len(dense)]))
        raw_len = cum[-1]
        scale = target_length / raw_len
        self.scale = scale
        self.length = target_length
        n = int(round(target_length / ds))
        self.n = n
        self.ds = target_length / n
        # Start/finish line: the main-straight point nearest START_LINE_X.
        lo, hi = marks[0][1], marks[1][0]
        j_start = min(range(lo, hi), key=lambda k: abs(dense[k][0] - START_LINE_X))
        start_raw = cum[j_start]
        # Resample by arc length, rotated so s=0 is the start/finish line.
        xs, ys = [], []
        j = 0
        for i in range(n):
            target = (i * self.ds / scale + start_raw) % raw_len
            if target < cum[j]:
                j = 0
            while cum[j + 1] < target:
                j += 1
            f = (target - cum[j]) / max(cum[j + 1] - cum[j], 1e-9)
            a, b = dense[j], dense[(j + 1) % len(dense)]
            xs.append((a[0] + (b[0] - a[0]) * f) * scale)
            ys.append((a[1] + (b[1] - a[1]) * f) * scale)
        self._back_straight = ((cum[marks[BACK_STRAIGHT_VERTEX][1]] - start_raw) * scale) % target_length
        # Centre the circuit on the origin.
        cx = (max(xs) + min(xs)) / 2
        cy = (max(ys) + min(ys)) / 2
        self.xs = [x - cx for x in xs]
        self.ys = [y - cy for y in ys]
        self._geometry()
        self._speed_profile()
        self._timing_points()

    # -- geometry -------------------------------------------------------
    def _geometry(self) -> None:
        n, xs, ys = self.n, self.xs, self.ys
        head = [math.atan2(ys[(i + 1) % n] - ys[i], xs[(i + 1) % n] - xs[i]) for i in range(n)]
        self.nx = [-math.sin(h) for h in head]  # left normal
        self.ny = [math.cos(h) for h in head]
        raw = []
        for i in range(n):
            d = head[i] - head[i - 1]
            d = (d + math.pi) % (2 * math.pi) - math.pi
            raw.append(abs(d) / self.ds)
        w = 8
        self.kappa = [sum(raw[(i + k) % n] for k in range(-w, w + 1)) / (2 * w + 1) for i in range(n)]
        area = sum(xs[i] * ys[(i + 1) % n] - xs[(i + 1) % n] * ys[i] for i in range(n))
        # CCW loop -> interior is on the left; the pit lane sits on the interior.
        self.pit_side = 1.0 if area > 0 else -1.0
        self.zs = [6.0 * math.sin(2 * math.pi * i / n) + 2.5 * math.sin(6 * math.pi * i / n + 1.0) for i in range(n)]

    def _speed_profile(self) -> None:
        n, ds = self.n, self.ds
        v = []
        for k in self.kappa:
            if k <= 0.0035:
                v.append(V_MAX)
            else:
                v.append(min(V_MAX, math.sqrt(25.0 / (k - 0.0035))))
        for _ in range(2):
            for i in range(n):
                j = (i + 1) % n
                v[j] = min(v[j], math.sqrt(v[i] ** 2 + 2 * _accel(v[i]) * ds))
        for _ in range(2):
            for i in range(n - 1, -1, -1):
                j = (i + 1) % n
                v[i] = min(v[i], math.sqrt(v[j] ** 2 + 2 * _brake(v[j]) * ds))
        self.v_prof = v
        self.ref_lap_time = sum(ds / max(x, 1.0) for x in v)
        # longitudinal acceleration along the profile (m/s^2)
        self.a_prof = [(v[(i + 1) % n] ** 2 - v[i] ** 2) / (2 * ds) for i in range(n)]

    def _first_braking_after(self, s: float) -> float:
        i = self.idx(s)
        for k in range(self.n):
            j = (i + k) % self.n
            if self.a_prof[j] < -8.0:
                return j * self.ds
        return s

    def _argmax_v(self, a: float, b: float) -> float:
        best, bs = -1.0, a
        s = a
        while s < b:
            v = self.v_at(s)
            if v >= best:   # ties -> the latest point (end of a flat-out straight)
                best, bs = v, s
            s += self.ds
        return bs

    def _timing_points(self) -> None:
        L = self.length
        self.sector_ends = [round(L * 0.33, 1), round(L * 0.67, 1), L]
        seg_counts = [7, 8, 7]
        self.seg_counts = seg_counts
        tps: list[float] = []
        tp_sector: list[int] = []
        tp_seg: list[int] = []
        prev = 0.0
        for si, end in enumerate(self.sector_ends):
            cnt = seg_counts[si]
            for k in range(cnt):
                tps.append(prev + (end - prev) * (k + 1) / cnt)
                tp_sector.append(si)
                tp_seg.append(k)
            prev = end
        self.tps, self.tp_sector, self.tp_seg = tps, tp_sector, tp_seg
        self.ntp = len(tps)
        # Pit lane spans the start/finish line.
        self.pit_entry = L - 280.0
        self.pit_exit = 220.0
        self.pit_box = L - 70.0
        # DRS zones: (detection, start, end)
        z1_start = 140.0
        z1_end = self._first_braking_after(z1_start) - 20
        back = self._back_straight + 40.0
        z2_end = self._first_braking_after(back) - 20
        self.drs_zones = [(L - 1.0, z1_start, z1_end), (back - 220.0, back, z2_end)]
        self.overtake_points = [z1_start + 60.0, back + 60.0]
        s1, s2 = self.sector_ends[0], self.sector_ends[1]
        self.speed_traps = {
            "ST": self._argmax_v(0.0, z1_end + 40),
            "I1": self._argmax_v(z1_end + 200, s1),
            "I2": self._argmax_v(s1, s2),
            "FL": L - 40.0,
        }
        self.corners = self._find_corners()

    def _find_corners(self) -> list[float]:
        v, n = self.v_prof, self.n
        w = 50
        out = []
        for i in range(n):
            if v[i] > 0.86 * V_MAX:
                continue
            if all(v[i] <= v[(i + k) % n] for k in range(-w, w + 1) if k):
                if not out or i * self.ds - out[-1] > 120:
                    out.append(i * self.ds)
        return out

    # -- lookups --------------------------------------------------------
    def idx(self, s: float) -> int:
        return int((s % self.length) / self.ds) % self.n

    def v_at(self, s: float) -> float:
        return self.v_prof[self.idx(s)]

    def a_at(self, s: float) -> float:
        return self.a_prof[self.idx(s)]

    def corner_at(self, s: float) -> int:
        """1-based number of the nearest corner at or after ``s``."""
        s %= self.length
        for i, c in enumerate(self.corners):
            if c >= s - 60:
                return i + 1
        return 1

    def segment_number(self, s: float) -> int:
        """1-based 'track sector' (marshal sector) number used in RC messages."""
        s %= self.length
        for i, tp in enumerate(self.tps):
            if s < tp:
                return i + 1
        return self.ntp

    def xyz(self, s: float, lateral: float = 0.0) -> tuple[float, float, float]:
        s %= self.length
        f = s / self.ds
        i = int(f) % self.n
        j = (i + 1) % self.n
        u = f - int(f)
        x = self.xs[i] + (self.xs[j] - self.xs[i]) * u + self.nx[i] * lateral
        y = self.ys[i] + (self.ys[j] - self.ys[i]) * u + self.ny[i] * lateral
        z = self.zs[i] + (self.zs[j] - self.zs[i]) * u
        return x, y, z

    def pit_lateral(self, s: float) -> float:
        """Lateral offset of the pit lane at track distance ``s`` (0 if not in lane)."""
        L = self.length
        s %= L
        d_in = (s - self.pit_entry) % L          # distance since pit entry
        span = (self.pit_exit - self.pit_entry) % L
        if d_in > span:
            return 0.0
        blend = 60.0
        f = min(1.0, d_in / blend, (span - d_in) / blend)
        return self.pit_side * PIT_OFFSET * max(0.0, f)
