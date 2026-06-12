import { MH2 } from "./config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class MH2SkinSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["monsterhearts2", "sheet", "item", "skin"],
    position: { width: 620, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: MH2SkinSheet.#onEditImage,
      deleteSkinMove: MH2SkinSheet.#onDeleteSkinMove,
      addAdvancement: MH2SkinSheet.#onAddAdvancement,
      deleteAdvancement: MH2SkinSheet.#onDeleteAdvancement
    }
  };

  /** @override */
  static PARTS = {
    body: {
      template: "systems/monsterhearts2/templates/skin-sheet.hbs",
      scrollable: [".mh2-body"]
    }
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;

    context.item = item;
    context.system = item.system;
    context.statLabels = MH2.stats;

    const enrichOpts = { relativeTo: item, secrets: item.isOwner };
    context.enriched = {
      description: await TE.enrichHTML(item.system.description, enrichOpts),
      darkestSelf: await TE.enrichHTML(item.system.darkestSelf, enrichOpts),
      sexMove: await TE.enrichHTML(item.system.sexMove, enrichOpts),
      backstory: await TE.enrichHTML(item.system.backstory, enrichOpts)
    };
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const DD = foundry.applications.ux?.DragDrop?.implementation
      ?? foundry.applications.ux?.DragDrop
      ?? DragDrop;
    new DD({
      dropSelector: ".mh2-skin-drop",
      callbacks: { drop: this.#onDropMove.bind(this) }
    }).bind(this.element);
  }

  /* -------------------------------------------- */
  /*  Form handling                               */
  /* -------------------------------------------- */

  /**
   * Array fields submit as numeric-keyed objects, and rows only contain a
   * subset of fields — merge by index into the existing source data so the
   * non-form fields (img, description...) survive the update.
   * @override
   */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    const sys = submitData.system;
    if (sys) {
      for (const key of ["moves", "advancements"]) {
        if (sys[key] && !Array.isArray(sys[key])) {
          const src = this.item.system.toObject()[key] ?? [];
          sys[key] = src.map((entry, i) =>
            foundry.utils.mergeObject(entry, sys[key][i] ?? {}, { inplace: false })
          );
        }
      }
    }
    return submitData;
  }

  /* -------------------------------------------- */
  /*  Drag & drop                                 */
  /* -------------------------------------------- */

  async #onDropMove(event) {
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;
    const data = TE.getDragEventData(event);
    if (data?.type !== "Item") return;
    const dropped = await Item.implementation.fromDropData(data);
    if (!dropped) return;
    if (dropped.type !== "move") {
      return ui.notifications.warn("Only move items can be dropped onto a skin.");
    }
    const moves = this.item.system.toObject().moves ?? [];
    if (moves.some(m => m.name === dropped.name)) {
      return ui.notifications.info(`"${dropped.name}" is already in this skin.`);
    }
    moves.push({
      name: dropped.name,
      img: dropped.img ?? "",
      stat: dropped.system?.stat ?? "",
      bonus: dropped.system?.bonus ?? 0,
      group: dropped.system?.group ?? "",
      granted: false,
      description: dropped.system?.description ?? ""
    });
    await this.item.update({ "system.moves": moves });
    ui.notifications.info(`Added "${dropped.name}" to ${this.item.name}.`);
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

  static async #onDeleteSkinMove(event, target) {
    const moves = this.item.system.toObject().moves ?? [];
    moves.splice(Number(target.dataset.index), 1);
    return this.item.update({ "system.moves": moves });
  }

  static async #onAddAdvancement(event, target) {
    const advancements = this.item.system.toObject().advancements ?? [];
    advancements.push({ label: "", grantsMove: false });
    return this.item.update({ "system.advancements": advancements });
  }

  static async #onDeleteAdvancement(event, target) {
    const advancements = this.item.system.toObject().advancements ?? [];
    advancements.splice(Number(target.dataset.index), 1);
    return this.item.update({ "system.advancements": advancements });
  }
}
