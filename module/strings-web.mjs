const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

/**
 * A read-only map of every String between character actors: nodes are
 * characters, arrows are Strings (labelled with the count). Recomputed each
 * time it renders.
 */
export class MH2StringsWeb extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "mh2-strings-web",
    classes: ["monsterhearts2", "mh2-strings-web"],
    position: { width: 720, height: 720 },
    window: { title: "Strings Web", icon: "fa-solid fa-diagram-project", resizable: true },
    actions: {
      refresh: MH2StringsWeb.#onRefresh
    }
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/monsterhearts2/templates/strings-web.hbs" }
  };

  static #onRefresh() {
    this.render();
  }

  /** @override */
  async _prepareContext(options) {
    const chars = game.actors.filter(a => a.type === "character");

    // Match a String's free-text "name" to an actor, if possible.
    const byName = new Map();
    for (const a of chars) byName.set(a.name.trim().toLowerCase(), a);

    // Build node list.
    const n = chars.length;
    const W = 700, H = 640, cx = W / 2, cy = H / 2;
    const R = Math.min(cx, cy) - 90;
    const nodes = chars.map((a, i) => {
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        id: a.id,
        name: a.name,
        img: a.img,
        darkest: a.system.darkestSelfActive,
        x: cx + R * Math.cos(angle),
        y: cy + R * Math.sin(angle)
      };
    });
    const nodeById = new Map(nodes.map(nd => [nd.id, nd]));

    // Build edges from each character's Strings that resolve to another node.
    const edges = [];
    const unresolved = [];
    for (const a of chars) {
      const from = nodeById.get(a.id);
      for (const s of (a.system.strings ?? [])) {
        if (!s.name || s.count < 1) continue;
        const target = byName.get(s.name.trim().toLowerCase());
        if (target && target.id !== a.id) {
          const to = nodeById.get(target.id);
          // Curve control point offset perpendicular to the line so opposing
          // arrows don't overlap.
          const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const off = 26;
          const ctrlX = mx + (-dy / len) * off;
          const ctrlY = my + (dx / len) * off;
          // Shorten endpoints so arrows sit at the node edge (r≈30).
          const r = 34;
          const sx = from.x + (dx / len) * r, sy = from.y + (dy / len) * r;
          const ex = to.x - (dx / len) * r, ey = to.y - (dy / len) * r;
          edges.push({
            path: `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
            labelX: ctrlX.toFixed(1),
            labelY: ctrlY.toFixed(1),
            count: s.count,
            from: a.name,
            to: target.name
          });
        } else {
          unresolved.push({ from: a.name, on: s.name, count: s.count });
        }
      }
    }

    return { nodes, edges, unresolved, hasNodes: nodes.length > 0, W, H };
  }
}
