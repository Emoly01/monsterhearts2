# Monsterhearts 2 (Hausgemacht)

A lightweight, personal-table Foundry VTT system for Monsterhearts 2.
Built for Foundry **v13/v14** on the modern API (ApplicationV2, DataModels, DialogV2) —
no legacy scaffolding waiting to break.

## Install

1. Quit Foundry (or just don't have a world open).
2. Copy this whole `monsterhearts2` folder into your user data directory:
   `{userData}/Data/systems/monsterhearts2`
   (The folder name **must** be `monsterhearts2` — it has to match the system id.)
3. Launch Foundry → Create World → pick **Monsterhearts 2 (Hausgemacht)**.

## What works (v0.1)

- **Character sheet**: name, skin/look/eyes/origin, the four stats.
- **Rolling**: click a stat name (or a move) → modifier prompt → 2d6 + stat
  + Forward + Ongoing + modifier. Chat card shows 10+ / 7–9 / miss.
- **Automatic bookkeeping**: a miss marks Experience for you; Forward is
  consumed by the roll and reset to 0.
- **Harm** (4 diamonds) and **Experience** (5 circles): click pips to fill/clear.
- **Strings**: rows of "who + count" with +/− buttons. The spend button (the
  little hand) decrements the count and posts the four Pulling-Strings options
  to chat.
- **Conditions**: simple add/remove text rows.
- **Moves as Items**: create with ＋, or hit **basics** to seed the six basic
  moves with condensed mechanical stubs. Open a move to set its stat and paste
  the full text from your reference sheets into the rich-text description.
  Clicking a move's name rolls it (or just posts it to chat if it has no stat).
- **Darkest Self / Sex Move / Backstory / Notes**: rich-text sections.
- **Token bars**: Harm and Experience are available as token resource bars.

## Not in v0.1 (deliberately)

- Skin compendia, actor-linked Strings (the relational web), MC sheet,
  Conditions as clickable roll bonuses, advancement checkboxes.
  Functional first. Fancy later.

## House notes

- The basic-move stubs are condensed summaries — paste the full wording from
  your own books into each move's description.
- "Ongoing" is a manual catch-all for persistent bonuses (gang, Sanctuary,
  etc.). Set it, clear it when it stops applying.
