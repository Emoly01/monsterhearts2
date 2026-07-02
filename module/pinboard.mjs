const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SETTING = "boards";
const BGS = ["paper", "grid", "night"];
const COLORS = ["red", "gold", "green", "sea", "pink", "bone"];

/**
 * A shared, draggable pinboard: boards of index cards everyone can create,
 * label, colour, and move. Backed by a world setting; non-GM writes are
 * routed to the first active GM via socket.
 */
export class MH2Pinboard extends HandlebarsApplicationMixin(ApplicationV2) {

  static registerSetting() {
    game.settings.register("monsterhearts2", SETTING, {
      scope: "world",
      config: false,
      type: Array,
      default: [],
      onChange: () => {
        for (const app of foundry.applications.instances.values()) {
          if (app instanceof MH2Pinboard) app.render();
        }
      }
    });
  }

  static get boards() {
    return foundry.utils.deepClone(game.settings.get("monsterhearts2", SETTING) ?? []);
  }

  static async save(boards) {
    if (game.user.isGM) return game.settings.set("monsterhearts2", SETTING, boards);
    if (game.users.find(u => u.isGM && u.active)) {
      return game.socket.emit("system.monsterhearts2", { type: "setBoards", boards });
    }
    ui.notifications.warn("No GM online — board changes can't be saved.");
  }

  #boardId = null;
  #drag = null;

  static DEFAULT_OPTIONS = {
    id: "mh2-pinboard",
    classes: ["monsterhearts2", "mh2-pinboard"],
    position: { width: 940, height: 720 },
    window: { title: "Pinboard", icon: "fa-solid fa-map-location-dot", resizable: true },
    actions: {
      addBoard: MH2Pinboard.#onAddBoard,
      deleteBoard: MH2Pinboard.#onDeleteBoard,
      toggleBg: MH2Pinboard.#onToggleBg,
      addCard: MH2Pinboard.#onAddCard
    }
  };

  static PARTS = {
    body: { template: "systems/monsterhearts2/templates/pinboard.hbs" }
  };

  /* -------------------------------------------- */

  async _prepareContext(options) {
    const boards = MH2Pinboard.boards;
    let board = boards.find(b => b.id === this.#boardId) ?? boards[0] ?? null;
    if (board) this.#boardId = board.id;
    return {
      boards: boards.map(b => ({ id: b.id, name: b.name, selected: b.id === board?.id })),
      board,
      hasBoard: !!board,
      isGM: game.user.isGM
    };
  }

  /** Mutate the current board and persist. */
  async #updateBoard(mutator) {
    const boards = MH2Pinboard.boards;
    const b = boards.find(x => x.id === this.#boardId);
    if (!b) return;
    mutator(b);
    await MH2Pinboard.save(boards);
    this.render();
  }

  /* -------------------------------------------- */
  /*  Rendering & interaction                     */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    root.querySelector(".mh2-board-select")?.addEventListener("change", ev => {
      this.#boardId = ev.currentTarget.value;
      this.render();
    });

    const surface = root.querySelector(".mh2-board-surface");
    if (!surface) return;

    // Double-click empty space: new card there.
    surface.addEventListener("dblclick", ev => {
      if (ev.target.closest(".mh2-card")) return;
      const rect = surface.getBoundingClientRect();
      this.#createCard(ev.clientX - rect.left, ev.clientY - rect.top);
    });

    // Card interactions.
    for (const card of surface.querySelectorAll(".mh2-card")) {
      card.addEventListener("pointerdown", ev => this.#onDragStart(ev, card, surface));
      card.addEventListener("dblclick", ev => {
        ev.stopPropagation();
        this.#editCard(card.dataset.cardId);
      });
    }
  }

  #onDragStart(ev, card, surface) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const crect = card.getBoundingClientRect();
    this.#drag = {
      card,
      id: card.dataset.cardId,
      surface,
      dx: ev.clientX - crect.left,
      dy: ev.clientY - crect.top,
      moved: false
    };
    card.setPointerCapture(ev.pointerId);
    card.classList.add("dragging");
    card.addEventListener("pointermove", this.#onDragMove);
    card.addEventListener("pointerup", this.#onDragEnd, { once: true });
  }

  #onDragMove = ev => {
    const d = this.#drag;
    if (!d) return;
    const srect = d.surface.getBoundingClientRect();
    let x = ev.clientX - srect.left - d.dx;
    let y = ev.clientY - srect.top - d.dy;
    x = Math.max(0, Math.min(x, d.surface.offsetWidth - d.card.offsetWidth));
    y = Math.max(0, Math.min(y, d.surface.offsetHeight - d.card.offsetHeight));
    d.card.style.left = `${x}px`;
    d.card.style.top = `${y}px`;
    d.moved = true;
  };

