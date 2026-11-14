const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const keyOf = name => String(name ?? "").trim().toLowerCase();

/**
 * A live map of every String at the table — the ones on character sheets and
 * the ones in the NPC tracker. Characters sit on an inner ring, everyone
 * without a sheet on an outer ring next to the people they're tangled with.
 * Arrows point from holder to the one they hold; thicker means more Strings.
 *
 * Hover (or click, to pin) a person to light up only their Strings and read
 * them as a plain list in the side panel.
 */
export class MH2StringsWeb extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "mh2-strings-web",
    classes: ["monsterhearts2", "mh2-strings-web"],
    position: { width: 980, height: 760 },
    window: { title: "Strings Web", icon: "fa-solid fa-diagram-project", resizable: true },
    actions: { openSheet: MH2StringsWeb.#onOpenSheet }
  };

  static PARTS = {
    body: { template: "systems/monsterhearts2/templates/strings-web.hbs" }
  };

  /** Re-render every open web whenever anything it draws from changes. */
  static registerLiveUpdates() {
    const refresh = foundry.utils.debounce(() => {
      for (const app of foundry.applications.instances.values()) {
        if (app instanceof MH2StringsWeb) app.render();
      }
    }, 150);
    for (const hook of ["createActor", "updateActor", "deleteActor", "mh2.npcStringsChanged"]) {
      Hooks.on(hook, refresh);
    }
  }

  /** Node id the user clicked to keep in focus, kept across re-renders. */
  #pinned = null;

  static #onOpenSheet(event, target) {
    game.actors.get(target.dataset.actorId)?.sheet.render(true);
  }

  /* -------------------------------------------- */
  /*  Data                                        */
  /* -------------------------------------------- */

  /** Everyone involved and every String between them, sheets and tracker alike. */
  static collect() {
    const chars = game.actors.filter(a => a.type === "character")
      .sort((a, b) => a.name.localeCompare(b.name));
    const nodeMap = new Map();
    const ensure = name => {
      const key = keyOf(name);
      if (!key) return null;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, { key, label: String(name).trim(), isActor: false, holds: [], heldBy: [] });
      }
      return nodeMap.get(key);
    };

    for (const a of chars) {
      const node = ensure(a.name);
      if (!node || node.isActor) continue;
      Object.assign(node, {
        isActor: true, label: a.name, actorId: a.id, img: a.img,
        darkest: a.system.darkestSelfActive,
        conditions: (a.system.conditions ?? []).map(c => c.name.trim()).filter(Boolean).join(" · ")
      });
    }

    // Sum Strings per holder → target pair, whatever their source.
    const pairs = new Map();
    const addString = (holderName, targetName, count) => {
      const n = Number(count) || 0;
      if (n < 1) return;
      const from = ensure(holderName), to = ensure(targetName);
      if (!from || !to || from === to) return;
      const id = `${from.key}\u0000${to.key}`;
      if (pairs.has(id)) pairs.get(id).count += n;
      else pairs.set(id, { from, to, count: n });
    };
    for (const a of chars) {
      for (const s of (a.system.strings ?? [])) addString(a.name, s.name, s.count);
    }
    for (const e of (game.settings.get("monsterhearts2", "npcStrings") ?? [])) {
      addString(e.holder, e.target, e.count);
    }

    const edges = [...pairs.values()];
    for (const e of edges) {
      e.from.holds.push({ name: e.to.label, count: e.count });
      e.to.heldBy.push({ name: e.from.label, count: e.count });
    }
    const nodes = [...nodeMap.values()];
    nodes.forEach((n, i) => {
      n.id = `n${i}`;
      const byCount = (a, b) => b.count - a.count || a.name.localeCompare(b.name);
      n.holds.sort(byCount);
      n.heldBy.sort(byCount);
      n.holdsTotal = n.holds.reduce((t, x) => t + x.count, 0);
      n.heldTotal = n.heldBy.reduce((t, x) => t + x.count, 0);
    });
    return { nodes, edges };
  }

  /** Place characters on an inner ring and everyone else around them. */
  static layout(nodes, edges) {
    const pcs = nodes.filter(n => n.isActor);
    const others = nodes.filter(n => !n.isActor);
    // With no sheets at all, the names themselves form the single ring.
    const inner = pcs.length ? pcs : others;
    const outer = pcs.length ? others : [];

    const r1 = inner.length <= 1 ? 0 : Math.max(130, inner.length * 34);
    const r2 = outer.length ? Math.max(r1 + 170, outer.length * 24) : 0;
    const half = Math.max(r1, r2) + 110;
    const place = (list, radius, offset = 0) => list.forEach((n, i) => {
      n.angle = (i / Math.max(list.length, 1)) * Math.PI * 2 - Math.PI / 2 + offset;
      n.x = half + radius * Math.cos(n.angle);
      n.y = half + radius * Math.sin(n.angle);
    });
    place(inner, r1);

    // Seat each outsider on the side of the ring their Strings pull toward.
    for (const n of outer) {
      let vx = 0, vy = 0;
      for (const e of edges) {
        const other = e.from === n ? e.to : e.to === n ? e.from : null;
        if (!other || other.angle === undefined || !other.isActor) continue;
        vx += Math.cos(other.angle) * e.count;
        vy += Math.sin(other.angle) * e.count;
      }
      n.pull = (vx || vy) ? Math.atan2(vy, vx) : Math.PI;
    }
    outer.sort((a, b) => a.pull - b.pull || a.label.localeCompare(b.label));
    place(outer, r2, outer.length ? Math.PI / outer.length : 0);

    for (const n of nodes) n.r = n.isActor ? 30 : 18;
    return { size: half * 2 };
  }

  /** @override */
  async _prepareContext(options) {
    const { nodes, edges } = MH2StringsWeb.collect();
    const { size } = MH2StringsWeb.layout(nodes, edges);
    const f = v => v.toFixed(1);

    const drawn = edges.map(e => {
      const { from, to } = e;
      const dx = to.x - from.x, dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      // Bow each curve to its own left, so A→B and B→A never overlap.
      const bow = Math.min(34, len * 0.18);
      const cx = (from.x + to.x) / 2 - uy * bow, cy = (from.y + to.y) / 2 + ux * bow;
      const sx = from.x + ux * (from.r + 3), sy = from.y + uy * (from.r + 3);
      const ex = to.x - ux * (to.r + 7), ey = to.y - uy * (to.r + 7);
      // Count badge sits a third of the way along, close to its holder.
      const t = 0.34, u = 1 - t;
      return {
        from: from.id, to: to.id, count: e.count,
        fromLabel: from.label, toLabel: to.label,
        path: `M ${f(sx)} ${f(sy)} Q ${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`,
        width: f(1.4 + Math.min(e.count, 6) * 0.8),
        bx: f(u * u * sx + 2 * u * t * cx + t * t * ex),
        by: f(u * u * sy + 2 * u * t * cy + t * t * ey)
      };
    });

    const people = nodes.map(n => ({
      ...n,
      x: f(n.x), y: f(n.y),
      labelDy: n.r + 16,
      condDy: n.r + 31,
      imgSize: (n.r - 2) * 2,
      pinned: n.id === this.#pinned,
      tangled: n.holdsTotal + n.heldTotal > 0
    }));
    if (!people.some(p => p.pinned)) this.#pinned = null;

    const roster = [...people].sort((a, b) =>
      (b.holdsTotal + b.heldTotal) - (a.holdsTotal + a.heldTotal) || a.label.localeCompare(b.label));

    return { nodes: people, edges: drawn, roster, size, hasNodes: people.length > 0, hasEdges: drawn.length > 0 };
  }

  /* -------------------------------------------- */
  /*  Focus                                       */
  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element.querySelector(".mh2-web-window");
    if (!root) return;

    const show = id => {
      root.classList.toggle("focused", !!id);
      const near = new Set([id]);
      for (const edge of root.querySelectorAll(".mh2-web-edge")) {
        const out = edge.dataset.from === id, into = edge.dataset.to === id;
        edge.classList.toggle("out", out);
        edge.classList.toggle("in", into);
        if (out) near.add(edge.dataset.to);
        if (into) near.add(edge.dataset.from);
      }
      for (const el of root.querySelectorAll("[data-node]")) {
        el.classList.toggle("lit", near.has(el.dataset.node));
        el.classList.toggle("focus", el.dataset.node === id);
      }
      for (const panel of root.querySelectorAll("[data-panel]")) {
        panel.hidden = panel.dataset.panel !== (id ?? "");
      }
    };

    for (const el of root.querySelectorAll("[data-node]")) {
      const id = el.dataset.node;
      el.addEventListener("pointerenter", () => show(id));
      el.addEventListener("pointerleave", () => show(this.#pinned));
      el.addEventListener("click", ev => {
        ev.stopPropagation();
        this.#pinned = (this.#pinned === id) ? null : id;
        for (const n of root.querySelectorAll("[data-node]")) {
          n.classList.toggle("pinned", n.dataset.node === this.#pinned);
        }
        show(this.#pinned);
      });
    }
    // Clicking empty space lets go of the pin.
    root.querySelector(".mh2-web-svg")?.addEventListener("click", () => {
      this.#pinned = null;
      for (const n of root.querySelectorAll("[data-node]")) n.classList.remove("pinned");
      show(null);
    });

    show(this.#pinned);
  }
}
