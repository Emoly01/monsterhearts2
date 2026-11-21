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

- **Character sheet**: one long page that scrolls as a whole, laid out like a
  profile. It opens on a painted moonrise header: a Trinidad beach at night,
  with your portrait in the moon (click it to change the picture) and your
  skin, name, origin, look and eyes over the sky. Under it sit the four stats as
  tiles (click the name to roll), harm, experience and ongoing, then cards for
  Strings, Conditions, Forward, your custom tracker, Moves, Darkest Self, Sex
  Move, Backstory, Advancements and Notes. Eleven themes, per user: Dark, Light,
  Karibik, Trinidad, Island, Soucouyant, Bioluminescence, La Diablesse, Burn
  Book, Late Show, Prom Night. Each has its own painting of the moonrise.
  Themes follow you into chat cards, Receipts and the NPC tracker. Optional
  chaconia sprays behind the sheet, on any theme.
- **Rolling**: click a stat name (or a move) → modifier prompt with your recorded
  Forwards as checkboxes → 2d6 + stat + bonuses. Chat card shows 10+ / 7–9 / miss,
  marks Experience on a miss, and consumes the Forwards you ticked.
- **Rolling against someone**: the roll prompt lists everyone at the table (and
  every sheet-less name a String points at). Pick one and it offers the Strings
  you hold on them (+1 each, spent on the roll) and their Conditions to exploit
  (+1 each, not consumed — the table decides how many may stack).
- **Follow-up buttons**: a hit's chat card carries buttons — gain a String, give
  a String, make them lose one on you, give or take a Condition, deal harm, take 1 Forward — that write to
  both sheets (through the GM when you don't own the other one). Only the
  roller and the MC see them. Harm that fills the track offers Skirting Death.
  Each move decides which buttons it shows: **Chat buttons** on the move sheet
  is either *Auto* (a button appears when the move's text, or the basic move it
  counts as, mentions Strings, Conditions, harm or Forward) or *Chosen here*
  (tick exactly the ones you want; tick none for a bare card). Moves without a
  roll carry their buttons too, and a card posted against no one asks who when
  you click.
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
- **Receipts**: every String can carry an optional note — what you actually have
  on them. It sits under the String on the sheet (click to write). The Gain a
  String / Give a String chat buttons ask for one when they grant it; skip it and
  the String still counts. Turn the question off per user under *Ask for a
  receipt* in the system settings. Receipts show on the chat card when a String
  is gained, spent or passed, stack with " · " when you gain more on the same
  person, and travel with a passed String.
- **NPC Strings tracker**: an open, shared list of every String an NPC holds —
  button in the Actors directory. Live-updates for everyone; only the MC edits.
  Each row has a receipt line too (players see it, the MC writes it).
- **Receipts window** (replaces the Strings Web): every String at the table,
  sheets and NPC tracker alike, read like a messaging app. Everyone is listed on
  the left with how many Strings they hold and how many are held on them. Pick
  someone and the thread shows the receipts others have on them, then the ones
  they're keeping. Each receipt you're keeping has four spend chips — *Tempt
  them*, *Give a Condition*, *+1 to your roll* (lands in your Forward) and *+1
  harm* — that spend the String and post it to chat. The pencil edits a
  receipt. Colours follow your sheet theme. Button in the Actors directory, or
  `game.system.mh2.openReceipts()` in a macro.
- **Skins as Items**: build a skin with stat lines, identity suggestion lists,
  moves (drag move items onto it), backstory steps, and advancements. Drop it on
  a character (or use the sheet's picker) to run the full apply interview:
  stat line, look/eyes/origin, move choices, then the automated backstory
  walkthrough — Strings granted in both directions, mutual/exchange/divide/
  Sympathetic-Token steps included.
- **Moves as Items**: create with ＋, or hit **basics** to seed the six basic
  moves. Clicking a move's name rolls it (or posts it to chat if it has no stat).
  New characters get the basic moves automatically.
- **Darkest Self**: toggle it on the sheet (or choose it when Skirting Death) —
  the screen cracks and the character's name is stamped across it for the whole
  table, and the Darkest Self text goes to chat. While it lasts, the moon in the
  sheet's header goes into a total eclipse that bleeds light in the theme's
  Darkest Self colour (Burn Book cries mascara, Late Show turns into an old
  black-and-white film), and the Darkest Self text is pinned to the top. Each theme has its own
  Darkest Self colour that answers its everyday one, and no two are alike
  (Karibik turns lionfish orange, Trinidad goes molasses-black and gold, Late
  Show dissolves into static, and so on).
- **Token bars**: Harm and Experience are available as token resource bars.

## House notes

- The basic-move stubs are condensed summaries — paste the full wording from
  your own books into each move's description (it's rich text, go wild).
- "Ongoing" is a manual catch-all for persistent bonuses (gang, Sanctuary,
  etc.). Set it, clear it when it stops applying.
- Conditions remember who gave them, and show in each person's Receipts
  header so the whole table can see what's there to exploit.

## Releases

Tagging `v*` runs a GitHub Action that zips the system and attaches
`monsterhearts2.zip` + `system.json` to a GitHub release, which is what the
manifest's download URL points at.
