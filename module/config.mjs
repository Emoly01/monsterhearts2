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

MH2.categoryOptions = [
  { value: "basic", label: "Basic move" },
  { value: "skin", label: "Skin move" }
];

/** Options posted to chat when a String is spent. */
MH2.pullingStrings = [
  "Tempt them to do what you want",
  "Give them a Condition",
  "Add 1 to your roll against them",
  "Add 1 to the harm you deal them"
];

/**
 * The six basic moves with their rules text, taken from the player reference
 * sheet you provided.
 */
MH2.basicMoves = [
  {
    name: "Turn Someone On",
    stat: "hot",
    description: "<p>When you turn someone on, roll with Hot. On a 10 up, gain a String on them and they choose a reaction from below. On a 7-9, they can either give you a String or choose one of the reactions.</p><ul><li>I give myself to you,</li><li>I promise something I think you want, or</li><li>I get embarrassed and act awkward.</li></ul>"
  },
  {
    name: "Shut Someone Down",
    stat: "cold",
    description: "<p>When you shut someone down, roll with Cold. On a 10 up, choose one from below. On a 7-9, choose one from below, but you come across poorly, and they give you a Condition in return.</p><ul><li>They lose a String on you,</li><li>If they have no Strings on you, gain one on them,</li><li>They gain a Condition, or</li><li>You take 1 Forward.</li></ul>"
  },
  {
    name: "Keep Your Cool",
    stat: "cold",
    description: "<p>When you keep your cool and act despite fear, name what you're afraid of and roll with Cold. On a 10 up, you keep your cool and gain insight: ask the MC a question about the situation and take 1 Forward to acting on that information. On a 7-9, the MC will tell you how your actions would leave you vulnerable, and you can choose to back down or go through with it.</p>"
  },
  {
    name: "Lash Out Physically",
    stat: "volatile",
    description: "<p>When you lash out physically, roll with Volatile. On a 10 up, you deal them harm, and they choke up momentarily before they can react. On a 7-9, you harm them but choose one:</p><ul><li>They learn something about your true nature and gain a String on you,</li><li>The MC decides how bad the harm turns out,</li><li>You become your Darkest Self.</li></ul>"
  },
  {
    name: "Run Away",
    stat: "volatile",
    description: "<p>When you run away, roll with Volatile. On a 10 up, you get away to a safe place. On a 7-9, you get away but choose one:</p><ul><li>You run into something worse,</li><li>You cause a big scene, or</li><li>You leave something behind.</li></ul>"
  },
  {
    name: "Gaze Into the Abyss",
    stat: "dark",
    description: "<p>When you gaze into the abyss, name what you're looking for and roll with Dark. On a 10 up, the abyss shows you lucid visions, and you take 1 Forward to addressing them. On a 7-9, the abyss shows you confusing and alarming visions, but you get your answer nonetheless.</p>"
  }
];
