/**
 * Shared configuration for the Monsterhearts 2 system.
 * Move texts below are terse mechanical summaries so the system works out of
 * the box. Paste the full text from your own books/reference sheets into each
 * move's description editor — it's rich text, go wild.
 */

export const MH2 = {};

MH2.stats = {
  hot: "Hot",
  cold: "Cold",
  volatile: "Volatile",
  dark: "Dark"
};

MH2.statOptions = [
  { value: "", label: "— no roll —" },
  { value: "hot", label: "Hot" },
  { value: "cold", label: "Cold" },
  { value: "volatile", label: "Volatile" },
  { value: "dark", label: "Dark" }
];

/** Options posted to chat when a String is spent. */
MH2.pullingStrings = [
  "Tempt them to do what you want",
  "Give them a Condition",
  "Add 1 to your roll against them",
  "Add 1 to the harm you deal them"
];

/**
 * Mechanical stubs for the six basic moves. Intentionally condensed —
 * replace/extend each description with the full wording from your sheets.
 */
MH2.basicMoves = [
  {
    name: "Turn Someone On",
    stat: "hot",
    description: "<p><strong>10+:</strong> gain a String on them; they pick a reaction.<br><strong>7–9:</strong> they choose — give you a String, or pick a reaction.</p><p><em>Paste the full move text here.</em></p>"
  },
  {
    name: "Shut Someone Down",
    stat: "cold",
    description: "<p><strong>10+:</strong> choose one effect from the move's list.<br><strong>7–9:</strong> choose one, but you come across poorly and they give you a Condition.</p><p><em>Paste the full move text here.</em></p>"
  },
  {
    name: "Keep Your Cool",
    stat: "cold",
    description: "<p>Name what you fear.<br><strong>10+:</strong> you act unshaken — ask the MC a question, take 1 Forward to act on it.<br><strong>7–9:</strong> the MC names how this leaves you vulnerable; back down or push through.</p><p><em>Paste the full move text here.</em></p>"
  },
  {
    name: "Lash Out Physically",
    stat: "volatile",
    description: "<p><strong>10+:</strong> you deal harm and they hesitate before reacting.<br><strong>7–9:</strong> you deal harm, but pick a drawback from the move's list.</p><p><em>Paste the full move text here.</em></p>"
  },
  {
    name: "Run Away",
    stat: "volatile",
    description: "<p><strong>10+:</strong> you reach safety.<br><strong>7–9:</strong> you get away, but pick a cost from the move's list.</p><p><em>Paste the full move text here.</em></p>"
  },
  {
    name: "Gaze Into the Abyss",
    stat: "dark",
    description: "<p>Name what you're looking for.<br><strong>10+:</strong> lucid visions — take 1 Forward to act on them.<br><strong>7–9:</strong> confusing, alarming visions, but you get your answer.</p><p><em>Paste the full move text here.</em></p>"
  }
];
