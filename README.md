# Balloon Defense

An idealized 3D Electron simulation of a hexagonally spaced stratospheric balloon interception grid protecting a hypothetical city.

The model deliberately assumes perfect detection, fire-control information, guidance, and interception whenever at least one ready balloon is within the selected horizontal range. Wind, adversary action, debris damage, communication failure, and many other real-world constraints are outside the simulation.

## Run

```powershell
npm install
npm start
```

## Build a Windows app

```powershell
npm run dist
```

The unpacked application is written to `release/win-unpacked`.

To build a portable executable instead:

```powershell
npm run portable
```

## Model notes

- One scene unit equals one kilometre. Balloon sizes and city buildings are visually exaggerated.
- Incoming events use exponentially distributed inter-arrival times, producing a Poisson process at the selected hourly rate.
- Simulation speed switches automatically between two editable rates: 20× by default while no tracks are active and 2× from detection through the end of the orange explosion telemetry.
- Coverage is sampled across the selected polygon and reports both the protected fraction and the average number of ready interceptors in range.
- `Rated horizontal range` is a purchased interceptor design limit, not a promise that the full radius is usable in every engagement. At detection, candidates must satisfy both that horizontal cap and a time-to-intercept screen based on their sampled curved 3D path. The current simplified performance envelope is 2 g maximum acceleration and 800 m/s maximum speed. Static coverage metrics are therefore labelled geometric; warning time can reduce dynamically feasible coverage for a particular missile.
- Each ballistic is fired from a randomized point 400–650 km from its target and follows a flat-Earth, constant-gravity parabola without aerodynamic drag. Launch elevation is 45–55 degrees. Under this simplification, impact speed equals launch speed. Speed is deliberately hidden during the pre-detection phase because the model omits powered boost and starts at full speed.
- A notional external ground radar is assumed to be about 200 km from the target. Detection is sampled 60–120 seconds after firing and is constrained to occur before the apex. This is a scenario assumption, not a calculation from the radar and launch geometry; actual timing depends on relative placement, horizon, terrain, target signature, processing, and network latency. Detection changes the ballistic from `Fired` to `Tracked`, switches to the tracked-missile simulation speed, and commits available interceptors.
- Interceptors launch immediately and accelerate from rest along a downward-curving path to the planned intercept point. Their displayed speed is calculated from distance travelled during each physics step.
- Firing consumes the selected airborne cell. The spent balloon descends gently at an assumed average 3 m/s. Its replacement waits for the chosen preparation time, then ascends at an assumed average 5 m/s. The interface derives ascent, recovery, and total replacement-ready times from fleet altitude.
- The Smart policy normally launches two nearest cells when both have all six ready neighbors. Near an edge or existing hole, it launches one candidate with the most ready neighbors, breaking ties by distance.
- Live telemetry reports speed and altitude for every rendered ballistic and interceptor. A ballistic is explicitly marked detected; destroyed or expended tracks remain orange until their explosion animation finishes.
- An explosion cloud inherits the destroyed projectile's velocity vector. Translation and drag use accelerated simulation time, matching the projectile's on-screen speed, while expansion uses display time so it remains visible. Main explosions last about 5.4 display seconds and interceptor bursts about 4 seconds. During the animation the cloud follows a quadratic-drag approximation, `dv/dt = -v²/L`, with stopping length `L = 0.65 + 0.09 × altitude` kilometres (minimum 0.6 km). This is an altitude-sensitive visual heuristic, not a fragment-dispersion model.
- Cost values are illustrative assumptions, editable in the bill-of-materials dialog. The displayed cell figure is now a procurement-equivalent estimate: recurring balloon/interceptor hardware plus production integration and acceptance, allocated ground support and spares, program engineering/software, and production contingency. Range-scaled line items use simple power-law relationships around a 10 km rated-range reference. Cost does not change from event to event: earlier detection increases the usable portion of an already-purchased performance envelope, while designing for later detection would require selecting and costing a higher performance rating. Fleet cost is cell cost multiplied by the number of grid spaces.
- The PAC-3 comparison uses the FY2025 U.S. procurement-program total of $963.1 million for 230 rounds, or about $4.19 million per round. Neither figure includes sunk R&D or continuing operations, but the balloon-cell figure remains speculative rather than an engineering cost estimate.
