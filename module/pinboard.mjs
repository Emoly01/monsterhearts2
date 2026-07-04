const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SETTING = "boards";
const BGS = ["paper", "grid", "night", "sea"];
const COLORS = ["red", "gold", "green", "sea", "pink", "bone", "grey"];

/**
 * A shared map / layout editor. Each board holds elements:
 *   - box   : a resizable, coloured, labelled rectangle (building, desk, room)
 *   - text  : a free-floating label (place names, streets)
 *   - line  : a straight connector between two points (roads, rivers, links)
 * Backed by a world setting; non-GM writes route to the first active GM.
 */
export class MH2Pinboard extends HandlebarsApplicationMixin(ApplicationV2) {

  static registerSetting() {
    game.settings.register("monsterhearts2", SETTING, {
      scope: "world", config: false, type: Array, default: [],
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
  #op = null;   // active drag/resize operation

  static DEFAULT_OPTIONS = {
    id: "mh2-pinboard",
    classes: ["monsterhearts2", "mh2-pinboard"],
    position: { width: 1040, height: 760 },
    window: { title: "Map Editor", icon: "fa-solid fa-map-location-dot", resizable: true },
    actions: {
      addBoard: MH2Pinboard.#onAddBoard,
      deleteBoard: MH2Pinboard.#onDeleteBoard,
      toggleBg: MH2Pinboard.#onToggleBg,
      addBox: MH2Pinboard.#onAddBox,
      addText: MH2Pinboard.#onAddText,
      addLine: MH2Pinboard.#onAddLine
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

    // Split elements by kind for the template, and pre-compute line geometry.
    let boxes = [], texts = [], lines = [];
    if (board) {
      for (const el of (board.elements ?? [])) {
        if (el.kind === "text") texts.push(el);
        else if (el.kind === "line") lines.push(el);
        else boxes.push(el);
      }
    }

    return {
      boards: boards.map(b => ({ id: b.id, name: b.name, selected: b.id === board?.id })),
      board, boxes, texts, lines,
      hasBoard: !!board,
      isGM: game.user.isGM
    };
  }

  async #updateBoard(mutator) {
    const boards = MH2Pinboard.boards;
    const b = boards.find(x => x.id === this.#boardId);
    if (!b) return;
    mutator(b);
    await MH2Pinboard.save(boards);
    this.render();
  }

  #els() {
    const b = MH2Pinboard.boards.find(x => x.id === this.#boardId);
    return b?.elements ?? [];
  }

  /* -------------------------------------------- */
  /*  Interaction                                 */
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

    for (const node of surface.querySelectorAll(".mh2-el")) {
      const id = node.dataset.elId;
      node.addEventListener("pointerdown", ev => {
        if (ev.target.classList.contains("mh2-resize")) return this.#startResize(ev, node, surface, id);
        if (ev.target.classList.contains("mh2-lineend")) return this.#startLineEnd(ev, node, surface, id, ev.target.dataset.end);
        this.#startDrag(ev, node, surface, id);
      });
      node.addEventListener("dblclick", ev => {
        ev.stopPropagation();
        this.#editElement(id);
      });
    }
  }

  #startDrag(ev, node, surface, id) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const el = this.#els().find(e => e.id === id);
    if (!el) return;
    const srect = surface.getBoundingClientRect();
    this.#op = {
      mode: "drag", node, id, surface,
      grabX: ev.clientX - srect.left - (el.x ?? 0),
      grabY: ev.clientY - srect.top - (el.y ?? 0),
      isLine: el.kind === "line",
      startX2: el.x2, startY2: el.y2, x0: el.x, y0: el.y,
      moved: false
    };
    node.setPointerCapture(ev.pointerId);
    node.classList.add("active");
    node.addEventListener("pointermove", this.#onMove);
    node.addEventListener("pointerup", this.#onUp, { once: true });
  }

  #startResize(ev, node, surface, id) {
    ev.preventDefault(); ev.stopPropagation();
    node.setPointerCapture(ev.pointerId);
    this.#op = { mode: "resize", node, id, surface, moved: false };
    node.addEventListener("pointermove", this.#onMove);
    node.addEventListener("pointerup", this.#onUp, { once: true });
  }

  #startLineEnd(ev, node, surface, id, end) {
    ev.preventDefault(); ev.stopPropagation();
    node.setPointerCapture(ev.pointerId);
    this.#op = { mode: "lineend", node, id, surface, end, moved: false };
    node.addEventListener("pointermove", this.#onMove);
    node.addEventListener("pointerup", this.#onUp, { once: true });
  }

  #onMove = ev => {
    const op = this.#op;
    if (!op) return;
    const srect = op.surface.getBoundingClientRect();
    const px = ev.clientX - srect.left, py = ev.clientY - srect.top;
    const els = this.#els();
    const el = els.find(e => e.id === op.id);
    if (!el) return;

    if (op.mode === "drag") {
      if (op.isLine) {
        const nx = px - op.grabX, ny = py - op.grabY;
        const ddx = nx - op.x0, ddy = ny - op.y0;
        el.x = nx; el.y = ny;
        el.x2 = op.startX2 + ddx; el.y2 = op.startY2 + ddy;
        this.#applyLine(op.node, el);
      } else {
        el.x = Math.max(0, px - op.grabX);
        el.y = Math.max(0, py - op.grabY);
        op.node.style.left = `${el.x}px`;
        op.node.style.top = `${el.y}px`;
      }
    } else if (op.mode === "resize") {
      el.w = Math.max(48, px - (el.x ?? 0));
      el.h = Math.max(28, py - (el.y ?? 0));
      op.node.style.width = `${el.w}px`;
      op.node.style.height = `${el.h}px`;
    } else if (op.mode === "lineend") {
      if (op.end === "b") { el.x2 = px; el.y2 = py; }
      else { el.x = px; el.y = py; }
      this.#applyLine(op.node, el);
    }
    op.moved = true;
  };

  #onUp = ev => {
    const op = this.#op;
    this.#op = null;
    if (!op) return;
    op.node.classList.remove("active");
    op.node.removeEventListener("pointermove", this.#onMove);
    if (!op.moved) return;
    const el = this.#els().find(e => e.id === op.id);
    if (!el) return;
    this.#updateBoard(b => {
      const t = b.elements.find(e => e.id === op.id);
      if (t) Object.assign(t, el);
    });
  };

  /** Recompute an SVG line element's geometry live during drag. */
  #applyLine(node, el) {
    const svg = node.querySelector("line");
    if (svg) {
      svg.setAttribute("x1", el.x); svg.setAttribute("y1", el.y);
      svg.setAttribute("x2", el.x2); svg.setAttribute("y2", el.y2);
    }
    const a = node.querySelector('.mh2-lineend[data-end="a"]');
    const b = node.querySelector('.mh2-lineend[data-end="b"]');
    if (a) { a.setAttribute("cx", el.x); a.setAttribute("cy", el.y); }
    if (b) { b.setAttribute("cx", el.x2); b.setAttribute("cy", el.y2); }
  }

  /* -------------------------------------------- */
  /*  Element editing                             */
  /* -------------------------------------------- */

  async #editElement(id) {
    const el = this.#els().find(e => e.id === id);
    if (!el) return;

    const colorOpts = COLORS.map(c =>
      `<option value="${c}"${c === el.color ? " selected" : ""}>${c}</option>`).join("");

    const labelField = el.kind === "line" ? "" : `
      <div class="form-group"><label>Label</label>
        <input type="text" name="label" value="${(el.label ?? "").replace(/"/g, "&quot;")}" autofocus></div>`;
    const sizeField = el.kind === "text" ? `
      <div class="form-group"><label>Text size</label>
        <select name="size">
          ${["sm","md","lg","xl"].map(s => `<option value="${s}"${(el.size ?? "md") === s ? " selected" : ""}>${s}</option>`).join("")}
        </select></div>` : "";

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: `Edit ${el.kind}` },
      position: { width: 360 },
      content: `<div class="mh2-skin-dialog">${labelField}${sizeField}
        <div class="form-group"><label>Colour</label><select name="color">${colorOpts}</select></div></div>`,
      buttons: [
        { action: "save", label: "Save", icon: "fa-solid fa-check", default: true,
          callback: (ev, btn) => ({
            label: btn.form.elements.label?.value.trim() ?? el.label,
            size: btn.form.elements.size?.value ?? el.size,
            color: btn.form.elements.color.value
          }) },
        { action: "delete", label: "Delete", icon: "fa-solid fa-trash" },
        { action: "cancel", label: "Cancel" }
      ],
      rejectClose: false
    });

    if (!result || result === "cancel") return;
    if (result === "delete") {
      return this.#updateBoard(b => { b.elements = b.elements.filter(e => e.id !== id); });
    }
    return this.#updateBoard(b => {
      const t = b.elements.find(e => e.id === id);
      if (!t) return;
      if (result.label !== undefined) t.label = result.label;
      if (result.size !== undefined) t.size = result.size;
      t.color = result.color;
    });
  }

  /* -------------------------------------------- */
  /*  Toolbar                                     */
  /* -------------------------------------------- */

  async #addElement(el) {
    return this.#updateBoard(b => {
      b.elements = b.elements ?? [];
      b.elements.push(el);
    });
  }

  static async #onAddBox() {
    const label = await foundry.applications.api.DialogV2.prompt({
      window: { title: "New box" },
      content: `<div class="form-group"><input type="text" name="label" placeholder="Schule, Rathaus, Seat 01…" autofocus></div>`,
      ok: { label: "Add", callback: (ev, b) => b.form.elements.label.value.trim() },
      rejectClose: false
    });
    if (label === null) return;
    return this.#addElement({
      id: foundry.utils.randomID(8), kind: "box", label: label || "",
      x: 60, y: 60, w: 150, h: 84, color: COLORS[Math.floor(Math.random() * 6)]
    });
  }

  static async #onAddText() {
    const label = await foundry.applications.api.DialogV2.prompt({
      window: { title: "New label" },
      content: `<div class="form-group"><input type="text" name="label" placeholder="Greenwater, Höhlen…" autofocus></div>`,
      ok: { label: "Add", callback: (ev, b) => b.form.elements.label.value.trim() },
      rejectClose: false
    });
    if (!label) return;
    return this.#addElement({
      id: foundry.utils.randomID(8), kind: "text", label,
      x: 90, y: 90, size: "md", color: "bone"
    });
  }

  static async #onAddLine() {
    return this.#addElement({
      id: foundry.utils.randomID(8), kind: "line",
      x: 80, y: 80, x2: 260, y2: 160, color: "sea"
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
    const board = { id: foundry.utils.randomID(8), name, bg: "paper", elements: [] };
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
      content: `<p>Delete <strong>${board.name}</strong> and everything on it?</p>`,
      rejectClose: false
    });
    if (!ok) return;
    const boards = MH2Pinboard.boards.filter(b => b.id !== board.id);
    this.#boardId = boards[0]?.id ?? null;
    await MH2Pinboard.save(boards);
    this.render();
  }

  static async #onToggleBg() {
    return this.#updateBoard(b => { b.bg = BGS[(BGS.indexOf(b.bg) + 1) % BGS.length]; });
  }
}
