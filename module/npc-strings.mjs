const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SETTING = "npcStrings";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

/**
 * A single open list the MC keeps of every String an NPC holds, on anyone.
 * Stored in a world setting so it's shared and visible to everyone.
 */
export class MH2NpcStrings extends HandlebarsApplicationMixin(ApplicationV2) {

  static SETTING = SETTING;

  /** Register the backing world setting. Call once at init. */
  static registerSetting() {
    game.settings.register("monsterhearts2", SETTING, {
      scope: "world",
      config: false,
      type: Array,
      default: []
    });
  }

  static get entries() {
    return foundry.utils.deepClone(game.settings.get("monsterhearts2", SETTING) ?? []);
  }

  static async save(entries) {
    await game.settings.set("monsterhearts2", SETTING, entries);
    // Refresh any open instance for everyone.
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof MH2NpcStrings) app.render();
    }
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "mh2-npc-strings",
    classes: ["monsterhearts2", "mh2-npc-tracker"],
    position: { width: 460, height: 520 },
    window: { title: "NPC Strings", icon: "fa-solid fa-link", resizable: true },
    actions: {
      addEntry: MH2NpcStrings.#onAdd,
      deleteEntry: MH2NpcStrings.#onDelete,
      plus: MH2NpcStrings.#onPlus,
      minus: MH2NpcStrings.#onMinus
    }
  };

  /** @override */
  static PARTS = {
    body: {
      template: "systems/monsterhearts2/templates/npc-strings.hbs",
      scrollable: [".mh2-npc-list"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    return {
      entries: MH2NpcStrings.entries,
      isGM: game.user.isGM
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    // Persist free-text edits on change.
    this.element.querySelectorAll("input[data-field]").forEach(input => {
      input.addEventListener("change", async ev => {
        const el = ev.currentTarget;
        const i = Number(el.dataset.index);
        const field = el.dataset.field;
        const entries = MH2NpcStrings.entries;
        if (!entries[i]) return;
        entries[i][field] = field === "count" ? Math.max(0, Number(el.value) || 0) : el.value;
        await MH2NpcStrings.save(entries);
      });
    });
  }

  /* -------------------------------------------- */
  /*  Actions (GM only for mutations)             */
  /* -------------------------------------------- */

  static async #onAdd() {
    const entries = MH2NpcStrings.entries;
    entries.push({ holder: "", target: "", count: 1 });
    return MH2NpcStrings.save(entries);
  }

  static async #onDelete(event, target) {
    const entries = MH2NpcStrings.entries;
    entries.splice(Number(target.dataset.index), 1);
    return MH2NpcStrings.save(entries);
  }

  static async #onPlus(event, target) {
    const entries = MH2NpcStrings.entries;
    const e = entries[Number(target.dataset.index)];
    if (!e) return;
    e.count = (Number(e.count) || 0) + 1;
    return MH2NpcStrings.save(entries);
  }

  static async #onMinus(event, target) {
    const entries = MH2NpcStrings.entries;
    const e = entries[Number(target.dataset.index)];
    if (!e) return;
    e.count = Math.max(0, (Number(e.count) || 0) - 1);
    return MH2NpcStrings.save(entries);
  }
}
