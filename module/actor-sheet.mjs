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
      addCondition: MH2ActorSheet.#onAddCondition,
      deleteCondition: MH2ActorSheet.#onDeleteCondition,
      addString: MH2ActorSheet.#onAddString,
      deleteString: MH2ActorSheet.#onDeleteString,
      stringPlus: MH2ActorSheet.#onStringPlus,
      stringMinus: MH2ActorSheet.#onStringMinus,
      spendString: MH2ActorSheet.#onSpendString,
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

    const allMoves = actor.items
      .filter(i => i.type === "move")
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
    context.basicMoves = allMoves.filter(m => m.system.category === "basic");
    context.skinMoves = allMoves.filter(m => m.system.category !== "basic");

    context.xpFull = sys.experience.value >= sys.experience.max;
    context.skinItem = actor.items.find(i => i.type === "skin") ?? null;

    const enrichOpts = { relativeTo: actor, secrets: actor.isOwner };
    context.enriched = {
      darkestSelf: await TE.enrichHTML(sys.darkestSelf, enrichOpts),
      sexMove: await TE.enrichHTML(sys.sexMove, enrichOpts),
      backstory: await TE.enrichHTML(sys.backstory, enrichOpts),
      notes: await TE.enrichHTML(sys.notes, enrichOpts)
    };

    return context;
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
    const current = this.actor.system.harm.value;
    const value = (current === i + 1) ? i : i + 1;
    return this.actor.update({ "system.harm.value": value });
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
      return this.actor.rollMH({ stat: move.system.stat, label: move.name, description });
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
    return this.actor.items.find(i => i.type === "skin")?.sheet.render(true);
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
    const statLine = sl => `Hot ${sl.hot} · Cold ${sl.cold} · Volatile ${sl.volatile} · Dark ${sl.dark}`;
    const datalist = (id, csv) => {
      const opts = (csv ?? "").split(",").map(x => x.trim()).filter(Boolean)
        .map(x => `<option value="${esc(x)}"></option>`).join("");
      return `<datalist id="${id}">${opts}</datalist>`;
    };

    const moveRows = (s.moves ?? []).map((m, i) => `
      <label class="mh2-choice">
        <input type="checkbox" name="move" value="${i}" ${m.granted ? "checked disabled" : ""}>
        ${esc(m.name)}${m.stat ? ` <em>(${esc(MH2.stats[m.stat] ?? m.stat)})</em>` : ""}${m.granted ? " — automatic" : ""}
      </label>`).join("");

    const content = `
      <div class="mh2-skin-dialog">
        <fieldset><legend>Stat line</legend>
          <label class="mh2-choice"><input type="radio" name="statline" value="a" checked> ${statLine(s.statlines.a)}</label>
          <label class="mh2-choice"><input type="radio" name="statline" value="b"> ${statLine(s.statlines.b)}</label>
        </fieldset>
        <div class="form-group"><label>Look</label><input name="look" list="mh2-dl-look" placeholder="pick or write your own">${datalist("mh2-dl-look", s.looks)}</div>
        <div class="form-group"><label>Eyes</label><input name="eyes" list="mh2-dl-eyes" placeholder="pick or write your own">${datalist("mh2-dl-eyes", s.eyes)}</div>
        <div class="form-group"><label>Origin</label><input name="origin" list="mh2-dl-origin" placeholder="pick or write your own">${datalist("mh2-dl-origin", s.origins)}</div>
        <fieldset><legend>Skin moves — choose ${s.moveChoices}${s.moveNote ? ` <em>(${esc(s.moveNote)})</em>` : ""}</legend>
          ${moveRows || "<p>This skin has no moves yet.</p>"}
        </fieldset>
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
        system: { stat: m.stat, category: "skin", description: m.description }
      }));
    if (toCreate.length) await this.actor.createEmbeddedDocuments("Item", toCreate);

    ui.notifications.info(`${this.actor.name} is now ${skin.name}.`);
  }

  /* -------------------------------------------- */
  /*  Advancement                                 */
  /* -------------------------------------------- */

  async #advance() {
    const actor = this.actor;
    const DialogV2 = foundry.applications.api.DialogV2;
    const skinItem = actor.items.find(i => i.type === "skin");
    const advs = skinItem?.system.advancements ?? [];

    const rows = advs.map((a, i) => `
      <label class="mh2-choice">
        <input type="radio" name="adv" value="${i}">
        ${esc(a.label)}${a.grantsMove ? ' <em>(grants a move)</em>' : ""}
      </label>`).join("");

    const content = `
      <div class="mh2-skin-dialog">
        ${rows ? `<fieldset><legend>Choose an advancement</legend>${rows}</fieldset>` : "<p>This character's skin has no advancement list.</p>"}
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
    if (!label && res.index !== "") {
      const a = advs[Number(res.index)];
      label = a?.label ?? "";
      grantsMove = !!a?.grantsMove;
    }
    if (!label) return ui.notifications.warn("Pick an advancement or write a custom one.");

    // Move-granting advancement: offer the remaining skin moves.
    if (grantsMove && skinItem) {
      const existing = new Set(actor.items.filter(i => i.type === "move").map(i => i.name));
      const remaining = (skinItem.system.moves ?? [])
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.name && !existing.has(m.name));

      if (remaining.length) {
        const moveRows = remaining.map(({ m, i }) => `
          <label class="mh2-choice">
            <input type="checkbox" name="move" value="${i}">
            ${esc(m.name)}${m.stat ? ` <em>(${esc(MH2.stats[m.stat] ?? m.stat)})</em>` : ""}
          </label>`).join("");
        const picked = await DialogV2.prompt({
          window: { title: "Take a new skin move" },
          position: { width: 420 },
          content: `<div class="mh2-skin-dialog"><fieldset><legend>Choose</legend>${moveRows}</fieldset></div>`,
          ok: {
            label: "Take",
            callback: (event, button) =>
              Array.from(button.form.querySelectorAll('input[name="move"]:checked')).map(el => Number(el.value))
          },
          rejectClose: false
        });
        if (picked?.length) {
          const creates = picked.map(i => skinItem.system.moves[i]).map(m => ({
            name: m.name,
            type: "move",
            img: m.img || undefined,
            system: { stat: m.stat, category: "skin", description: m.description }
          }));
          await actor.createEmbeddedDocuments("Item", creates);
        }
      } else {
        ui.notifications.info("No remaining skin moves to take.");
      }
    }

    const prev = actor.system.advancements;
    await actor.update({
      "system.advancements": prev ? `${prev}; ${label}` : label,
      "system.experience.value": 0
    });

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
