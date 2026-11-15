# rowanr.dev v2

A static portfolio you drive: an AMR with an industrial arm on top climbs a spiral road up an island mountain, one stop per chapter of the timeline. Interests (diving, soccer, hiking, climbing, skiing) are scattered around the island as scenery.

- Desktop: WASD or arrow keys to drive, Shift to boost, hold the left or right mouse button and drag to look around. The dots in the header jump to a stop.
- Phones and tablets: scrolling moves the AMR along the road (Drive mode adds an on-screen stick).
- Text version: the button in the header, or automatically when WebGL is missing. All content lives as plain HTML in `index.html`, so it also reads fine with scripts off.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks, then writes dist/
npm run preview  # serves dist/
```

## Deploy

Static files in `dist/`. `netlify.toml` already sets the build command and publish folder; point the rowanr.dev site at this repo.

## Where things are

| File | What it does |
| --- | --- |
| `index.html` | Every station's text, as `<article data-station="...">` |
| `src/world.ts` | Island height field, spiral road, water, sky, trees |
| `src/stations.ts` | Each stop and scenery piece, and where it sits (`DEFS`) |
| `src/ampf.ts` | The live multi-arm planner: contours, greedy allocation, prefilter, replanning, Gantt |
| `src/models.ts` | Procedural models: six-axis arm with IK, AMR, drones, rover, people, signs |
| `src/main.ts` | Entry: WebGL check, text version toggle, loads `game.ts` only when the 3D view is used |
| `src/game.ts` | Renderer, scene, main loop, modes, camera framing |
| `src/player.ts` | Driving, terrain tilt, colliders, cameras |
| `src/hud.ts` | Timeline dots, minimap, input, scroll tour |
| `src/fleet.ts` | Frigates, a submarine, a helicopter and aircraft offshore from the simulation stop |
| `src/roadside.ts` | Job billboards (from the `data-billboard` list in `index.html`) and year markers |

To add a stop: add an `<article data-station="id" data-sign="Sign text">` to `index.html` and a matching entry in `DEFS` with a `u` (0 to 1 along the road) and a build function.
