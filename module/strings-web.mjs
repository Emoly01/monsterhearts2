const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A live map of every String. Nodes are built from the Strings themselves:
 * every character actor is a node, and every *name* a character holds a String
 * on becomes a node too (even if no actor exists for it). Arrows point from
 * holder to the one they hold.
 */
export class MH2StringsWeb extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "mh2-strings-web",
    classes: ["monsterhearts2", "mh2-strings-web"],
    position: { width: 760, height: 760 },
    window: { title: "Strings Web", icon: "fa-solid fa-diagram-project", resizable: true },
    actions: { refresh: MH2StringsWeb.#onRefresh }
  };

  static PARTS = {
    body: { template: "systems/monsterhearts2/templates/strings-web.hbs" }
  };

  static #onRefresh() { this.render(); }

  async _prepareContext(options) {
    const chars = game.actors.filter(a => a.type === "character");
    const keyOf = name => name.trim().toLowerCase();
    const nodeMap = new Map();

    const ensureNode = (name, { img = null, darkest = false, isActor = false } = {}) => {
      const key = keyOf(name);
      if (!key) return null;
      const existing = nodeMap.get(key);
      if (existing) {
        if (isActor && !existing.isActor) {
          existing.isActor = true; existing.img = img; existing.darkest = darkest; existing.label = name;
        }
        return existing;
      }
      const node = { key, label: name, img, darkest, isActor };
      nodeMap.set(key, node);
      return node;
    };

    for (const a of chars) {
      const node = ensureNode(a.name, { img: a.img, darkest: a.system.darkestSelfActive, isActor: true });
      if (node) node.conditions = (a.system.conditions ?? []).map(c => c.name.trim()).filter(Boolean).join(" · ");
    }
    for (const a of chars) {
      for (const s of (a.system.strings ?? [])) {
        if (!s.name || s.count < 1) continue;
        ensureNode(s.name);
      }
    }

    const nodes = [...nodeMap.values()];
    const n = nodes.length;
    const W = 720, H = 660, cx = W / 2, cy = H / 2;
    const R = Math.min(cx, cy) - 96;
    nodes.forEach((nd, i) => {
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      nd.x = cx + R * Math.cos(angle);
      nd.y = cy + R * Math.sin(angle);
      nd.id = `n${i}`;
    });
    const nodeByKey = new Map(nodes.map(nd => [nd.key, nd]));

    const edges = [];
    for (const a of chars) {
      const from = nodeByKey.get(keyOf(a.name));
      if (!from) continue;
      for (const s of (a.system.strings ?? [])) {
        if (!s.name || s.count < 1) continue;
        const to = nodeByKey.get(keyOf(s.name));
        if (!to || to.key === from.key) continue;
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
        const off = 26;
        const ctrlX = mx + (-dy / len) * off;
        const ctrlY = my + (dx / len) * off;
        const r = 34;
        const sx = from.x + (dx / len) * r, sy = from.y + (dy / len) * r;
        const ex = to.x - (dx / len) * r, ey = to.y - (dy / len) * r;
        edges.push({
          path: `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
          labelX: ctrlX.toFixed(1),
          labelY: ctrlY.toFixed(1),
          count: s.count,
          from: a.name,
          to: to.label
        });
      }
    }

    return { nodes, edges, hasNodes: nodes.length > 0, W, H };
  }
}
