import { MH2 } from "./config.mjs";
import { escapeHTML as esc, sameName } from "./utils.mjs";
import { cardActions, moveActionKeys, receiptLine } from "./chat.mjs";
import { mergeNote } from "./effects.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** The world move item with this name (case-insensitive), if any. */
function worldMove(name) {
  return game.items.find(i => i.type === "move" && sameName(i.name, name)) ?? null;
}

/**
 * What a move on a character actually rolls. Anything the character's copy
 * leaves blank (no stat, no bonus, no text, no basic move) is read from the
 * world move of the same name, so sheets built before the presets were set
 * pick them up without being rebuilt.
 */
function effectiveMove(move) {
  const own = move.system;
  const live = worldMove(move.name)?.system;
  const buttons = own.actionsMode ? own : (live?.actionsMode ? live : null);
  return {
    actionsMode: buttons?.actionsMode ?? "",
    actions: buttons?.actions ?? {},
    stat: own.stat || live?.stat || "",
    bonus: own.bonus || live?.bonus || 0,
    basedOn: own.basedOn || live?.basedOn || "",
    description: own.description || live?.description || ""
  };
}

/**
 * A skin stores only a snapshot of each move, taken when it was dropped on.
 * The world move of the same name is the one that keeps getting edited, so
 * its stat, bonus, text and icon win; the snapshot fills in when it is gone.
 * Group and "auto" are set on the skin itself and always come from there.
 */
function resolveSkinMove(m) {
  const live = worldMove(m.name);
  if (!live) return m;
  return {
    ...m,
    img: live.img || m.img,
    stat: live.system.stat || m.stat,
    bonus: live.system.bonus || m.bonus || 0,
    basedOn: live.system.basedOn || m.basedOn || "",
    actionsMode: live.system.actionsMode ?? "",
    actions: live.system.toObject().actions,
    description: live.system.description || m.description
  };
}

/** Item data for a skin move being added to a character. */
function skinMoveItem(snapshot) {
  const m = resolveSkinMove(snapshot);
  return {
    name: m.name,
    type: "move",
    img: m.img || undefined,
    system: {
      stat: m.stat, category: "skin", bonus: m.bonus ?? 0, group: m.group ?? "",
      basedOn: m.basedOn ?? "", description: m.description,
      ...(m.actionsMode ? { actionsMode: m.actionsMode, actions: m.actions } : {})
    }
  };
}

