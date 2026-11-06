# Setup — GoorPeach Apocalypse

*For a non-technical builder handing off to Claude Code. Follow in order.*

-----

## What you need installed

|Tool                  |Why                                                |Install                                                       |
|----------------------|---------------------------------------------------|--------------------------------------------------------------|
|**Node.js 22+**       |Runs Vite and Phaser locally                       |nodejs.org → download → installer                             |
|**Git**               |Version control                                    |Already on Mac. Check: `git --version` in Terminal            |
|**VS Code or Cursor** |Code editor (you won’t write much, but you’ll read)|vscode.dev or cursor.sh                                       |
|**GitHub account**    |Hosts the code                                     |github.com (you have one)                                     |
|**Cloudflare account**|Hosts the game                                     |dash.cloudflare.com (free)                                    |
|**Claude Code**       |Builds the game from these docs                    |`npm install -g @anthropic-ai/claude-code` then `claude login`|

-----

## Step 1 — Scaffold the project

Open Terminal. `cd` to wherever you keep code projects. Then:

```bash
npm create vite@latest goorpeach -- --template vanilla-ts
cd goorpeach
npm install
npm install phaser
```

This gives you a working dev server. Test it: `npm run dev` → open `localhost:5173`. You should see a default Vite page. Stop the server with `Ctrl+C`.

-----

## Step 2 — Drop in the docs

Make a `docs/` folder in the project root. Copy in:

- `BRIEF.md` → `docs/BRIEF.md`
- `ASSETS.md` → `docs/ASSETS.md`
- `SETUP.md` → `docs/SETUP.md` (this file)

Then put `CLAUDE.md` in the **project root** (not in docs/). Claude Code reads it from the root automatically every session.

Your folder should now look like:

```
goorpeach/
├── CLAUDE.md          ← here
├── docs/
│   ├── BRIEF.md
│   ├── ASSETS.md
│   └── SETUP.md
├── src/
├── public/
├── package.json
└── ... (Vite default files)
```

-----

## Step 3 — Make a GitHub repo

1. github.com → New repo → name it `goorpeach` (or whatever) → **don’t** init with README.
1. Copy the two commands GitHub shows you under “push an existing repository”.
1. Run them in the project folder.

You now have a remote backup. Every change is one `git add . && git commit -m "..." && git push` away from being saved.

-----

## Step 4 — Hand off to Claude Code

In the project folder, run `claude` to start a session.

**Prompt 1 — Setup**

> Read CLAUDE.md and docs/BRIEF.md end to end. Then create the folder structure exactly as specified in CLAUDE.md. Create empty stub files for every scene, entity, and system listed there with just an `export class` declaration and TODO comment. Don’t implement anything yet. Show me the file tree when done.

When that’s done, verify the structure matches CLAUDE.md.

**Prompt 2 — First playable**

> Implement BootScene, PreloadScene with a real progress bar, and MenuScene with a Start button. Wire systems/Audio.ts to unlock the audio context on the first Start click. I should be able to run `npm run dev` and see a styled menu with the working title “GoorPeach Apocalypse” on it.

Run `npm run dev` and check. If broken, paste the browser console error back to Claude Code.

**Prompt 3 — First driving level**

> Build DriveScene parameterised by level id. Use data/levels.ts as the source for level config. Implement only level 1 (Richmond) for now. The player car (PlayerCar entity) should drive forward automatically, steer with A/D and ←/→, brake with S and ↓. No couriers, no power-ups yet. The level should end after the durationMs from levels.ts.

Continue one prompt per step from the working-pattern list at the bottom of CLAUDE.md.

-----

## Step 5 — Deploy to Cloudflare Pages

1. dash.cloudflare.com → **Workers & Pages** → Create → Pages → Connect to Git.
1. Pick your `goorpeach` repo.
1. Build command: `npm run build`. Output directory: `dist`. Framework preset: Vite.
1. Save and deploy.

Cloudflare gives you a `goorpeach.pages.dev` URL (or similar). Custom domain is optional later.

Every `git push origin main` from now on triggers a redeploy in ~30 seconds.

-----

## When stuck

- **Claude Code stalls or starts arguing with itself** → end the session, start fresh, point it at CLAUDE.md again. Long sessions degrade. Short focused sessions are better.
- **Game runs but looks ugly** → that’s a separate pass. Finish mechanics first, polish art second. Don’t let perfect block playable.
- **Want to change game balance** (speeds, HP, spawn rate) → edit `src/config.ts`, never the scene files.
- **Want to add a level** → edit `src/data/levels.ts` only.
- **Stuck on a bug** → ask Claude Code to *explain* the bug in plain English before fixing it. Forces the diagnosis before the action.

-----

## Realistic timeline

|Stage                                              |Sessions    |Calendar time|
|---------------------------------------------------|------------|-------------|
|Scaffold + menu + first level playable             |2–3 sessions|One afternoon|
|All four driving levels playable with couriers     |3–5 sessions|A weekend    |
|Boss fight with both phases                        |2–3 sessions|One afternoon|
|Polish pass: art, sound, damage states, easter eggs|3–5 sessions|A weekend    |
|Deployed and shareable                             |One session |An hour      |

So: end to end, roughly two productive weekends if assets are sorted in parallel. Asset sourcing is the swing variable.

-----

## What to do today

1. Install Node + Claude Code (15 min)
1. Run Step 1 commands (5 min)
1. Drop in the docs (5 min)
1. Run Prompt 1 in Claude Code (5 min + verification)

That gets you to a working scaffold. Then you can pick up Prompt 2 whenever.