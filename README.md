# Songooner

**Name the track from 0.1 seconds.** A free, no-sign-up song guessing game that goes way past Songspot and Heardle.

Play it: **https://rithulbhat.github.io/songooner/**

![Songooner](public/og.png)

## What makes it better than Songspot

| | Songspot | Songooner |
|---|---|---|
| Clip lengths | 5 fixed stages (0.1 / 0.5 / 2 / 8 / 15 s) | Any length from **0.1 s to 10 s** on a log slider, or your own escalating stages (2–8 of them) |
| Tries | Fixed | 1–6 per song, plus hints (year, initials, cover peek, first letter) |
| Catalogue | 5 genres, one difficulty slider | **220 verified packs, 37,000+ songs**: 44 genres, 13 decades, 38 regions/languages (Bollywood, K-pop, Afrobeats, Punjabi, Tamil, Reggaeton, J-pop, Arabic, Brazilian…), 77 artist packs, vibes, soundtracks, charts. Mix as many as you like |
| Custom packs | No | Any artist on Deezer, any Deezer playlist/album link, or a search term |
| Modes | One | Classic, Fixed clip, Blitz (timed), Survival (lives, shrinking clips), Duel (same device with buzzer keys, or **online with room codes**), Party (2–8 players, pass the phone), Daily challenge, Challenge links |
| Audio tricks | None | Reverse, 0.5×–2× speed, pitch shift, lo-fi, 8-bit bitcrush — real Web Audio effects |
| Voice | None | **Say your guess** (speech recognition) and a **voice host** with four personalities that narrates the game |
| Scoring | Basic | Points scale with clip length, tries, speed, streaks and hints; XP, 14 ranks, 53 achievements |
| Stats | None | Accuracy per clip length, per pack, form over time, every song you've met, export/import |
| Where the clip starts | Start or preview | Start, random, chorus-ish middle, or end, replayed identically or re-rolled each try |
| Look | Plain | Spinning vinyl, live waveform visualizer, album-art blur reveal, confetti, synthesized sound effects, 4 themes, installable PWA |

Everything runs in the browser. Audio previews are streamed on demand from Deezer's public API; nothing is stored and nothing is uploaded.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest unit tests (~1,000)
npm run e2e        # Playwright (real Deezer + PeerJS)
npm run build      # typecheck + production build
npm run catalog:verify   # re-verify every pack against Deezer
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

See [CLAUDE.md](CLAUDE.md) for the architecture, contracts and scoring rules.

## Notes

- Not affiliated with Deezer. 30-second previews are fetched live; preview URLs expire after ~15 minutes and are refreshed automatically.
- Online duels use PeerJS's public signalling server without a TURN relay, so some strict corporate networks can't connect peer to peer. Same-device duel always works.