export class MH2ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** Moves whose description the user has flipped from its default state. */
  #toggledMoves = new Set();

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["monsterhearts2", "sheet", "actor"],
    position: { width: 700, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: MH2ActorSheet.#onEditImage,
      rollStat: MH2ActorSheet.#onRollStat,
      setHarm: MH2ActorSheet.#onSetHarm,
      setXp: MH2ActorSheet.#onSetXp,
      toggleDarkest: MH2ActorSheet.#onToggleDarkest,
      postSexMove: MH2ActorSheet.#onPostSexMove,
      addCondition: MH2ActorSheet.#onAddCondition,
      deleteCondition: MH2ActorSheet.#onDeleteCondition,
      addCustom: MH2ActorSheet.#onAddCustom,
      deleteCustom: MH2ActorSheet.#onDeleteCustom,
      addString: MH2ActorSheet.#onAddString,
      deleteString: MH2ActorSheet.#onDeleteString,
      stringPlus: MH2ActorSheet.#onStringPlus,
      stringMinus: MH2ActorSheet.#onStringMinus,
      spendString: MH2ActorSheet.#onSpendString,
      passString: MH2ActorSheet.#onPassString,
      addForward: MH2ActorSheet.#onAddForward,
      deleteForward: MH2ActorSheet.#onDeleteForward,
      createMove: MH2ActorSheet.#onCreateMove,
      addBasicMoves: MH2ActorSheet.#onAddBasicMoves,
      rollMove: MH2ActorSheet.#onRollMove,
      editMove: MH2ActorSheet.#onEditMove,
      deleteMove: MH2ActorSheet.#onDeleteMove,
      advance: MH2ActorSheet.#onAdvance,
      openSkin: MH2ActorSheet.#onOpenSkin
    }
  };

  /** @override */
  static PARTS = {
    body: {
      template: "systems/monsterhearts2/templates/actor-sheet.hbs",
      scrollable: [".mh2-scroll"]
    }
  };

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const sys = actor.system;
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;

    context.actor = actor;
    context.system = sys;
    context.statLabels = MH2.stats;

    context.statList = Object.entries(MH2.stats).map(([key, label]) => ({
      key, label, value: sys.stats[key]
    }));

    context.harmPips = Array.fromRange(sys.harm.max).map(i => ({
      index: i, filled: i < sys.harm.value
    }));
    context.xpPips = Array.fromRange(sys.experience.max).map(i => ({
      index: i, filled: i < sys.experience.value
    }));

    // Skin moves show their text by default, basic moves keep it folded.
    const decorate = (m, eff, description) => ({
      id: m.id,
      name: m.name,
      stat: eff.stat,
      bonus: eff.bonus,
      bonusLabel: eff.bonus >= 0 ? `+${eff.bonus}` : `${eff.bonus}`,
      description,
      open: (m.system.category !== "basic") !== this.#toggledMoves.has(m.id)
    });
    const allMoves = actor.items
      .filter(i => i.type === "move")
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
    const decorated = await Promise.all(allMoves.map(async m => {
      const eff = effectiveMove(m);
      return decorate(m, eff,
        await TE.enrichHTML(eff.description, { relativeTo: m, secrets: actor.isOwner }));
    }));
    const byId = new Map(decorated.map(d => [d.id, d]));
    context.basicMoves = allMoves.filter(m => m.system.category === "basic").map(m => byId.get(m.id));

    // Skin moves render grouped: ungrouped first, then groups alphabetically.
    const groupMap = new Map();
    for (const m of allMoves.filter(m => m.system.category !== "basic")) {
      const g = (m.system.group ?? "").trim();
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(byId.get(m.id));
    }
    context.skinMoveGroups = [...groupMap.entries()]
      .sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0])))
      .map(([label, moves]) => ({ label, moves }));
    context.hasSkinMoves = groupMap.size > 0;

    context.xpFull = sys.experience.value >= sys.experience.max;
    context.darkestSelfActive = sys.darkestSelfActive;
    context.skinItem = actor.items.find(i => i.type === "skin") ?? null;

    const worldSkins = game.items.filter(i =>
        i.type === "skin" && i.name.trim().toLowerCase() !== "growing up")
      .sort((a, b) => a.name.localeCompare(b.name));
    context.skinOptions = worldSkins.map(s => ({
      id: s.id, name: s.name, selected: s.name === sys.skin
    }));
    context.skinMatched = context.skinOptions.some(o => o.selected);

    const enrichOpts = { relativeTo: actor, secrets: actor.isOwner };
    context.enriched = {
      darkestSelf: await TE.enrichHTML(sys.darkestSelf, enrichOpts),
      sexMove: await TE.enrichHTML(sys.sexMove, enrichOpts),
      backstory: await TE.enrichHTML(sys.backstory, enrichOpts),
      notes: await TE.enrichHTML(sys.notes, enrichOpts)
    };

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const picker = this.element.querySelector(".mh2-skin-picker");
    picker?.addEventListener("change", async ev => {
      const id = ev.currentTarget.value;
      if (!id) return;
      const skin = game.items.get(id);
      if (!skin) return;
      const applied = await this.#applySkin(skin);
      if (!applied) this.render(); // dialog cancelled — snap the select back
    });

    // Remember which move texts are folded/unfolded across re-renders.
    for (const details of this.element.querySelectorAll(".mh2-move-details")) {
      const id = details.closest("[data-item-id]")?.dataset.itemId;
      const initial = details.open;
      details.addEventListener("toggle", () => {
        if (details.open !== initial) this.#toggledMoves.add(id);
        else this.#toggledMoves.delete(id);
      });
    }
  }

  /* -------------------------------------------- */
  /*  Form handling                               */
  /* -------------------------------------------- */

  /**
   * Form data expands array fields into numeric-keyed objects; convert them
   * back into proper arrays before the document update.
   * @override
   */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    const sys = submitData.system;
    if (sys) {
      if (sys.strings && !Array.isArray(sys.strings)) sys.strings = Object.values(sys.strings);
      if (sys.conditions && !Array.isArray(sys.conditions)) sys.conditions = Object.values(sys.conditions);
      if (sys.custom && !Array.isArray(sys.custom)) sys.custom = Object.values(sys.custom);
      if (sys.forwards && !Array.isArray(sys.forwards)) sys.forwards = Object.values(sys.forwards);
    }
    return submitData;
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /** Plain (source) copy of an array field for safe mutation. */
  #sourceArray(key) {
    return foundry.utils.deepClone(this.actor.system.toObject()[key] ?? []);
  }

  #getMove(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return this.actor.items.get(id);
  }

  /**
   * The character's current skin: prefer the live world item (matched by
   * name) so later edits to the playbook are seen; fall back to the
   * embedded snapshot taken when the skin was applied.
   */
  #resolveSkin() {
    const embedded = this.actor.items.find(i => i.type === "skin") ?? null;
    const name = embedded?.name || this.actor.system.skin;
    const world = name ? game.items.find(i => i.type === "skin" && i.name === name) : null;
    return world ?? embedded;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onEditImage(event, target) {
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? FilePicker;
    const picker = new FP({
      type: "image",
      current: this.document.img,
      callback: path => this.document.update({ img: path })
    });
    return picker.browse();
  }

  static async #onRollStat(event, target) {
    const stat = target.dataset.stat;
    return this.actor.rollMH({ stat });
  }

  static async #onSetHarm(event, target) {
    const i = Number(target.dataset.value);
    const sys = this.actor.system;
    const current = sys.harm.value;
    const value = (current === i + 1) ? i : i + 1;
    await this.actor.update({ "system.harm.value": value });
    // Filling the final harm box puts the character at death's door.
    if (value >= sys.harm.max && current < sys.harm.max) {
      return this.actor.skirtDeath();
    }
  }

  static async #onToggleDarkest(event, target) {
    const nowActive = !this.actor.system.darkestSelfActive;
    await this.actor.update({ "system.darkestSelfActive": nowActive });
    if (nowActive) return this.actor.announceDarkestSelf();
  }

  static async #onSetXp(event, target) {
    const i = Number(target.dataset.value);
    const current = this.actor.system.experience.value;
    const value = (current === i + 1) ? i : i + 1;
    return this.actor.update({ "system.experience.value": value });
  }

  static async #onAddCondition(event, target) {
    const conditions = this.#sourceArray("conditions");
    conditions.push({ name: "", from: "" });
    return this.actor.update({ "system.conditions": conditions });
  }

  static async #onDeleteCondition(event, target) {
    const conditions = this.#sourceArray("conditions");
    conditions.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.conditions": conditions });
  }

  static async #onAddCustom(event, target) {
    const custom = this.#sourceArray("custom");
    custom.push("");
    return this.actor.update({ "system.custom": custom });
  }

  static async #onDeleteCustom(event, target) {
    const custom = this.#sourceArray("custom");
    custom.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.custom": custom });
  }

  static async #onAddString(event, target) {
    const strings = this.#sourceArray("strings");
    strings.push({ name: "", count: 1, note: "" });
    return this.actor.update({ "system.strings": strings });
  }

  static async #onDeleteString(event, target) {
    const strings = this.#sourceArray("strings");
    strings.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.strings": strings });
  }

  static async #onStringPlus(event, target) {
    const strings = this.#sourceArray("strings");
    const entry = strings[Number(target.dataset.index)];
    if (!entry) return;
    entry.count += 1;
    return this.actor.update({ "system.strings": strings });
  }

  static async #onStringMinus(event, target) {
    const strings = this.#sourceArray("strings");
    const entry = strings[Number(target.dataset.index)];
    if (!entry) return;
    entry.count = Math.max(0, entry.count - 1);
    return this.actor.update({ "system.strings": strings });
  }

  static async #onSpendString(event, target) {
    return this.actor.spendString(Number(target.dataset.index));
  }

  /**
   * Hand one String from this character over to another character. Decrements
   * (or removes) the source row and adds/increments a matching row on the
   * recipient, keyed by the same target name.
   */
  static async #onPassString(event, target) {
    const i = Number(target.dataset.index);
    const strings = this.#sourceArray("strings");
    const entry = strings[i];
    if (!entry || entry.count < 1) {
      return ui.notifications.warn("No String there to pass.");
    }

    // Candidate recipients: other character actors the user owns.
    const candidates = game.actors.filter(a =>
      a.type === "character" && a.id !== this.actor.id && a.isOwner);
    if (!candidates.length) {
      return ui.notifications.warn("No other characters to pass a String to.");
    }

    const opts = candidates.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
    const recipientId = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Pass a String on ${entry.name || "someone"}` },
      content: `
        <div class="mh2-skin-dialog">
          <p>Hand one String on <strong>${esc(entry.name || "someone")}</strong> to:</p>
          <div class="form-group"><select name="who">${opts}</select></div>
        </div>`,
      ok: {
        label: "Pass String",
        icon: "fa-solid fa-hands-holding",
        callback: (event, button) => button.form.elements.who.value
      },
      rejectClose: false
    });
    if (!recipientId) return;

    const recipient = game.actors.get(recipientId);
    if (!recipient) return;

    // Remove one from source.
    entry.count -= 1;
    const sourceStrings = entry.count > 0 ? strings : strings.filter((_, idx) => idx !== i);
    await this.actor.update({ "system.strings": sourceStrings });

    // Add one to recipient, merging by name.
    // Add one to recipient, merging by name — directly if we own them,
    // otherwise ask a GM to apply it via socket (permissions).
    if (recipient.isOwner) {
      const recStrings = foundry.utils.deepClone(recipient.system.toObject().strings ?? []);
      const match = recStrings.find(s => sameName(s.name, entry.name));
      if (match) {
        match.count += 1;
        match.note = mergeNote(match.note, entry.note);
      }
      else recStrings.push({ name: entry.name, count: 1, note: entry.note ?? "" });
      await recipient.update({ "system.strings": recStrings });
    } else if (game.users.find(u => u.isGM && u.active)) {
      game.socket.emit("system.monsterhearts2", {
        type: "grantString",
        actorId: recipient.id,
        name: entry.name,
        count: 1,
        note: entry.note ?? ""
      });
    } else {
      ui.notifications.warn(`Passed the String, but no GM is online to update ${recipient.name}'s sheet.`);
    }

    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      content: `
        <div class="mh2-roll-card mh2-string-card">
          <header class="mh2-card-header"><h3>String Passed</h3></header>
          <p><strong>${esc(this.actor.name)}</strong> passes a String on ${esc(entry.name || "someone")} to <strong>${esc(recipient.name)}</strong>.</p>
          ${receiptLine(entry.note)}
        </div>`
    });
  }

  static async #onAddForward(event, target) {
    const arr = this.#sourceArray("forwards");
    arr.push({ label: "", value: 1 });
    return this.actor.update({ "system.forwards": arr });
  }

  static async #onDeleteForward(event, target) {
    const arr = this.#sourceArray("forwards");
    arr.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.forwards": arr });
  }

  static async #onCreateMove(event, target) {
    const category = target.dataset.category === "basic" ? "basic" : "skin";
    const [item] = await this.actor.createEmbeddedDocuments("Item", [
      { name: "New Move", type: "move", system: { category } }
    ]);
    return item?.sheet.render(true);
  }

  static async #onAddBasicMoves(event, target) {
    const existing = new Set(this.actor.items.filter(i => i.type === "move").map(i => i.name));
    const toCreate = MH2.basicMoves
      .filter(m => !existing.has(m.name))
      .map(m => ({
        name: m.name,
        type: "move",
        system: { stat: m.stat, category: "basic", description: m.description }
      }));
    if (!toCreate.length) {
      ui.notifications.info("The basic moves are already on this sheet.");
      return;
    }
    return this.actor.createEmbeddedDocuments("Item", toCreate);
  }

  /**
   * The basic move a skin move counts as, with its text ready for a chat
   * card: named on the move, or spotted in its wording when left on auto.
   * The character's own copy of the basic move wins, so pasted-in full text
   * is what shows.
   */
  async #basisFor(move, eff) {
    if (move.system.category === "basic" || eff.basedOn === "none") return null;
    let name = eff.basedOn;
    if (!name && eff.stat) {
      const text = eff.description.replace(/<[^>]*>/g, " ");
      name = MH2.basicMoves.find(b => b.match?.test(text))?.name ?? "";
    }
    if (!name || sameName(name, move.name)) return null;
    const own = this.actor.items.find(i => i.type === "move" && sameName(i.name, name));
    const text = own?.system.description
      || worldMove(name)?.system.description
      || MH2.basicMoves.find(b => sameName(b.name, name))?.description
      || "";
    if (!text) return null;
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    return { name, description: await TE.enrichHTML(text, { relativeTo: own ?? move, secrets: false }) };
  }

  static async #onRollMove(event, target) {
    const move = this.#getMove(target);
    if (!move) return;
    const eff = effectiveMove(move);
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    const description = await TE.enrichHTML(eff.description, {
      relativeTo: move, secrets: false
    });
    const basis = await this.#basisFor(move, eff);
    const actions = moveActionKeys(eff, [eff.description, basis?.description]);

    if (eff.stat) {
      return this.actor.rollMH({
        stat: eff.stat,
        label: move.name,
        description,
        bonus: eff.bonus,
        basis,
        actions
      });
    }

    // No roll: just post the move to chat.
    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      content: `
        <div class="mh2-roll-card">
          <header class="mh2-card-header"><h3>${esc(move.name)}</h3></header>
          <div class="mh2-move-text">${description}</div>
          ${basis ? `<div class="mh2-base-move"><h4>${esc(basis.name)}</h4>${basis.description}</div>` : ""}
          ${cardActions(actions)}
        </div>`,
      flags: { monsterhearts2: { card: { actorId: this.actor.id, targetName: "" } } }
    });
  }

  static async #onEditMove(event, target) {
    return this.#getMove(target)?.sheet.render(true);
  }

  static async #onDeleteMove(event, target) {
    const move = this.#getMove(target);
    if (!move) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete ${move.name}?` },
      content: `<p>Delete the move <strong>${esc(move.name)}</strong> from this sheet?</p>`,
      rejectClose: false
    });
    if (confirmed) return move.delete();
  }

  static async #onOpenSkin(event, target) {
    return this.#resolveSkin()?.sheet.render(true);
  }

  static async #onAdvance(event, target) {
    return this.#advance();
  }

  /** Post the character's Sex Move to chat — for the moment the table needs the fine print. */
  static async #onPostSexMove(event, target) {
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    const text = await TE.enrichHTML(this.actor.system.sexMove || "", {
      relativeTo: this.actor, secrets: false
    });
    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      content: `
        <div class="mh2-roll-card mh2-sex-card">
          <header class="mh2-card-header"><h3><i class="fa-solid fa-heart"></i> ${esc(this.actor.name)} — Sex Move</h3></header>
          ${text || "<p><em>No sex move recorded on this sheet.</em></p>"}
        </div>`
    });
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onDropItem(event, itemOrData) {
    const item = itemOrData instanceof Item
      ? itemOrData
      : await Item.implementation.fromDropData(itemOrData);
    if (!item) return;

    // Dropping a skin starts the apply-skin interview.
    if (item.type === "skin" && item.parent !== this.actor) {
      return this.#applySkin(item);
    }
    return super._onDropItem(event, itemOrData);
  }

  /* -------------------------------------------- */
  /*  Skin application                            */
  /* -------------------------------------------- */

  /**
   * Interview the player (stat line, look/eyes/origin, skin moves), then write
   * the skin onto the character: stats, identity, Darkest Self, Sex Move,
   * Backstory, an embedded copy of the skin, and the chosen move items.
   */
  async #applySkin(skin) {
    const s = skin.system;
    const statLine = sl => `Hot ${sl.hot} · Cold ${sl.cold} · Volatile ${sl.volatile} · Dark ${sl.dark}`;
    const datalist = (id, csv) => {
      const opts = (csv ?? "").split(",").map(x => x.trim()).filter(Boolean)
        .map(x => `<option value="${esc(x)}"></option>`).join("");
      return `<datalist id="${id}">${opts}</datalist>`;
    };

    const dlgGroups = new Map();
    (s.moves ?? []).forEach((snapshot, i) => {
      const m = resolveSkinMove(snapshot);
      const g = (m.group ?? "").trim() || "Moves";
      if (!dlgGroups.has(g)) dlgGroups.set(g, []);
      const desc = m.description;
      dlgGroups.get(g).push(`
        <div class="mh2-choice-block">
          <label class="mh2-choice">
            <input type="checkbox" name="move" value="${i}" ${m.granted ? "checked disabled" : ""}>
            ${esc(m.name)}${m.stat ? ` <em>(${esc(MH2.stats[m.stat] ?? m.stat)})</em>` : ""}${m.granted ? " — automatic" : ""}
          </label>
          ${desc ? `<details class="mh2-move-details"><summary>read move</summary><div class="mh2-move-desc">${desc}</div></details>` : ""}
        </div>`);
    });
    const moveRows = [...dlgGroups.entries()]
      .sort((a, b) => (a[0] === "Moves" ? -1 : b[0] === "Moves" ? 1 : a[0].localeCompare(b[0])))
      .map(([g, rows]) => `<fieldset><legend>${esc(g)}</legend>${rows.join("")}</fieldset>`)
      .join("");

    const content = `
      <div class="mh2-skin-dialog mh2-scroll-dialog">
        <fieldset><legend>Stat line</legend>
          <label class="mh2-choice"><input type="radio" name="statline" value="a" checked> ${statLine(s.statlines.a)}</label>
          <label class="mh2-choice"><input type="radio" name="statline" value="b"> ${statLine(s.statlines.b)}</label>
        </fieldset>
        <div class="form-group"><label>Look</label><input name="look" list="mh2-dl-look" placeholder="pick or write your own">${datalist("mh2-dl-look", s.looks)}</div>
        <div class="form-group"><label>Eyes</label><input name="eyes" list="mh2-dl-eyes" placeholder="pick or write your own">${datalist("mh2-dl-eyes", s.eyes)}</div>
        <div class="form-group"><label>Origin</label><input name="origin" list="mh2-dl-origin" placeholder="pick or write your own">${datalist("mh2-dl-origin", s.origins)}</div>
        <p class="mh2-choose-note">Skin moves — choose ${s.moveChoices}${s.moveNote ? ` <em>(${esc(s.moveNote)})</em>` : ""}</p>
        ${moveRows || "<p>This skin has no moves yet.</p>"}
      </div>`;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Become ${skin.name}` },
      position: { width: 480 },
      content,
      ok: {
        label: "Apply Skin",
        icon: "fa-solid fa-mask",
        callback: (event, button) => {
          const f = button.form;
          const chosen = Array.from(f.querySelectorAll('input[name="move"]:checked:not(:disabled)'))
            .map(el => Number(el.value));
          return {
            statline: f.elements.statline.value,
            look: f.elements.look.value.trim(),
            eyes: f.elements.eyes.value.trim(),
            origin: f.elements.origin.value.trim(),
            chosen
          };
        }
      },
      rejectClose: false
    });
    if (!result) return;

    const line = s.statlines[result.statline] ?? s.statlines.a;
    await this.actor.update({
      "system.skin": skin.name,
      "system.stats.hot": line.hot,
      "system.stats.cold": line.cold,
      "system.stats.volatile": line.volatile,
      "system.stats.dark": line.dark,
      "system.look": result.look,
      "system.eyes": result.eyes,
      "system.origin": result.origin,
      "system.customLabel": s.customLabel,
      "system.advancementsTaken": [],
      "system.growingUpTaken": [],
      "system.darkestSelf": s.darkestSelf,
      "system.sexMove": s.sexMove,
      "system.backstory": s.backstory
    });

    // Replace any previously embedded skin with a copy of this one.
    const oldSkins = this.actor.items.filter(i => i.type === "skin").map(i => i.id);
    if (oldSkins.length) await this.actor.deleteEmbeddedDocuments("Item", oldSkins);
    await this.actor.createEmbeddedDocuments("Item", [skin.toObject()]);

    // Create the granted + chosen moves (skipping any the actor already has).
    const indices = new Set(result.chosen);
    (s.moves ?? []).forEach((m, i) => { if (m.granted) indices.add(i); });
    const existing = new Set(this.actor.items.filter(i => i.type === "move").map(i => i.name));
    const toCreate = [...indices]
      .map(i => s.moves[i])
      .filter(m => m && m.name && !existing.has(m.name))
      .map(skinMoveItem);
    if (toCreate.length) await this.actor.createEmbeddedDocuments("Item", toCreate);

    ui.notifications.info(`${this.actor.name} is now ${skin.name}.`);

    // Walk the skin's backstory steps, if any.
    if ((s.backstorySteps ?? []).length) await this.#runBackstory(s.backstorySteps);
    return true;
  }

  /* -------------------------------------------- */
  /*  Backstory walkthrough                       */
  /* -------------------------------------------- */

  /**
   * Grant `count` Strings held BY `holderName` ON... wait, semantics:
   * gives `targetName` a row "{holderName} x count"? No — a String row on an
   * actor lists who THEY hold Strings on. To give X a String on ME, add a row
   * named after ME to X's list. If X isn't a character, record it in the open
   * NPC tracker instead (holder = X, target = me).
   */
  async #grantStringOnMe(targetName, count) {
    const me = this.actor;
    const clean = targetName.trim();
    if (!clean) return false;
    const target = game.actors.find(a =>
      a.type === "character" && a.name.trim().toLowerCase() === clean.toLowerCase());

    if (target && target.id !== me.id) {
      if (target.isOwner) {
        const strings = foundry.utils.deepClone(target.system.toObject().strings ?? []);
        const match = strings.find(x => sameName(x.name, me.name));
        if (match) match.count += count;
        else strings.push({ name: me.name, count });
        await target.update({ "system.strings": strings });
      } else if (game.users.find(u => u.isGM && u.active)) {
        game.socket.emit("system.monsterhearts2", {
          type: "grantString", actorId: target.id, name: me.name, count
        });
      } else {
        ui.notifications.warn(`No GM online to give ${target.name} their String on ${me.name}.`);
        return false;
      }
      return true;
    }

    // Not a character: record in the shared NPC-Strings tracker via GM.
    if (game.user.isGM) {
      const entries = foundry.utils.deepClone(game.settings.get("monsterhearts2", "npcStrings") ?? []);
      const match = entries.find(e => sameName(e.holder, clean) && sameName(e.target, me.name));
      if (match) match.count = (Number(match.count) || 0) + count;
      else entries.push({ holder: clean, target: me.name, count });
      await game.settings.set("monsterhearts2", "npcStrings", entries);
    } else if (game.users.find(u => u.isGM && u.active)) {
      game.socket.emit("system.monsterhearts2", {
        type: "grantNpcString", holder: clean, target: me.name, count
      });
    } else {
      ui.notifications.warn(`No GM online to record ${clean}'s String in the tracker.`);
      return false;
    }
    return true;
  }

  /** Add Strings to this actor's own list, merged by name. */
  async #gainStringsOn(name, count) {
    const clean = name.trim();
    if (!clean) return false;
    const strings = this.#sourceArray("strings");
    const match = strings.find(x => sameName(x.name, clean));
    if (match) match.count += count;
    else strings.push({ name: clean, count });
    await this.actor.update({ "system.strings": strings });
    return true;
  }

  async #runBackstory(steps) {
    const DialogV2 = foundry.applications.api.DialogV2;
    const done = [];

    for (const step of steps) {
      const label = step.label || "(unnamed step)";
      const count = Math.max(1, Number(step.count) || 1);

      if (step.type === "note") {
        await DialogV2.prompt({
          window: { title: "Backstory" },
          content: `<div class="mh2-skin-dialog"><p>${esc(label)}</p></div>`,
          ok: { label: "Noted" },
          rejectClose: false
        });
        done.push(label);
        continue;
      }

      if (step.type === "gainAll") {
        const others = game.actors.filter(a => a.type === "character" && a.id !== this.actor.id);
        const go = await DialogV2.confirm({
          window: { title: "Backstory" },
          content: `<div class="mh2-skin-dialog"><p>${esc(label)}</p><p><strong>${esc(this.actor.name)}</strong> gains a String on every other main character (${others.length}). Apply?</p></div>`,
          rejectClose: false
        });
        if (go) {
          for (const other of others) await this.#gainStringsOn(other.name, 1);
          done.push(`${label} — gained a String on everyone`);
        }
        continue;
      }

      if (step.type === "giveAll") {
        const others = game.actors.filter(a => a.type === "character" && a.id !== this.actor.id);
        const go = await DialogV2.confirm({
          window: { title: "Backstory" },
          content: `<div class="mh2-skin-dialog"><p>${esc(label)}</p><p>Every other main character (${others.length}) gains a String on <strong>${esc(this.actor.name)}</strong>. Apply?</p></div>`,
          rejectClose: false
        });
        if (go) {
          for (const other of others) await this.#grantStringOnMe(other.name, 1);
          done.push(`${label} — everyone gained a String`);
        }
        continue;
      }

      if (step.type === "mutual") {
        const name = await DialogV2.prompt({
          window: { title: "Backstory" },
          content: `
            <div class="mh2-skin-dialog">
              <p>${esc(label)}</p>
              <div class="form-group"><label>You gain ${count} on each other with:</label>
              <input type="text" name="who" placeholder="Name" autofocus></div>
            </div>`,
          ok: { label: "Apply", callback: (ev, b) => b.form.elements.who.value },
          rejectClose: false
        });
        if (name?.trim()) {
          const clean = name.trim();
          await this.#gainStringsOn(clean, count);
          await this.#grantStringOnMe(clean, count);
          done.push(`${label} — ${clean}: ${count} String${count > 1 ? "s" : ""} each way`);
        }
        continue;
      }

      if (step.type === "exchange") {
        const c2 = Math.max(0, Number(step.count2) || 0);
        const name = await DialogV2.prompt({
          window: { title: "Backstory" },
          content: `
            <div class="mh2-skin-dialog">
              <p>${esc(label)}</p>
              <div class="form-group"><label>They gain ${count} String${count > 1 ? "s" : ""} on you${c2 ? `, you take ${c2} on them` : ""}:</label>
              <input type="text" name="who" placeholder="Name" autofocus></div>
            </div>`,
          ok: { label: "Apply", callback: (ev, b) => b.form.elements.who.value },
          rejectClose: false
        });
        if (name?.trim()) {
          const clean = name.trim();
          await this.#grantStringOnMe(clean, count);
          if (c2) await this.#gainStringsOn(clean, c2);
          done.push(`${label} — ${clean}: gains ${count} on you${c2 ? `, you take ${c2}` : ""}`);
        }
        continue;
      }

      if (step.type === "gainEach") {
        const rows = Array.fromRange(count).map(i => `
          <div class="form-group"><label>Name ${i + 1}</label>
          <input type="text" name="who${i}" placeholder="Name"></div>`).join("");
        const names = await DialogV2.prompt({
          window: { title: "Backstory" },
          content: `<div class="mh2-skin-dialog"><p>${esc(label)}</p><p>You gain 1 String on each:</p>${rows}</div>`,
          ok: {
            label: "Apply",
            callback: (ev, b) => Array.fromRange(count)
              .map(i => b.form.elements[`who${i}`].value.trim()).filter(Boolean)
          },
          rejectClose: false
        });
        if (names?.length) {
          for (const nm of names) await this.#gainStringsOn(nm, 1);
          done.push(`${label} — ${names.join(", ")}`);
        }
        continue;
      }

      if (step.type === "divide") {
        const rows = Array.fromRange(count).map(i => `
          <div class="mh2-divide-row form-group">
            <input type="text" name="who${i}" placeholder="Name (person or Dark Power…)">
            <input type="number" name="c${i}" value="${i === 0 ? count : 0}" min="0" step="1">
          </div>`).join("");
        const parts = await DialogV2.prompt({
          window: { title: "Backstory" },
          content: `<div class="mh2-skin-dialog"><p>${esc(label)}</p><p>Divide <strong>${count}</strong> Strings on you — any mix of people:</p>${rows}</div>`,
          ok: {
            label: "Apply",
            callback: (ev, b) => Array.fromRange(count).map(i => ({
              name: b.form.elements[`who${i}`].value.trim(),
              c: Math.max(0, Number(b.form.elements[`c${i}`].value) || 0)
            })).filter(p => p.name && p.c > 0)
          },
          rejectClose: false
        });
        if (parts?.length) {
          const total = parts.reduce((s, p) => s + p.c, 0);
          if (total !== count) ui.notifications.warn(`You divided ${total}, the step says ${count} — applying as entered.`);
          for (const p of parts) await this.#grantStringOnMe(p.name, p.c);
          done.push(`${label} — ${parts.map(p => `${p.name} ×${p.c}`).join(", ")}`);
        }
        continue;
      }

      if (step.type === "tokens") {
        const rows = Array.fromRange(count).map(i => `
          <div class="mh2-divide-row form-group">
            <input type="text" name="who${i}" placeholder="Whose?">
            <input type="text" name="what${i}" placeholder="What is it? (a lock of hair…)">
          </div>`).join("");
        const tokens = await DialogV2.prompt({
          window: { title: "Backstory" },
          content: `<div class="mh2-skin-dialog"><p>${esc(label)}</p><p>${count} Sympathetic Token${count > 1 ? "s" : ""} — each counts as a String on its person:</p>${rows}</div>`,
          ok: {
            label: "Apply",
            callback: (ev, b) => Array.fromRange(count).map(i => ({
              whose: b.form.elements[`who${i}`].value.trim(),
              what: b.form.elements[`what${i}`].value.trim()
            })).filter(t => t.whose)
          },
          rejectClose: false
        });
        if (tokens?.length) {
          for (const t of tokens) await this.#gainStringsOn(t.whose, 1);
          done.push(`${label} — ${tokens.map(t => `Token on ${t.whose}${t.what ? ` (${t.what})` : ""}`).join("; ")}`);
        }
        continue;
      }

      // gainOn / giveTo need a name.
      const isGain = step.type === "gainOn";
      const name = await DialogV2.prompt({
        window: { title: "Backstory" },
        content: `
          <div class="mh2-skin-dialog">
            <p>${esc(label)}</p>
            <div class="form-group">
              <label>${isGain ? `You gain ${count} String${count > 1 ? "s" : ""} on:` : `They gain ${count} String${count > 1 ? "s" : ""} on you:`}</label>
              <input type="text" name="who" placeholder="Name" autofocus>
            </div>
          </div>`,
        ok: {
          label: "Apply",
          callback: (event, button) => button.form.elements.who.value
        },
        rejectClose: false
      });
      if (!name || !name.trim()) continue;

      const ok = isGain
        ? await this.#gainStringsOn(name, count)
        : await this.#grantStringOnMe(name, count);
      if (ok) done.push(`${label} — ${name.trim()}`);
    }

    if (done.length) {
      const items = done.map(d => `<li>${esc(d)}</li>`).join("");
      return ChatMessage.implementation.create({
        speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
        content: `
          <div class="mh2-roll-card mh2-string-card">
            <header class="mh2-card-header"><h3>Backstory — ${esc(this.actor.name)}</h3></header>
            <ul>${items}</ul>
          </div>`
      });
    }
  }

  /* -------------------------------------------- */
  /*  Advancement                                 */
  /* -------------------------------------------- */


  /** The world's shared "Growing Up" pseudo-skin, if the MC has built one. */
  #growingUpSkin() {
    return game.items.find(i =>
      i.type === "skin" && i.name.trim().toLowerCase() === "growing up") ?? null;
  }

  async #advance() {
    const actor = this.actor;
    const DialogV2 = foundry.applications.api.DialogV2;
    const skinItem = this.#resolveSkin();
    const advs = skinItem?.system.advancements ?? [];
    const taken = new Set(actor.system.advancementsTaken ?? []);

    const rows = advs.map((a, i) => taken.has(i) ? "" : `
      <label class="mh2-choice">
        <input type="radio" name="adv" value="${i}">
        ${esc(a.label)}${a.grantsMove || a.anySkin ? ' <em>(grants a move)</em>' : ""}
      </label>`).join("");

    // Growing Up: unlocked once five advancements have been taken.
    const guSkin = this.#growingUpSkin();
    const grownUp = (actor.system.advancementsTaken ?? []).length >= 5;
    const guTaken = new Set(actor.system.growingUpTaken ?? []);
    const guAdvs = (grownUp && guSkin) ? (guSkin.system.advancements ?? []) : [];
    const guRows = guAdvs.map((a, i) => guTaken.has(i) ? "" : `
      <label class="mh2-choice">
        <input type="radio" name="adv" value="g${i}">
        ${esc(a.label)}${a.grantsMove || a.anySkin ? ' <em>(grants a move)</em>' : ""}
      </label>`).join("");
    const guNote = (grownUp && !guSkin)
      ? `<p class="mh2-hint">This character has grown up — build a skin item named exactly "Growing Up" to offer the second-tier list here.</p>` : "";

    const content = `
      <div class="mh2-skin-dialog mh2-scroll-dialog">
        ${rows.trim() ? `<fieldset><legend>Choose an advancement</legend>${rows}</fieldset>` : "<p>No advancements left on this skin's list — write a custom one below.</p>"}
        ${guRows.trim() ? `<fieldset class="mh2-gu"><legend>✧ Growing Up</legend>${guRows}</fieldset>` : guNote}
        <div class="form-group"><label>Or custom</label><input name="custom" placeholder="e.g. +1 Hot"></div>
      </div>`;

    const res = await DialogV2.prompt({
      window: { title: `Advance ${actor.name}` },
      position: { width: 440 },
      content,
      ok: {
        label: "Advance",
        icon: "fa-solid fa-arrow-trend-up",
        callback: (event, button) => ({
          index: button.form.elements.adv?.value ?? "",
          custom: button.form.elements.custom.value.trim()
        })
      },
      rejectClose: false
    });
    if (!res) return;

    let label = res.custom;
    let grantsMove = false;
    let anySkin = false;
    let usedIndex = null;
    let usedGu = null;
    let sourceSkin = skinItem;
    if (!label && res.index !== "") {
      if (String(res.index).startsWith("g")) {
        const gi = Number(String(res.index).slice(1));
        const a = guAdvs[gi];
        label = a?.label ?? "";
        grantsMove = !!a?.grantsMove || !!a?.anySkin;
        anySkin = !!a?.anySkin;
        usedGu = gi;
        sourceSkin = guSkin;
      } else {
        const a = advs[Number(res.index)];
        label = a?.label ?? "";
        grantsMove = !!a?.grantsMove || !!a?.anySkin;
        anySkin = !!a?.anySkin;
        usedIndex = Number(res.index);
      }
    }
    if (!label) return ui.notifications.warn("Pick an advancement or write a custom one.");

    // Move-granting advancement: offer remaining moves from this skin —
    // or, for "any skin" advancements, from every skin item in the world.
    if (grantsMove) {
      const existing = new Set(actor.items.filter(i => i.type === "move").map(i => i.name));

      // Build the pools of candidate moves.
      const pools = [];
      if (sourceSkin) pools.push({ key: "self", name: sourceSkin.name, moves: sourceSkin.system.moves ?? [] });
      if (anySkin) {
        for (const world of game.items.filter(i => i.type === "skin")) {
          if (sourceSkin && world.id === sourceSkin.id) continue;
          if (world.name.trim().toLowerCase() === "growing up") continue;
          pools.push({ key: world.id, name: world.name, moves: world.system.moves ?? [] });
        }
      }

      const seen = new Set();
      const sections = [];
      for (const pool of pools) {
        const rows = pool.moves
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => m.name && !existing.has(m.name) && !seen.has(m.name))
          .map(({ m, i }) => {
            seen.add(m.name);
            const desc = resolveSkinMove(m).description;
            return `
              <div class="mh2-choice-block">
                <label class="mh2-choice">
                  <input type="checkbox" name="move" value="${pool.key}:${i}">
                  ${esc(m.name)}${m.group ? ` <em>[${esc(m.group)}]</em>` : ""}${m.stat ? ` <em>(${esc(MH2.stats[m.stat] ?? m.stat)})</em>` : ""}
                </label>
                ${desc ? `<details class="mh2-move-details"><summary>read move</summary><div class="mh2-move-desc">${desc}</div></details>` : ""}
              </div>`;
          }).join("");
        if (rows) sections.push(`<fieldset><legend>${esc(pool.name)}</legend>${rows}</fieldset>`);
      }

      if (sections.length) {
        const picked = await DialogV2.prompt({
          window: { title: anySkin ? "Take a move from any skin" : "Take a new skin move" },
          position: { width: 460 },
          content: `<div class="mh2-skin-dialog mh2-scroll-dialog">${sections.join("")}</div>`,
          ok: {
            label: "Take",
            callback: (event, button) =>
              Array.from(button.form.querySelectorAll('input[name="move"]:checked')).map(el => el.value)
          },
          rejectClose: false
        });
        if (picked?.length) {
          const poolMap = new Map(pools.map(p => [p.key, p.moves]));
          const creates = picked.map(v => {
            const [key, idx] = v.split(":");
            return poolMap.get(key)?.[Number(idx)];
          }).filter(m => m).map(skinMoveItem);
          if (creates.length) await actor.createEmbeddedDocuments("Item", creates);
        }
      } else {
        ui.notifications.info("No new moves available to take.");
      }
    }

    const prev = actor.system.advancements;
    const update = {
      "system.advancements": prev ? `${prev}; ${label}` : label,
      "system.experience.value": 0
    };
    if (usedIndex !== null) {
      update["system.advancementsTaken"] = [...(actor.system.advancementsTaken ?? []), usedIndex];
    }
    if (usedGu !== null) {
      update["system.growingUpTaken"] = [...(actor.system.growingUpTaken ?? []), usedGu];
    }
    await actor.update(update);

    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `
        <div class="mh2-roll-card mh2-string-card">
          <header class="mh2-card-header"><h3>${usedGu !== null ? "✧ Growing Up" : "Advancement"}</h3></header>
          <p><strong>${esc(actor.name)}</strong> advances: ${esc(label)}. The experience track resets.</p>
        </div>`
    });
  }
}