  #onDragEnd = ev => {
    const d = this.#drag;
    this.#drag = null;
    if (!d) return;
    d.card.classList.remove("dragging");
    d.card.removeEventListener("pointermove", this.#onDragMove);
    if (!d.moved) return;
    const x = parseInt(d.card.style.left) || 0;
    const y = parseInt(d.card.style.top) || 0;
    this.#updateBoard(b => {
      const c = b.cards.find(c => c.id === d.id);
      if (c) { c.x = x; c.y = y; }
    });
  };

  /* -------------------------------------------- */
  /*  Card & board operations                     */
  /* -------------------------------------------- */

  async #createCard(x, y) {
    const label = await foundry.applications.api.DialogV2.prompt({
      window: { title: "New card" },
      content: `<div class="form-group"><input type="text" name="label" placeholder="Name this place / person" autofocus></div>`,
      ok: { label: "Pin it", callback: (ev, b) => b.form.elements.label.value.trim() },
      rejectClose: false
    });
    if (!label) return;
    const color = COLORS[Math.floor(Math.random() * 4)];
    return this.#updateBoard(b => {
      b.cards.push({
        id: foundry.utils.randomID(8),
        label, note: "", color,
        x: Math.max(0, Math.round(x) - 55),
        y: Math.max(0, Math.round(y) - 18)
      });
    });
  }

  async #editCard(cardId) {
    const board = MH2Pinboard.boards.find(b => b.id === this.#boardId);
    const card = board?.cards.find(c => c.id === cardId);
    if (!card) return;

    const colorOpts = COLORS.map(c =>
      `<option value="${c}"${c === card.color ? " selected" : ""}>${c}</option>`).join("");

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Edit card" },
      position: { width: 380 },
      content: `
        <div class="mh2-skin-dialog">
          <div class="form-group"><label>Label</label>
            <input type="text" name="label" value="${card.label.replace(/"/g, "&quot;")}" autofocus></div>
          <div class="form-group"><label>Note</label>
            <input type="text" name="note" value="${(card.note ?? "").replace(/"/g, "&quot;")}" placeholder="one line of lore"></div>
          <div class="form-group"><label>Colour</label>
            <select name="color">${colorOpts}</select></div>
        </div>`,
      buttons: [
        {
          action: "save", label: "Save", icon: "fa-solid fa-check", default: true,
          callback: (ev, button) => ({
            label: button.form.elements.label.value.trim(),
            note: button.form.elements.note.value.trim(),
            color: button.form.elements.color.value
          })
        },
        { action: "delete", label: "Delete", icon: "fa-solid fa-trash" },
        { action: "cancel", label: "Cancel" }
      ],
      rejectClose: false
    });

    if (!result || result === "cancel") return;
    if (result === "delete") {
      return this.#updateBoard(b => { b.cards = b.cards.filter(c => c.id !== cardId); });
    }
    return this.#updateBoard(b => {
      const c = b.cards.find(c => c.id === cardId);
      if (c) Object.assign(c, { label: result.label || c.label, note: result.note, color: result.color });
    });
  }

  static async #onAddBoard() {
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: "New board" },
      content: `<div class="form-group"><input type="text" name="name" placeholder="Our Town / Homeroom / …" autofocus></div>`,
      ok: { label: "Create", callback: (ev, b) => b.form.elements.name.value.trim() },
      rejectClose: false
    });
    if (!name) return;
    const boards = MH2Pinboard.boards;
    const board = { id: foundry.utils.randomID(8), name, bg: "paper", cards: [] };
    boards.push(board);
    this.#boardId = board.id;
    await MH2Pinboard.save(boards);
    this.render();
  }

  static async #onDeleteBoard() {
    if (!game.user.isGM) return ui.notifications.warn("Only the MC can delete a board.");
    const board = MH2Pinboard.boards.find(b => b.id === this.#boardId);
    if (!board) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete "${board.name}"?` },
      content: `<p>Delete the board <strong>${board.name}</strong> and all its cards?</p>`,
      rejectClose: false
    });
    if (!ok) return;
    const boards = MH2Pinboard.boards.filter(b => b.id !== board.id);
    this.#boardId = boards[0]?.id ?? null;
    await MH2Pinboard.save(boards);
    this.render();
  }

  static async #onToggleBg() {
    return this.#updateBoard(b => {
      b.bg = BGS[(BGS.indexOf(b.bg) + 1) % BGS.length];
    });
  }

  static async #onAddCard() {
    return this.#createCard(80 + Math.random() * 120, 80 + Math.random() * 120);
  }
}
