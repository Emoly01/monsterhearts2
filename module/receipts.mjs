import { MH2 } from "./config.mjs";
import { escapeHTML as esc, sameName } from "./utils.mjs";
import { askText, cardActions, receiptLine } from "./chat.mjs";
import { applyNpcString, applyString, findCharacter, giveCondition, takeForward } from "./effects.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const DEFAULT_IMG = "icons/svg/mystery-man.svg";

/**
 * The character a typed name means: their full name, or just their first name
 * when only one character has it ("Marcus" finds "Marcus Joseph").
 */
function characterFor(name) {
  const exact = findCharacter(name);
  if (exact) return exact;
  const first = String(name ?? "").trim().toLowerCase();
  if (!first || /\s/.test(first)) return null;
  const hits = game.actors.filter(a => a.type === "character"
    && a.name.trim().split(/\s+/)[0].toLowerCase() === first);
  return hits.length === 1 ? hits[0] : null;
}

/** One key per person, so "marcus", "Marcus" and "Marcus Joseph" are the same row. */
const keyOf = name => {
  const actor = characterFor(name);
  return (actor ? actor.name : String(name ?? "")).trim().toLowerCase();
};

/** The four ways to pull a String, as chips on every receipt you're keeping. */
const SPENDS = [
  { key: "tempt", label: "Tempt them", rule: MH2.pullingStrings[0] },
  { key: "condition", label: "Give a Condition", rule: MH2.pullingStrings[1] },
  { key: "roll", label: "+1 to your roll", rule: MH2.pullingStrings[2] },
  { key: "harm", label: "+1 harm", rule: MH2.pullingStrings[3] }
];

/**
 * Receipts: every String at the table, read like a messaging app. Pick a person
 * on the left; the thread shows the receipts others hold on them, then the ones
 * they're keeping, each with its note and the four ways to spend it.
 */
