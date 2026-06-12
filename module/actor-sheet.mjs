import { MH2 } from "./config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

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
      deleteMove: MH2ActorSheet.#onDeleteMove
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
}
