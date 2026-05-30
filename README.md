# Overhead

<img src="https://media.giphy.com/media/gf6cdSoWFHU7h8WEh3/giphy.gif" width="400">  <img src="https://media.giphy.com/media/elJopZSmWUj3l5UWQM/giphy.gif" width="400">

<img src="https://media.giphy.com/media/QvdtfdGUijNjRjVJks/giphy.gif" width="400">  <img src="https://media.giphy.com/media/Md4kdHRfcWkaPgJbFv/giphy.gif" width="400">

Tower defense game made with Unity!

## Playing the game

You can download and play Overhead on its [itch.io page](https://chicomcastro.itch.io/overhead).

### Web version

A standalone browser remake lives in [`web/`](web/) — no install, no Unity, no build step.
Open `web/index.html` in any modern browser (or serve the folder, e.g. `cd web && python3 -m http.server`)
and play directly. It recreates the core loop of the original: defend the Master Tower from
escalating waves of souls, spend **souls** to build defensive spheres along the path, and use
each sphere's special effects (slow, fatal hit, area damage, burn, soul bonus) to survive.

Features: 4 sphere types with upgrades (3 levels each), 4 enemy types (boss every 5 waves),
20 escalating waves, synthesized sound effects (Web Audio, no asset files), and a local
top‑10 leaderboard saved in `localStorage`.

Controls: click a sphere in the shop then click a blue **node** to build; click a placed tower
to see its range, **upgrade** it (`U`) or sell it. Keys `1`–`4` pick a sphere, `Space` starts
the next wave, `P` pauses, `Esc` cancels selection.

Once merged to `master`, the web version is deployed automatically to **GitHub Pages**
via [`.github/workflows/pages.yml`](.github/workflows/pages.yml) and served at
`https://chicomcastro.github.io/Overhead/`.

## About

Overhead was a National finalist on the Brazilian Games Symposium 2017 (SBGames) on Best Game, Best Student Game and Best Technology categories.

It was originally developed to compete CIG 2017, in which also won the first place. CIG 2017 is the Intituto Tecnologico de Aeronautica - [ITA](http://www.ita.br/) - internal game development competition.

It was also the only student game selected in Best Game category on SBGames 2017.

## Notes about contributing

If any substantial change is made, please, contact any of the authors.