export class MH2Receipts extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "mh2-receipts",
    classes: ["monsterhearts2", "mh2-receipts"],
    position: { width: 1000, height: 720 },
    window: { title: "Receipts", icon: "fa-solid fa-receipt", resizable: true },
    actions: {
      focus: MH2Receipts.#onFocus,
      openSheet: MH2Receipts.#onOpenSheet,
      spend: MH2Receipts.#onSpend,
      editNote: MH2Receipts.#onEditNote
    }
  };

  static PARTS = {
    body: {
      template: "systems/monsterhearts2/templates/receipts.hbs",
      scrollable: [".mh2-rc-people", ".mh2-rc-scroll"]
    }
  };

  /** Re-render every open Receipts window whenever anything it reads changes. */
  static registerLiveUpdates() {
    const refresh = foundry.utils.debounce(() => {
      for (const app of foundry.applications.instances.values()) {
        if (app instanceof MH2Receipts) app.render();
      }
    }, 150);
    for (const hook of ["createActor", "updateActor", "deleteActor", "mh2.npcStringsChanged"]) {
      Hooks.on(hook, refresh);
    }
  }

  /** Key of the person whose thread is open, kept across re-renders. */
  #focus = null;

  /* -------------------------------------------- */
  /*  Data                                        */
  /* -------------------------------------------- */

  /** Everyone involved and every String between them, sheets and tracker alike. */
  static collect() {
    const people = new Map();
    const ensure = name => {
      const key = keyOf(name);
      if (!key) return null;
      if (!people.has(key)) {
        // A sheet-less name may still have an actor of another type for its picture.
        const other = game.actors.find(a => sameName(a.name, name));
        const img = other?.img && other.img !== DEFAULT_IMG ? other.img : "";
        people.set(key, {
          key, name: String(name).trim(), short: String(name).trim(), isPC: false, img,
          sub: "no sheet", skin: "", darkest: false, conditions: "", holds: 0, held: 0
        });
      }
      return people.get(key);
    };

    const chars = game.actors.filter(a => a.type === "character")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const a of chars) {
      const p = ensure(a.name);
      if (!p) continue;
      const skin = a.system.skin ?? "";
      const darkest = !!a.system.darkestSelfActive;
      Object.assign(p, {
        isPC: true, actorId: a.id, name: a.name,
        short: a.name.split(/\s+/)[0] || a.name,
        img: a.img && a.img !== DEFAULT_IMG ? a.img : "",
        skin, darkest,
        sub: [skin || "character", darkest ? "Darkest Self" : ""].filter(Boolean).join(" · "),
        conditions: (a.system.conditions ?? [])
          .filter(c => c.name?.trim())
          .map(c => c.from?.trim() ? `${c.name.trim()}, says ${c.from.trim()}` : c.name.trim())
          .join(" · ")
      });
    }

    const strings = [];
    for (const a of chars) {
      (a.system.strings ?? []).forEach((s, index) => {
        const target = ensure(s.name);
        if (!target || !(s.count > 0)) return;
        strings.push({ holder: keyOf(a.name), target: target.key, count: s.count, note: s.note ?? "",
          kind: "sheet", actorId: a.id, index, targetName: s.name });
      });
    }
    (game.settings.get("monsterhearts2", "npcStrings") ?? []).forEach((e, index) => {
      const holder = ensure(e.holder);
      const target = ensure(e.target);
      const count = Number(e.count) || 0;
      if (!holder || !target || count < 1) return;
      strings.push({ holder: holder.key, target: target.key, count, note: e.note ?? "",
        kind: "npc", index, targetName: e.target, holderName: e.holder });
    });

    for (const s of strings) {
      people.get(s.holder).holds += s.count;
      people.get(s.target).held += s.count;
    }

    // Characters first, then everyone else; alphabetical inside each group.
    const list = [...people.values()].sort((a, b) =>
      (b.isPC - a.isPC) || a.name.localeCompare(b.name));
    for (const p of list) {
      p.initials = p.name.replace(/^(ms|mr|mrs|miss|coach|dr)\.?\s+/i, "")
        .split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    }
    return { people: list, byKey: people, strings };
  }

  /** May the current user write to the holder's side of this String? */
  static canEdit(s) {
    if (s.kind === "sheet") return !!game.actors.get(s.actorId)?.isOwner;
    return game.user.isGM;
  }

  /** @override */
  async _prepareContext(options) {
    const { people, byKey, strings } = MH2Receipts.collect();

    if (!this.#focus || !byKey.has(this.#focus)) {
      const own = game.user.character;
      this.#focus = (own && byKey.has(keyOf(own.name))) ? keyOf(own.name) : (people[0]?.key ?? null);
    }
    const me = byKey.get(this.#focus) ?? null;
    const label = n => (n === 1 ? "1 String" : `${n} Strings`);

    const bubble = (s, other) => ({
      ...other, otherKey: other.key, note: s.note.trim(), count: label(s.count),
      kind: s.kind, actorId: s.actorId ?? "", index: s.index, targetName: s.targetName,
      canEdit: MH2Receipts.canEdit(s)
    });
    const incoming = me ? strings.filter(s => s.target === me.key)
      .sort((a, b) => b.count - a.count)
      .map(s => bubble(s, byKey.get(s.holder))) : [];
    const outgoing = me ? strings.filter(s => s.holder === me.key)
      .sort((a, b) => b.count - a.count)
      .map(s => ({ ...bubble(s, byKey.get(s.target)), spends: SPENDS })) : [];

    const meSub = me
      ? (me.isPC
        ? [me.skin, me.conditions].filter(Boolean).join(" · ")
        : "no sheet · lives in the NPC tracker")
      : "";

    return {
      people: people.map(p => ({ ...p, selected: p.key === this.#focus })),
      me, meSub, incoming, outgoing,
      empty: people.length === 0
    };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onFocus(event, target) {
    this.#focus = target.dataset.key;
    this.render();
  }

  static #onOpenSheet(event, target) {
    game.actors.get(target.dataset.actorId)?.sheet.render(true);
  }

  /** The live String a button points at, re-read so a stale render can't misfire. */
  static #resolve(ds) {
    const index = Number(ds.index);
    if (ds.kind === "sheet") {
      const actor = game.actors.get(ds.actorId);
      const entry = actor?.system.toObject().strings?.[index];
      if (!actor || !entry || !sameName(entry.name, ds.targetName)) return null;
      return { kind: "sheet", actor, index, entry, holderName: actor.name, targetName: entry.name };
    }
    const entries = foundry.utils.deepClone(game.settings.get("monsterhearts2", "npcStrings") ?? []);
    const entry = entries[index];
    if (!entry || !sameName(entry.target, ds.targetName)) return null;
    return { kind: "npc", entries, index, entry, holderName: entry.holder, targetName: entry.target };
  }

  static async #onEditNote(event, target) {
    const s = MH2Receipts.#resolve(target.dataset);
    if (!s) return ui.notifications.warn("That String changed. Try again.");
    const note = await askText(`Receipt · ${s.holderName} on ${s.targetName}`,
      `What does ${s.holderName} have on ${s.targetName}?`,
      "the text, the rumour, the thing they saw…", { value: s.entry.note ?? "" });
    if (note === null) return;
    if (s.kind === "sheet") {
      const strings = s.actor.system.toObject().strings;
      strings[s.index].note = note;
      return s.actor.update({ "system.strings": strings });
    }
    s.entries[s.index].note = note;
    return game.settings.set("monsterhearts2", "npcStrings", s.entries);
  }

  static async #onSpend(event, target) {
    const opt = SPENDS.find(o => o.key === target.dataset.opt);
    const s = MH2Receipts.#resolve(target.dataset);
    if (!opt || !s) return ui.notifications.warn("That String changed. Try again.");
    const count = Number(s.entry.count) || 0;
    if (count < 1) return ui.notifications.warn(`No Strings left on ${s.targetName}.`);

    const holderActor = s.kind === "sheet" ? s.actor : characterFor(s.holderName);
    const targetActor = characterFor(s.targetName);

    // Ask first, so backing out costs nothing.
    let detail = "";
    let condition = "";
    if (opt.key === "tempt") {
      const want = await askText(`Tempt ${s.targetName}`, "Tempt them to…", "what you want them to do (optional)");
      if (want === null) return;
      detail = want ? `Tempts them to <strong>${esc(want)}</strong>.` : "Tempts them.";
      detail += targetActor
        ? ` If ${esc(s.targetName)} does it, they mark experience.`
        : " The MC decides how they answer.";
    } else if (opt.key === "condition") {
      condition = await askText(`Condition on ${s.targetName}`, "Condition", "drained, terrified…");
      if (!condition) return;
      detail = `Gives them the Condition <strong>${esc(condition)}</strong>.`;
    } else if (opt.key === "roll") {
      detail = holderActor
        ? `+1 on their next roll against ${esc(s.targetName)}. It's waiting in their Forward.`
        : `+1 on their next roll against ${esc(s.targetName)}.`;
    } else if (opt.key === "harm") {
      detail = `Adds 1 to the harm they deal ${esc(s.targetName)}.`;
    }

    // Spend it.
    if (s.kind === "sheet") await applyString(s.actor, s.targetName, -1);
    else await applyNpcString(s.holderName, s.targetName, -1);

    // Then make it happen.
    if (opt.key === "condition" && targetActor) await giveCondition(targetActor, condition, s.holderName);
    if (opt.key === "roll" && holderActor?.isOwner) {
      await takeForward(holderActor, `against ${s.targetName} (String)`, 1);
    }

    const buttons = opt.key === "harm" && holderActor ? cardActions(["harm"], s.targetName) : "";
    const data = {
      speaker: holderActor
        ? ChatMessage.implementation.getSpeaker({ actor: holderActor })
        : { alias: s.holderName },
      content: `
        <div class="mh2-roll-card mh2-string-card">
          <header class="mh2-card-header"><h3>Pulling Strings</h3></header>
          <p><strong>${esc(s.holderName)}</strong> spends a String on <strong>${esc(s.targetName)}</strong> (${count - 1} left).</p>
          ${receiptLine(s.entry.note)}
          <p>${detail}</p>
          ${buttons}
        </div>`
    };
    if (buttons) data.flags = { monsterhearts2: { card: { actorId: holderActor.id, targetName: s.targetName } } };
    return ChatMessage.implementation.create(data);
  }
}
