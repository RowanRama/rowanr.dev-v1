# rowanr.dev

My portfolio, as a game. You drive an AMR with an industrial arm on top up a spiral road around an island mountain, and each stop is a chapter of my timeline: studies, research, projects and the places I've worked. Interests sit around the island as unlabelled scenery, waiting to be found.

Live at [rowanr.dev](https://rowanr.dev/).

- **Desktop:** WASD or the arrow keys to drive, Shift to boost. Hold the left or right mouse button and drag to look around. The dots in the header jump to a stop.
- **Phones and tablets:** scroll to move the AMR along the road. Drive mode adds an on-screen stick.
- **Text version:** the button in the header, or automatic when WebGL is missing. Every word is plain HTML in `index.html`, so the site also reads fine with scripts off and to search engines.

Built with Vite, TypeScript and three.js, with no framework. Every model is built in code, so there are no 3D assets to load.

## Run

Needs Node 20 or newer.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks, then writes dist/
npm run preview  # serves dist/
```

## Branches and deploys

| Branch | What it holds |
| --- | --- |
| `main` | This site (v2). Netlify deploys it to rowanr.dev on every push. |
| `v1` | The previous Gatsby site, kept for reference. It builds with Node 14. |

`netlify.toml` holds all of the Netlify setup, so the dashboard needs no changes:

- the build command (`npm run build`), the publish folder (`dist`) and Node 22;
- 301 redirects from the old site's pages (`/archive`, `/pensieve/*`, `/resume.pdf`) to the home page;
- security headers, and long-lived caching for the hashed files in `/assets`.

## Where things are

| File | What it does |
| --- | --- |
| `index.html` | Every stop's text as `<article data-station="...">`, the job list behind the billboards, and the page's metadata and structured data |
| `src/main.ts` | Entry: WebGL check, the text version toggle, and loading `game.ts` only when the 3D view is used |
| `src/game.ts` | Renderer, bloom, lighting, the main loop, modes and camera framing |
| `src/world.ts` | Island height field, spiral road, water, dusk sky, trees, the orbital ring and the summit beam |
| `src/stations.ts` | Each stop and scenery piece, and where it sits (`DEFS`) |
| `src/roadside.ts` | Hologram job billboards, year signs and the light posts along the road |
| `src/fleet.ts` | Frigates, a submarine, a helicopter and aircraft offshore from the 2022 simulation stop |
| `src/ampf.ts` | The live multi-arm planner: contours, greedy allocation, prefilter, replanning and the Gantt chart |
| `src/models.ts` | Shared models: the six-axis arm with IK, the AMR, drones, the rover, people and stop signs |
| `src/player.ts` | Driving, terrain tilt, collisions and the cameras |
| `src/hud.ts` | Timeline dots, minimap, input and the scroll tour |
| `src/style.css` | The HUD, info cards and text version |
| `public/` | Favicon, link-preview image (`og.jpeg`), `robots.txt`, `sitemap.xml`, `llms.txt` and the 404 page |

## Editing

- **Add a stop:** add an `<article data-station="id" data-sign="Sign text">` to `index.html`, and a matching entry in `DEFS` in `src/stations.ts`. Each entry has a `u` (how far along the road, 0 to 1) and a build function.
- **Add a scenery piece:** add an entry to `DEFS` with `scenery: {}`. It gets no card, no sign and no timeline dot.
- **Add a job billboard:** add a `<li data-billboard data-u="..." data-color="...">` to the "Where I've worked" list in `index.html`.
- **After changing content:** update `public/llms.txt` and the `lastmod` date in `public/sitemap.xml` to match.
