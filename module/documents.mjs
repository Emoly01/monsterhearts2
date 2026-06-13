import { MH2 } from "./config.mjs";

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

export class MH2Actor extends Actor {

  /**
   * Roll 2d6 (+ stat + forward + ongoing + situational modifier),
   * report the tier, auto-mark XP on a miss, and consume Forward.
   *
   * @param {object} options
   * @param {string|null} options.stat    Stat key, or null for a bare 2d6 roll.
   * @param {string|null} options.label   Heading for the chat card.
   * @param {string} options.description  Pre-enriched HTML shown on the card.
   * @param {number} options.bonus        Flat bonus baked into the move itself.
   */
  async rollMH({ stat = null, label = null, description = "", bonus = 0 } = {}) {
    const sys = this.system;
    const statLabel = stat ? (MH2.stats[stat] ?? stat) : null;
    const statValue = stat ? (sys.stats?.[stat] ?? 0) : 0;
    const ongoing = sys.ongoing ?? 0;
    const forwards = sys.forwards ?? [];

    // Build a checkbox per recorded conditional Forward.
    const fwdRows = forwards.map((f, i) => `
      <label class="mh2-fwd-choice">
        <input type="checkbox" name="fwd" value="${i}">
        <span class="mh2-fwd-val">${f.value >= 0 ? "+" : ""}${f.value}</span>
        ${(f.label || "Forward").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
      </label>`).join("");

    // Ask for a situational modifier (Strings spent, Conditions exploited...).
    const DialogV2 = foundry.applications.api.DialogV2;
    const title = label ?? (statLabel ? `Roll with ${statLabel}` : "Roll 2d6");
    let choice;
    try {
      choice = await DialogV2.prompt({
        window: { title },
        content: `
          <div class="form-group">
            <label>Situational modifier</label>
            <input type="number" name="mod" value="0" step="1" autofocus>
            <p class="hint">Strings spent against them, exploited Conditions, gang bonuses…</p>
          </div>
          ${fwdRows ? `<fieldset class="mh2-fwd-set"><legend>Forward — tick any that apply</legend>${fwdRows}</fieldset>` : ""}`,
        ok: {
          label: "Roll 2d6",
          icon: "fa-solid fa-dice",
          callback: (event, button) => ({
            mod: Number(button.form.elements.mod.value) || 0,
            fwd: Array.from(button.form.querySelectorAll('input[name="fwd"]:checked')).map(el => Number(el.value))
          })
        },
        rejectClose: false
      });
    } catch (err) {
      choice = null;
    }
    if (!choice) return; // dialog dismissed
    const mod = choice.mod;
    const chosenForwards = choice.fwd ?? [];
    const forward = chosenForwards.reduce((sum, i) => sum + (forwards[i]?.value ?? 0), 0);

    // Build the formula from only the parts that matter.
    const parts = ["2d6"];
    const data = {};
    if (stat) { parts.push("@stat"); data.stat = statValue; }
    if (bonus) { parts.push("@bonus"); data.bonus = bonus; }
    if (forward) { parts.push("@forward"); data.forward = forward; }
    if (ongoing) { parts.push("@ongoing"); data.ongoing = ongoing; }
    if (mod) { parts.push("@mod"); data.mod = mod; }

    const roll = new Roll(parts.join(" + "), data);
    await roll.evaluate();
    const total = roll.total;

    let tier, tierLabel;
    if (total >= 10) { tier = "strong"; tierLabel = "Strong hit (10+)"; }
    else if (total >= 7) { tier = "weak"; tierLabel = "Partial hit (7–9)"; }
    else { tier = "miss"; tierLabel = "Miss"; }

    // Bookkeeping: mark XP on a miss, consume Forward.
    const updates = {};
    let xpNote = "";
    if (tier === "miss") {
      const newXp = Math.min(sys.experience.value + 1, sys.experience.max);
      if (newXp !== sys.experience.value) {
        updates["system.experience.value"] = newXp;
        xpNote = `<p class="mh2-xp-note">Experience marked — ${newXp}/${sys.experience.max}.</p>`;
      } else {
        xpNote = `<p class="mh2-xp-note">Experience track is full (${sys.experience.max}/${sys.experience.max}) — time to advance.</p>`;
      }
    }
    if (chosenForwards.length) {
      const remaining = forwards.filter((_, i) => !chosenForwards.includes(i));
      updates["system.forwards"] = remaining;
    }
    if (!foundry.utils.isEmpty(updates)) await this.update(updates);

    const bits = [];
    if (stat) bits.push(`${statLabel} ${statValue >= 0 ? "+" : ""}${statValue}`);
    if (bonus) bits.push(`Move ${bonus >= 0 ? "+" : ""}${bonus}`);
    if (forward) bits.push(`Forward ${forward >= 0 ? "+" : ""}${forward} (spent)`);
    if (ongoing) bits.push(`Ongoing ${ongoing >= 0 ? "+" : ""}${ongoing}`);
    if (mod) bits.push(`Mod ${mod >= 0 ? "+" : ""}${mod}`);

    const content = `
      <div class="mh2-roll-card tier-${tier}">
        <header class="mh2-card-header"><h3>${escapeHTML(title)}</h3></header>
        ${description ? `<div class="mh2-move-text">${description}</div>` : ""}
        <div class="mh2-roll-result">
          <span class="mh2-roll-total">${total}</span>
          <span class="mh2-roll-tier">${tierLabel}</span>
        </div>
        ${bits.length ? `<div class="mh2-roll-breakdown">${bits.join(" · ")}</div>` : ""}
        ${xpNote}
      </div>`;

    const messageData = {
      speaker: ChatMessage.implementation.getSpeaker({ actor: this }),
      rolls: [roll],
      sound: CONFIG.sounds.dice,
      content
    };
    ChatMessage.implementation.applyRollMode(messageData, game.settings.get("core", "rollMode"));
    return ChatMessage.implementation.create(messageData);
  }

  /**
   * Spend one String against the named target: decrement the counter and post
   * the Pulling Strings options to chat.
   * @param {number} index  Index into system.strings.
   */
  async spendString(index) {
    const strings = this.system.toObject().strings ?? [];
    const entry = strings[index];
    if (!entry) return;
    if (entry.count < 1) {
      ui.notifications.warn(`No Strings left on ${entry.name || "them"}.`);
      return;
    }
    entry.count -= 1;
    await this.update({ "system.strings": strings });

    const options = MH2.pullingStrings.map(o => `<li>${escapeHTML(o)}</li>`).join("");
    const content = `
      <div class="mh2-roll-card mh2-string-card">
        <header class="mh2-card-header"><h3>Pulling Strings</h3></header>
        <p>${escapeHTML(this.name)} spends a String on <strong>${escapeHTML(entry.name || "someone")}</strong> (${entry.count} left). Choose one:</p>
        <ul>${options}</ul>
      </div>`;

    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this }),
      content
    });
  }
}
