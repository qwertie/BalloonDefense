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
- Coverage is sampled across the selected polygon and reports both the protected fraction and the average number of ready interceptors in range.
- Ballistics enter the rendered terminal phase already detected at 58–65 km altitude. Each follows a straight path to a uniformly sampled point in the city. Its initial speed is selected to preserve the sampled 30–38 second arrival time, then speed increases under the component of gravity parallel to that path: `a = g × vertical drop / path length`.
- Interceptors launch immediately and accelerate from rest along a downward-curving path to the planned intercept point. Their displayed speed is calculated from distance travelled during each physics step.
- Firing consumes the selected airborne cell. The spent balloon descends gently at an assumed average 3 m/s. Its replacement waits for the chosen preparation time, then ascends at an assumed average 5 m/s. The interface derives ascent, recovery, and total replacement-ready times from fleet altitude.
- The Smart policy normally launches two nearest cells when both have all six ready neighbors. Near an edge or existing hole, it launches one candidate with the most ready neighbors, breaking ties by distance.
- Live telemetry reports speed and altitude for every rendered ballistic and interceptor. A ballistic is explicitly marked detected; destroyed or expended tracks remain orange until their explosion animation finishes.
- Cost values are illustrative assumptions, editable in the bill-of-materials dialog. Range-scaled line items use simple power-law relationships around a 10 km reference range; they are not procurement estimates. Fleet cost is cell cost multiplied by the number of grid spaces.
- The cost comparison is not like-for-like: the simulator's cell figure is an illustrative recurring bill of materials, while public PAC-3 MSE figures include varying combinations of missiles, ancillary hardware, support, and program costs. The cell estimate excludes development, qualification, system integration, ground equipment, operations, spares, and failed rounds.
