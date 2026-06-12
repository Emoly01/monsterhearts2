import { MH2 } from "./config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class MH2ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["monsterhearts2", "sheet", "item"],
    position: { width: 480, height: 480 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: MH2ItemSheet.#onEditImage
    }
  };

  /** @override */
  static PARTS = {
    body: {
      template: "systems/monsterhearts2/templates/item-sheet.hbs",
      scrollable: [".mh2-item-body"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    const TE = foundry.applications.ux?.TextEditor?.implementation ?? TextEditor;

    context.item = item;
    context.system = item.system;
    context.statOptions = MH2.statOptions.map(o => ({
      ...o, selected: o.value === item.system.stat
    }));
    context.enrichedDescription = await TE.enrichHTML(item.system.description, {
      relativeTo: item, secrets: item.isOwner
    });
    return context;
  }

  static async #onEditImage(event, target) {
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? FilePicker;
    const picker = new FP({
      type: "image",
      current: this.document.img,
      callback: path => this.document.update({ img: path })
    });
    return picker.browse();
  }
}
