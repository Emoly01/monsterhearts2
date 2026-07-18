# Monsterhearts 2 (Hausgemacht)

A lightweight, personal-table Foundry VTT system for Monsterhearts 2.
Built for Foundry **v13/v14** on the modern API (ApplicationV2, DataModels, DialogV2) —
no legacy scaffolding waiting to break.

## Install

**From a release (recommended):** in Foundry's *Install System* dialog, paste the
manifest URL:

```
https://raw.githubusercontent.com/Emoly01/monsterhearts2/main/system.json
```

**Manually:**

1. Quit Foundry (or just don't have a world open).
2. Copy this whole `monsterhearts2` folder into your user data directory:
   `{userData}/Data/systems/monsterhearts2`
   (The folder name **must** be `monsterhearts2` — it has to match the system id.)
3. Launch Foundry → Create World → pick **Monsterhearts 2 (Hausgemacht)**.

## What works

- **Character sheet**: name, skin/look/eyes/origin, the four stats, five themes
  (per-user), optional watercolor hibiscus corners.
- **Rolling**: click a stat name (or a move) → modifier prompt with your recorded
  Forwards as checkboxes → 2d6 + stat + bonuses. Chat card shows 10+ / 7–9 / miss,
  marks Experience on a miss, and consumes the Forwards you ticked.
- **Harm** (4 diamonds): filling the fourth offers the Skirting Death choice —
  erase all harm and become your Darkest Self, or lose every String you hold.
- **Experience** (5 circles): when the track fills, **advance** — pick from your
  skin's advancement list (each once), write a custom one, and after five
  advancements the shared **Growing Up** list unlocks (build a skin item named
  exactly "Growing Up" to define it). Move-granting advancements open a picker,
  including "a move from any skin".
- **Strings**: rows of "who + count" with +/− buttons, a spend button that posts
  the Pulling Strings options to chat, and a pass button that hands a String to
  another character (routed through the GM via socket when you don't own their
  sheet). Name matching is case-insensitive, so "kayla" and "Kayla" are one row.
- **NPC Strings tracker**: an open, shared list of every String an NPC holds —
  button in the Actors directory. Live-updates for everyone; only the MC edits.
- **Strings Web**: a live relationship map of every String at the table, drawn
  from the sheets themselves. Also in the Actors directory.
- **Maps**: a shared pinboard/map editor (boxes, labels, connector lines on a
  choice of backgrounds) for sketching the town. Players can edit; saves route
  through the GM.
- **Skins as Items**: build a skin with stat lines, identity suggestion lists,
  moves (drag move items onto it), backstory steps, and advancements. Drop it on
  a character (or use the sheet's picker) to run the full apply interview:
  stat line, look/eyes/origin, move choices, then the automated backstory
  walkthrough — Strings granted in both directions, mutual/exchange/divide/
  Sympathetic-Token steps included.
- **Moves as Items**: create with ＋, or hit **basics** to seed the six basic
  moves. Clicking a move's name rolls it (or posts it to chat if it has no stat).
  New characters get the basic moves automatically.
- **Darkest Self**: toggle it on the sheet — a table-wide flare announces the
  descent and the character's Darkest Self text goes to chat.
- **Token bars**: Harm and Experience are available as token resource bars.

## House notes

- The basic-move stubs are condensed summaries — paste the full wording from
  your own books into each move's description (it's rich text, go wild).
- "Ongoing" is a manual catch-all for persistent bonuses (gang, Sanctuary,
  etc.). Set it, clear it when it stops applying.
- Conditions are simple text rows for now — exploit them via the situational
  modifier in the roll dialog.

## Releases

Tagging `v*` runs a GitHub Action that zips the system and attaches
`monsterhearts2.zip` + `system.json` to a GitHub release, which is what the
manifest's download URL points at.
