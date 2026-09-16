# Balloon Defense

An idealized 3D Electron simulation of a hexagonally spaced stratospheric balloon interception grid protecting a hypothetical city.

The model deliberately assumes perfect fire-control information, guidance, and interception whenever at least one ready balloon satisfies the selected horizontal range and simplified flight-time screen after detection. Wind, adversary action, debris damage, communication failure, and many other real-world constraints are outside the simulation.

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
- `Rated horizontal range` is an accuracy-qualified engagement envelope, not a hard energy limit. At the default 10 km rating and 20 km fleet altitude, the nominal modeled shot starts at 19.3 km, descends to a 16 km intercept, follows a 10.61 km curved path, and requires at least 32.9 simulated seconds from commitment to intercept under the 2 g / 800 m/s performance screen. More warning could physically permit a longer flight, but accuracy and endgame uncertainty would normally degrade with reach. Because that degradation is not modeled—and interception is deliberately perfect inside the envelope—the simulation holds the selected rating as a hard horizontal cap instead of extending perfect accuracy indefinitely. Static coverage metrics are therefore labelled geometric; insufficient warning can still reduce dynamically feasible coverage for a particular missile.
- Each ballistic is fired from a randomized point 400–650 km from its target and follows a flat-Earth, constant-gravity parabola without aerodynamic drag. Launch elevation is 45–55 degrees. Under this simplification, impact speed equals launch speed. Speed is deliberately hidden during the pre-detection phase because the model omits powered boost and starts at full speed.
- The city radar is fixed at the center of the protected area. An optional forward radar sits 200 km toward the selected threat-sector center. Both use the editable instrumented slant range, while a geometric Earth-horizon check uses missile altitude and an assumed 30 m radar antenna height. Terrain, target signature, clutter, processing, and network latency remain outside the model. Detection changes the ballistic from `Fired` to `Tracked`, switches to the tracked-missile simulation speed, and commits available interceptors.
- Launch bearings are sampled uniformly across an editable threat sector. The default is a 90° sector centered northeast, spanning north through east. The forward-grid control adds hexagonal rows toward that sector without removing the baseline grid over the city; this raises both cell count and fleet cost.
- Interceptors launch immediately and accelerate from rest along a downward-curving path to the planned intercept point. Their displayed speed is calculated from distance travelled during each physics step.
- Firing consumes the selected airborne cell. The spent balloon descends gently at an assumed average 3 m/s and is shown in navy blue; its gray replacement waits for the chosen preparation time, then ascends at an assumed average 5 m/s. The interface derives ascent, recovery, and total replacement-ready times from fleet altitude.
- The Smart policy normally launches two nearest cells when both have all six ready neighbors. Near an edge or existing hole, it launches one candidate with the most ready neighbors, breaking ties by distance.
- Live telemetry reports speed and altitude for every rendered ballistic and interceptor. A ballistic is explicitly marked detected; destroyed or expended tracks remain orange until their explosion animation finishes.
- An explosion cloud inherits the destroyed projectile's velocity vector. Translation and drag use accelerated simulation time, matching the projectile's on-screen speed, while expansion uses display time so it remains visible. Main explosions last about 5.4 display seconds and interceptor bursts about 4 seconds. During the animation the cloud follows a quadratic-drag approximation, `dv/dt = -v²/L`, with stopping length `L = 0.65 + 0.09 × altitude` kilometres (minimum 0.6 km). This is an altitude-sensitive visual heuristic, not a fragment-dispersion model.
- Cost values are illustrative assumptions, editable in the cost dialog. Variable production costs are entered per cell before prime contractor profit or fee. One editable percentage (10% by default) is then applied once to that variable subtotal; bought-in component prices may already contain the suppliers' own margins. Fixed program engineering/software, qualification/flight testing, and tooling/setup are entered as total up-front non-recurring funding (a grant or other development vehicle could provide it). For the unit-equivalent comparison only, this fixed total is divided by an editable minimum expected production quantity of 1,000 cells. That denominator is a planning assumption, not an up-front purchase commitment. Range-scaled line items use simple power-law relationships around a 10 km rated-range reference. Fleet cost is unit-equivalent cell cost multiplied by the number of grid spaces.
- The PAC-3 comparison uses the FY2025 U.S. procurement-program total of $963.1 million for 230 rounds, or about $4.19 million per round. Neither figure includes sunk R&D or continuing operations, but the balloon-cell figure remains speculative rather than an engineering cost estimate.
