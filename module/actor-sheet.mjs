import { MH2 } from "./config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

export class MH2ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["monsterhearts2", "sheet", "actor"],
    position: { width: 640, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: MH2ActorSheet.#onEditImage,
      rollStat: MH2ActorSheet.#onRollStat,
      setHarm: MH2ActorSheet.#onSetHarm,
      setXp: MH2ActorSheet.#onSetXp,
      toggleDarkest: MH2ActorSheet.#onToggleDarkest,
      addCondition: MH2ActorSheet.#onAddCondition,
      deleteCondition: MH2ActorSheet.#onDeleteCondition,
      addCustom: MH2ActorSheet.#onAddCustom,
      deleteCustom: MH2ActorSheet.#onDeleteCustom,
      addString: MH2ActorSheet.#onAddString,
      deleteString: MH2ActorSheet.#onDeleteString,
      stringPlus: MH2ActorSheet.#onStringPlus,
      stringMinus: MH2ActorSheet.#onStringMinus,
      spendString: MH2ActorSheet.#onSpendString,
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
      scrollable: [".mh2-body"]
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

    const decorate = m => ({
      id: m.id,
      name: m.name,
      stat: m.system.stat,
      bonus: m.system.bonus ?? 0,
      bonusLabel: (m.system.bonus ?? 0) >= 0 ? `+${m.system.bonus}` : `${m.system.bonus}`
    });
    const allMoves = actor.items
      .filter(i => i.type === "move")
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
    context.basicMoves = allMoves.filter(m => m.system.category === "basic").map(decorate);

    // Skin moves render grouped: ungrouped first, then groups alphabetically.
    const groupMap = new Map();
    for (const m of allMoves.filter(m => m.system.category !== "basic")) {
      const g = (m.system.group ?? "").trim();
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(decorate(m));
    }
    context.skinMoveGroups = [...groupMap.entries()]
      .sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0])))
      .map(([label, moves]) => ({ label, moves }));
    context.hasSkinMoves = groupMap.size > 0;

    context.xpFull = sys.experience.value >= sys.experience.max;
    context.darkestSelfActive = sys.darkestSelfActive;
    context.skinItem = actor.items.find(i => i.type === "skin") ?? null;

    const worldSkins = game.items.filter(i => i.type === "skin")
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
      return this.#skirtDeath();
    }
  }

  static async #onToggleDarkest(event, target) {
    return this.actor.update({ "system.darkestSelfActive": !this.actor.system.darkestSelfActive });
  }

  /**
   * Offer the Skirting Death choice: erase all harm, then either become your
   * Darkest Self or lose every String you hold.
   */
  async #skirtDeath() {
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
    await this.actor.update(update);

    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      content: `
        <div class="mh2-roll-card mh2-string-card">
          <header class="mh2-card-header"><h3>Skirting Death</h3></header>
          <p><strong>${esc(this.actor.name)}</strong> ${line}.</p>
        </div>`
    });
  }

  static async #onSetXp(event, target) {
    const i = Number(target.dataset.value);
    const current = this.actor.system.experience.value;
    const value = (current === i + 1) ? i : i + 1;
    return this.actor.update({ "system.experience.value": value });
  }

  static async #onAddCondition(event, target) {
    const conditions = this.#sourceArray("conditions");
    conditions.push("");
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
    strings.push({ name: "", count: 1 });
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

  static async #onRollMove(event, target) {
    const move = this.#getMove(target);
    if (!move) return;
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    const description = await TE.enrichHTML(move.system.description, {
      relativeTo: move, secrets: false
    });

    if (move.system.stat) {
      return this.actor.rollMH({
        stat: move.system.stat,
        label: move.name,
        description,
        bonus: move.system.bonus ?? 0
      });
    }

    // No roll: just post the move to chat.
    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      content: `
        <div class="mh2-roll-card">
          <header class="mh2-card-header"><h3>${move.name}</h3></header>
          <div class="mh2-move-text">${description}</div>
        </div>`
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
      content: `<p>Delete the move <strong>${move.name}</strong> from this sheet?</p>`,
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
    // Snapshot descriptions can be empty (older skins, or moves built without
    // text). Fall back to the live move item's description, matched by name.
    const liveDesc = name => {
      const it = game.items.find(i => i.type === "move" && i.name === name);
      return it?.system.description ?? "";
    };
    const statLine = sl => `Hot ${sl.hot} · Cold ${sl.cold} · Volatile ${sl.volatile} · Dark ${sl.dark}`;
    const datalist = (id, csv) => {
      const opts = (csv ?? "").split(",").map(x => x.trim()).filter(Boolean)
        .map(x => `<option value="${esc(x)}"></option>`).join("");
      return `<datalist id="${id}">${opts}</datalist>`;
    };

    const dlgGroups = new Map();
    (s.moves ?? []).forEach((m, i) => {
      const g = (m.group ?? "").trim() || "Moves";
      if (!dlgGroups.has(g)) dlgGroups.set(g, []);
      const desc = m.description || liveDesc(m.name);
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
      .map(m => ({
        name: m.name,
        type: "move",
        img: m.img || undefined,
        system: { stat: m.stat, category: "skin", bonus: m.bonus ?? 0, group: m.group ?? "", description: m.description }
      }));
    if (toCreate.length) await this.actor.createEmbeddedDocuments("Item", toCreate);

    ui.notifications.info(`${this.actor.name} is now ${skin.name}.`);
    return true;
  }

  /* -------------------------------------------- */
  /*  Advancement                                 */
  /* -------------------------------------------- */

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

    const content = `
      <div class="mh2-skin-dialog mh2-scroll-dialog">
        ${rows.trim() ? `<fieldset><legend>Choose an advancement</legend>${rows}</fieldset>` : "<p>No advancements left on this skin's list — write a custom one below.</p>"}
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
    if (!label && res.index !== "") {
      const a = advs[Number(res.index)];
      label = a?.label ?? "";
      grantsMove = !!a?.grantsMove || !!a?.anySkin;
      anySkin = !!a?.anySkin;
      usedIndex = Number(res.index);
    }
    if (!label) return ui.notifications.warn("Pick an advancement or write a custom one.");

    // Move-granting advancement: offer remaining moves from this skin —
    // or, for "any skin" advancements, from every skin item in the world.
    if (grantsMove) {
      const existing = new Set(actor.items.filter(i => i.type === "move").map(i => i.name));

      // Build the pools of candidate moves.
      const pools = [];
      if (skinItem) pools.push({ key: "self", name: skinItem.name, moves: skinItem.system.moves ?? [] });
      if (anySkin) {
        for (const world of game.items.filter(i => i.type === "skin")) {
          if (skinItem && world.id === skinItem.id) continue;
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
            const desc = m.description || (() => {
              const it = game.items.find(x => x.type === "move" && x.name === m.name);
              return it?.system.description ?? "";
            })();
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
          }).filter(m => m).map(m => ({
            name: m.name,
            type: "move",
            img: m.img || undefined,
            system: { stat: m.stat, category: "skin", bonus: m.bonus ?? 0, group: m.group ?? "", description: m.description }
          }));
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
    await actor.update(update);

    return ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `
        <div class="mh2-roll-card mh2-string-card">
          <header class="mh2-card-header"><h3>Advancement</h3></header>
          <p><strong>${esc(actor.name)}</strong> advances: ${esc(label)}. The experience track resets.</p>
        </div>`
    });
  }
}
