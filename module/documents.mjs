import { MH2 } from "./config.mjs";
import { escapeHTML, sameName } from "./utils.mjs";
import { cardActions } from "./chat.mjs";

export class MH2Actor extends Actor {

  /**
   * Seed the six basic moves onto a freshly created character so they're
   * always present, skin or no skin.
   * @override
   */
  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (game.user.id !== userId) return;
    if (this.type !== "character") return;
    const hasMoves = this.items.some(i => i.type === "move");
    if (hasMoves) return;
    const toCreate = MH2.basicMoves.map(m => ({
      name: m.name,
      type: "move",
      system: { stat: m.stat, category: "basic", description: m.description }
    }));
    await this.createEmbeddedDocuments("Item", toCreate);
  }

  /**
   * Everyone this character could roll against: the other characters, plus
   * any sheet-less name that shows up in a String somewhere. Each entry says
   * how many Strings we hold on them and which Conditions they carry.
   */
  #rollTargets() {
    const targets = [];
    const seen = new Set([this.name.trim().toLowerCase()]);
    const mine = this.system.strings ?? [];
    const add = (name, actor = null) => {
      const clean = String(name ?? "").trim();
      const key = clean.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      targets.push({
        name: clean,
        held: mine.find(s => sameName(s.name, clean))?.count ?? 0,
        conditions: (actor?.system.conditions ?? []).map(c => c.name.trim()).filter(Boolean)
      });
    };
    const chars = game.actors.filter(a => a.type === "character")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const a of chars) add(a.name, a);
    for (const s of mine) add(s.name);
    for (const e of (game.settings.get("monsterhearts2", "npcStrings") ?? [])) {
      add(e.holder);
      add(e.target);
    }
    return targets;
  }

  /**
   * Roll 2d6 (+ stat + forward + ongoing + situational modifier), optionally
   * against someone — spending Strings on them and exploiting their
   * Conditions from the dialog. Reports the tier, auto-marks XP on a miss,
   * consumes Forward and spent Strings, and offers follow-up buttons on a hit.
   *
   * @param {object} options
   * @param {string|null} options.stat    Stat key, or null for a bare 2d6 roll.
   * @param {string|null} options.label   Heading for the chat card.
   * @param {string} options.description  Pre-enriched HTML shown on the card.
   * @param {number} options.bonus        Flat bonus baked into the move itself.
   * @param {{name: string, description: string}|null} options.basis
   *   The basic move this roll counts as; its (pre-enriched) text is shown small.
   * @param {string[]|null} options.actions
   *   Follow-up buttons to offer on a hit. Null (a bare stat roll) offers them all.
   */
  async rollMH({ stat = null, label = null, description = "", bonus = 0, basis = null, actions = null } = {}) {
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
        ${escapeHTML(f.label || "Forward")}
      </label>`).join("");

    // Who is this against? Picking someone reveals what you can use on them.
    const targets = this.#rollTargets();
    const targetRows = targets.map((t, i) => {
      const spend = t.held > 0 ? `
        <label class="mh2-fwd-choice">
          <input type="number" name="str-${i}" value="0" min="0" max="${t.held}" step="1">
          Strings to spend for +1 each <em>(you hold ${t.held})</em>
        </label>` : "";
      const conds = t.conditions.map((c, j) => `
        <label class="mh2-fwd-choice">
          <input type="checkbox" name="cond-${i}" value="${j}">
          <span class="mh2-fwd-val">+1</span>
          exploit their Condition: ${escapeHTML(c)}
        </label>`).join("");
      const opts = (spend || conds)
        ? spend + conds
        : `<p class="hint">No Strings on them, no Conditions to exploit.</p>`;
      return `
        <div class="mh2-tgt">
          <label class="mh2-tgt-chip"><input type="radio" name="target" value="${i}"> ${escapeHTML(t.name)}</label>
          <div class="mh2-tgt-opts">${opts}</div>
        </div>`;
    }).join("");
    const targetSet = targets.length ? `
      <fieldset class="mh2-fwd-set mh2-tgt-set">
        <legend>Against</legend>
        <div class="mh2-tgt"><label class="mh2-tgt-chip"><input type="radio" name="target" value="" checked> no one</label></div>
        ${targetRows}
      </fieldset>` : "";

    // Ask for a situational modifier (gang bonuses, anything unlisted...).
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
            <p class="hint">Gang bonuses, MC rulings, anything not listed below…</p>
          </div>
          ${targetSet}
          ${fwdRows ? `<fieldset class="mh2-fwd-set"><legend>Forward — tick any that apply</legend>${fwdRows}</fieldset>` : ""}`,
        ok: {
          label: "Roll 2d6",
          icon: "fa-solid fa-dice",
          callback: (event, button) => {
            const form = button.form;
            const picked = form.querySelector('input[name="target"]:checked')?.value ?? "";
            return {
              mod: Number(form.elements.mod.value) || 0,
              fwd: Array.from(form.querySelectorAll('input[name="fwd"]:checked')).map(el => Number(el.value)),
              target: picked === "" ? null : Number(picked),
              spend: picked === "" ? 0 : Number(form.querySelector(`input[name="str-${picked}"]`)?.value) || 0,
              conds: picked === "" ? [] : Array.from(form.querySelectorAll(`input[name="cond-${picked}"]:checked`)).map(el => Number(el.value))
            };
          }
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
    const target = (choice.target === null) ? null : (targets[choice.target] ?? null);
    const spent = target ? Math.clamp(Math.trunc(choice.spend), 0, target.held) : 0;
    const exploited = target ? choice.conds.map(j => target.conditions[j]).filter(Boolean) : [];

    // Build the formula from only the parts that matter.
    const parts = ["2d6"];
    const data = {};
    if (stat) { parts.push("@stat"); data.stat = statValue; }
    if (bonus) { parts.push("@bonus"); data.bonus = bonus; }
    if (forward) { parts.push("@forward"); data.forward = forward; }
    if (ongoing) { parts.push("@ongoing"); data.ongoing = ongoing; }
    if (spent) { parts.push("@strings"); data.strings = spent; }
    if (exploited.length) { parts.push("@conditions"); data.conditions = exploited.length; }
    if (mod) { parts.push("@mod"); data.mod = mod; }

    const roll = new Roll(parts.join(" + "), data);
    await roll.evaluate();
    const total = roll.total;

    let tier, tierLabel;
    if (total >= 10) { tier = "strong"; tierLabel = "Strong hit (10+)"; }
    else if (total >= 7) { tier = "weak"; tierLabel = "Partial hit (7–9)"; }
    else { tier = "miss"; tierLabel = "Miss"; }

    // Bookkeeping: mark XP on a miss, consume Forward and spent Strings.
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
    if (spent) {
      const strings = foundry.utils.deepClone(sys.toObject().strings ?? []);
      const row = strings.find(s => sameName(s.name, target.name));
      if (row) row.count = Math.max(0, row.count - spent);
      updates["system.strings"] = strings;
    }
    if (!foundry.utils.isEmpty(updates)) await this.update(updates);

    const bits = [];
    if (stat) bits.push(`${statLabel} ${statValue >= 0 ? "+" : ""}${statValue}`);
    if (bonus) bits.push(`Move ${bonus >= 0 ? "+" : ""}${bonus}`);
    if (forward) bits.push(`Forward ${forward >= 0 ? "+" : ""}${forward} (spent)`);
    if (ongoing) bits.push(`Ongoing ${ongoing >= 0 ? "+" : ""}${ongoing}`);
    if (spent) bits.push(`${spent} String${spent > 1 ? "s" : ""} +${spent} (spent)`);
    for (const c of exploited) bits.push(`${escapeHTML(c)} +1`);
    if (mod) bits.push(`Mod ${mod >= 0 ? "+" : ""}${mod}`);

    let flavor = "";
    if (tier === "miss" && MH2.flavorMiss?.length) {
      flavor = MH2.flavorMiss[Math.floor(Math.random() * MH2.flavorMiss.length)];
    } else if (tier === "strong" && MH2.flavorStrong?.length) {
      flavor = MH2.flavorStrong[Math.floor(Math.random() * MH2.flavorStrong.length)];
    }

    const content = `
      <div class="mh2-roll-card tier-${tier}">
        <header class="mh2-card-header"><h3>${escapeHTML(title)}</h3></header>
        ${target ? `<p class="mh2-against">against <strong>${escapeHTML(target.name)}</strong></p>` : ""}
        ${description ? `<div class="mh2-move-text">${description}</div>` : ""}
        ${basis?.description ? `<div class="mh2-base-move"><h4>${escapeHTML(basis.name)}</h4>${basis.description}</div>` : ""}
        <div class="mh2-roll-result">
          <span class="mh2-roll-total">${total}</span>
          <span class="mh2-roll-tier">${tierLabel}</span>
        </div>
        ${bits.length ? `<div class="mh2-roll-breakdown">${bits.join(" · ")}</div>` : ""}
        ${xpNote}
        ${flavor ? `<p class="mh2-flavor">${flavor}</p>` : ""}
        ${tier === "miss" ? "" : cardActions(actions ?? MH2.moveActions.map(a => a.key), target?.name ?? "")}
      </div>`;

    const messageData = {
      speaker: ChatMessage.implementation.getSpeaker({ actor: this }),
      rolls: [roll],
      sound: CONFIG.sounds.dice,
      content,
      flags: { monsterhearts2: { card: { actorId: this.id, targetName: target?.name ?? "" } } }
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
        ${entry.note?.trim() ? `<p class="mh2-card-receipt"><i class="fa-solid fa-receipt"></i> ${escapeHTML(entry.note.trim())}</p>` : ""}
        <ul>${options}</ul>
        ${entry.name ? cardActions(["giveCondition", "harm"], entry.name) : ""}
      </div>`;

    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this }),
      content,
      flags: { monsterhearts2: { card: { actorId: this.id, targetName: entry.name ?? "" } } }
    });
  }

  /**
   * Offer the Skirting Death choice: erase all harm, then either become your
   * Darkest Self or lose every String you hold.
   */
  async skirtDeath() {
    const DialogV2 = foundry.applications.api.DialogV2;
    const choice = await DialogV2.wait({
      window: { title: "Skirting Death", icon: "fa-solid fa-skull" },
      position: { width: 440 },
      content: `
        <div class="mh2-skin-dialog">
          <p>You've taken your fourth harm — you're staring death down. Erase all harm and choose one:</p>
        </div>`,
      buttons: [
        { action: "darkest", label: "Become your Darkest Self", icon: "fa-solid fa-moon" },
        { action: "strings", label: "Lose all Strings you hold", icon: "fa-solid fa-link-slash" },
        { action: "none", label: "Not yet — leave harm as is", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });

    if (!choice || choice === "none") return;

    const update = { "system.harm.value": 0 };
    let line;
    if (choice === "darkest") {
      update["system.darkestSelfActive"] = true;
      line = "erases all harm and descends into their Darkest Self";
    } else {
      update["system.strings"] = [];
      line = "erases all harm and loses every String they held";
    }
    await this.update(update);

    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this }),
      content: `
        <div class="mh2-roll-card mh2-string-card">
          <header class="mh2-card-header"><h3>Skirting Death</h3></header>
          <p><strong>${escapeHTML(this.name)}</strong> ${line}.</p>
        </div>`
    });
    // Skirting Death into the Darkest Self gets the same descent as the toggle.
    if (choice === "darkest") return this.announceDarkestSelf();
  }

  /**
   * Announce the descent into the Darkest Self: a table-wide flare, and the
   * character's Darkest Self text in chat.
   */
  async announceDarkestSelf() {
    game.socket.emit("system.monsterhearts2", { type: "darkestFlare", name: this.name });
    game.system.mh2?.darkestFlare?.(this.name);
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    const text = await TE.enrichHTML(this.system.darkestSelf || "", {
      relativeTo: this, secrets: false
    });
    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this }),
      content: `
        <div class="mh2-roll-card mh2-darkest-card">
          <header class="mh2-card-header"><h3><i class="fa-solid fa-moon"></i> ${escapeHTML(this.name)}</h3></header>
          <p class="mh2-darkest-tag">Darkest Self</p>
          ${text || "<p><em>They descend into their Darkest Self.</em></p>"}
        </div>`
    });
  }
}
