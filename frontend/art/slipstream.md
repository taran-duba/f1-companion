# Slipstream

*An algorithmic philosophy for the F1 Companion background*

**Slipstream** is the moment a car tucks into the air another has already opened: nothing
touches, yet everything is connected. The work treats a race as a field of invisible
pressure rather than a set of objects. There is no track drawn anywhere. There is only
a closed curve the algorithm knows about and never shows, and a thousand fine lines that
have all, in their own time, felt its pull.

**The invisible circuit.** Every seed grows its own circuit from three stacked harmonics
of an ellipse: a long straight, a hairpin, a flowing complex. The curve is rendered
into a distance field, so any point on the canvas knows how far it is from the racing
line and which way the line runs beside it. Near the circuit the field is almost
purely tangential: lines obey it and bundle into dense, parallel ribbons, the way
a train of cars fans out along a straight. Far from it, the field forgets the circuit
and surrenders to curl noise, a divergence-free swirl that never converges and never
leaves a line stranded. The tension between obedience and drift is the whole piece:
`tightness` decides how far the circuit's authority reaches, `wander` decides how loud the
noise is once it is gone.

**Starting positions.** Most lines begin close to the circuit, scattered along its normal
by a Gaussian whose width follows the same authority radius; the rest begin anywhere.
That ratio is fixed, so that every seed has a legible centre of gravity and a quiet
periphery. A line is integrated forward through the field, tapers in and out like a
breath, and is drawn additively so overlap becomes light. Where a hundred lines agree,
the canvas glows; where they disagree, it stays dark.

**Colour as heat.** Three tones only, drawn from the live timing interface itself: ember
amber, warm white and rust. Alpha is a function of proximity, never of chance. The
palette is heat, not decoration: the most obedient lines are the hottest.

**Time.** A single seed is a still image, and the page treats it as one. It draws itself
in once, in the order the lines were born, then holds. A handful of comets then travel
the hottest streamlines at the pace of a lap, and surge when a lap completes. The whole
field leans toward amber for yellow flags and red for red flags, so the background reports
the race without a word.

**Craft.** The same seed always produces the same image: the random generator, the
noise lattice, the circuit and the integration are all deterministic, down to the last
point. Every parameter does one thing and does it visibly. Nothing in the piece is
random for its own sake; chance is spent only on the choices a seed is allowed to make.
Quietly, the piece borrows one idea from its subject: in the real thing, the fastest
line is rarely the shortest one, and the lines here that glow the most are not the
straightest, but the ones most willing to be pulled.

## Parameters

| name | range | what it does |
|---|---|---|
| `seed` | integer | the circuit, the noise, every start position |
| `density` | 300 – 1600 | number of lines |
| `tightness` | 0 – 1 | radius of the circuit's authority; high = narrow, hot ribbons |
| `wander` | 0 – 1 | strength of the curl noise away from the circuit |
