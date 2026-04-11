# Plan 1: Core Single-Player Tetris

## Context
Building a web-based multiplayer Tetris game inspired by tetr.io. The key
differentiator is adaptive garbage sending that handicaps based on skill level
to even out win rates between players of different abilities. The user plays
with siblings who have very different skill levels.

This is the first of three plans:
1. **Core single-player Tetris** (this plan) — playable game in the browser
2. Multiplayer — server, real-time sync, lobby, garbage sending
3. Adaptive balancing — skill tracking, handicap system

## Tech Stack
- TypeScript + React for the frontend
- Canvas or WebGL for game rendering
- Node.js + WebSockets for the server (later plans)
- The user is a seasoned developer but new to web apps

## Goals for This Plan
Build a complete, polished single-player Tetris game that runs in the browser:
- Standard Tetris mechanics (SRS rotation, wall kicks, lock delay)
- All standard piece types (I, O, T, S, Z, J, L)
- Next piece preview and hold piece
- Scoring system (lines cleared, combos, T-spins)
- Ghost piece (shadow showing where the piece will land)
- Increasing speed/levels
- Responsive keyboard controls with DAS/ARR (delayed auto-shift / auto-repeat rate)
- Clean, modern UI inspired by tetr.io's aesthetic
- Sound effects (optional but nice to have)

## Architecture Notes
- Game logic should be cleanly separated from rendering so it can be reused
  in multiplayer (Plan 2). Consider a game engine class that ticks on a timer
  and emits state, with React/Canvas just rendering that state.
- The board is a 10-wide, 20-tall (with hidden rows above) grid.
- Use the SRS (Super Rotation System) which is the modern Tetris standard.
