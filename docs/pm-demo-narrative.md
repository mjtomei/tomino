# pm demo: From 3 lines to a working multiplayer game

## The starting point

A `notes.txt` file with three lines:

```
- multiplayer version of tetris with adaptive garbage sending
  - adapts based on skill level to handicap more skilled player and even out win rates
- supports online play
```

No architecture doc, no tech spec, no task tracker.

## The design philosophy

pm was designed around a specific idea: **treat LLM agents as equal participants in the project, not as tools pointed at a task list.**

Existing task dashboards — Jira, Linear, GitHub Projects — are built for humans to manage and for other humans (or occasionally scripts) to read. Even when they have APIs, they don't have the prompting, task flows, or awareness of how LLMs work that would let an agent operate as a first-class participant. An agent reading a Jira board is squinting at something designed for someone else.

pm is built the other way around. The project structure, the plans, the dependency graph, the review and QA flows — all of it is designed so that agents have maximum visibility into the project and can act on it with full context. The goal is to make as much as possible happen without the user having to think about it, while still following good development practices. And it achieves that by treating the agents more as collaborators than tools — they decompose the work, they schedule themselves, they review each other's output, they evolve the plan as they learn.

## What happened

The pm guide agent expanded those three lines into three layered plans — core single-player Tetris, multiplayer networking, and adaptive skill balancing — totaling 50+ PRs with a full dependency graph. The human's role during planning was not scoping or architecture. It was stepping in at a few places where the system missed things that required understanding *how the game should feel* — how garbage sending should work dynamically, how handicaps should feel fair to human players. Design intent, not engineering decomposition.

With the dependency graph in place, `autostart` began executing. Agents picked up PRs whose dependencies had merged, implemented them, opened GitHub PRs, and moved on. Work proceeded nonlinearly — the engine, rating system, lobby UI, and network protocol all advanced in parallel because the dependency graph made it safe to do so.

Partway through, a fourth plan was added: automated testing infrastructure. This included a seeded PRNG, board builder utilities, game test harnesses, Playwright E2E setup, and coverage thresholds. This plan gave review agents the ability to actually verify code — including running end-to-end tests — without any human interaction.

## The result

- **3 lines** of input
- **~2 hours** of human time (initial setup, guiding plans, tweaking a few design decisions)
- **16+ hours** of autonomous agent execution
- **>250 commits**, **>50 merged PRs**, **>30,000 lines of code** (>14k production, >18k tests)
- A working multiplayer Tetris game with real-time networking, lobby system, garbage mechanics, Glicko-2 skill rating, adaptive handicapping, and end-to-end test coverage

The one time the developer sat down to play the game, it was playable. The bugs found were UX-level: down-arrow auto-repeat scrolling the browser page instead of soft-dropping, DAS/ARR not feeling right on side arrow keys. 

## Why not just point an AI at an existing task tracker?

The dismissive reading is that pm is just a complicated agent management system. But existing tools aren't designed with agents as participants:

**The decomposition is the product.** If you point Claude at a Jira board, someone already decided what the tasks are, how they depend on each other, and how big each one is. That planning work is the hard part — it's the tech lead's job. pm starts from "here's what I want to build", produces the decomposition itself, and manages orchestration of parallel agents.

**Dependency-driven scheduling enables safe parallelism.** pm's autostart won't begin a PR until its dependencies have merged. That's what lets multiple agents work simultaneously without stepping on each other. Pointing an AI at a flat task list gives you serial execution with manual coordination.

**The plan evolves with the project.** The testing plan was added after implementation was underway. PRs were extended to include requirements for integrating with that new infrastructure. pm treats the plan as a living document, not a fixed spec.

**Agents have full project awareness.** Every agent — planning, implementation, review, QA — sees the same project structure, understands the dependency graph, knows what's merged and what's pending. They aren't reading an API designed for humans and guessing at context. The prompting, task flows, and project state are all built around how LLMs actually work. That's what makes autonomous execution possible over dozens of PRs rather than falling apart after a few.

## The watcher: self-debugging in production

Running alongside autostart was a watcher agent that monitored the entire autonomous run — observing agent sessions, detecting failures, working around them, and recording bugs and improvement suggestions for the pm tool itself.

Over the course of the run, the watcher identified and documented 9 potential bugs and 3 improvement proposals — things like new workdirs missing dependency code, stale project.yaml snapshots reverting PR statuses on merge, review verdict detection failing on terminal rendering artifacts, and state desync after interrupted runs creating duplicate PRs stuck in infinite loops.

The watcher worked around each issue in real time — manually merging branches, resetting PR statuses, killing stuck sessions — and wrote up each bug with reproduction steps, test criteria, and the specific files that needed fixing. This is another example of agents as participants: the watcher wasn't just monitoring, it was diagnosing and adapting to keep the project moving, then reporting what it learned.

## Where the gap is

The game works. The mechanics are correct. Tests pass. Multiplayer functions. But it doesn't *feel* like a polished modern game. And that reveals exactly where the human role shifts.

The developer didn't need to scope PRs, draw dependency graphs, or manage agents. The only times human judgment was needed were: (1) during planning, adding design intent the system missed — how garbage should feel, how handicaps should feel fair, and (2) after the fact, playing the game and noticing that the input handling didn't feel right.

**For straightforward software, the human role becomes UX.** The engineering is handled. What's left is the part that requires a person sitting in front of the screen saying "this doesn't feel right" and knowing why. No test catches that the DAS timing feels sluggish. No dependency graph produces good game feel.

This isn't a capability gap — Claude can reason about juice, input latency, visual hierarchy, game psychology. The gap is structural. The notes file said "multiplayer tetris with adaptive garbage." It didn't say "the piece should feel snappy when it locks, the garbage indicator should create a sense of dread, the handicap should be invisible enough that the weaker player feels like they earned the win." That knowledge exists but it wasn't in the spec, so agents never optimized for it. It is up to the human to draw attention to the things that matter to them that don't matter to the computer.

## What this points toward

pm solved the *engineering decomposition* problem — breaking down what to build into pieces agents can execute against in parallel, with agents as full participants rather than tools being directed. The next problem is *experience decomposition* — breaking down how something should feel into pieces agents can build toward and verify against.

This connects to two open problems in the tool:

1. **QA as a first-class workflow.** Right now, QA asks "does it work?" The thing it actually needs to ask is "does it feel right?" That means the spec needs to contain enough about the intended experience that an agent or human can evaluate against it. Things like "DAS should feel like the player is in control, not fighting the input system" or "losing to a handicapped opponent should feel close, not rigged." Those are testable if they're written down — and agents are capable of evaluating them if given the criteria. They're just not the kind of thing that shows up in a technical spec today.

2. **Token cost of interactive QA.** pm has Claude-driven test scripts for navigating and evaluating the running app, but they consume too many tokens to be practical yet. Bringing that cost down is active work.

The demo shows that the engineering side of building software can be almost fully automated when you give agents the right project structure and treat them as participants rather than tools. The question now is whether the experience side — taste, feel, polish — can be captured well enough in a spec to get the same treatment, or whether that remains the irreducibly human part.
