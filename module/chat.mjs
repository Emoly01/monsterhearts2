import { MH2 } from "./config.mjs";
import { escapeHTML as esc, sameName } from "./utils.mjs";
import { dealHarm, findCharacter, gainString, giveCondition, giveString, takeForward } from "./effects.mjs";

/**
 * Clickable follow-ups on chat cards. A card opts in by carrying
 *   flags.monsterhearts2.card = { actorId, targetName }
 * and a `.mh2-card-actions` row of `[data-mh2-action]` buttons. Only owners of
 * the card's actor (and the GM) see the buttons.
 */

const BUTTONS = {
  gainString: { icon: "fa-link", label: "Gain a String", tip: t => `You gain a String on ${t}` },
  giveString: { icon: "fa-hand-holding-heart", label: "Give a String", tip: t => `${t} gains a String on you` },
  giveCondition: { icon: "fa-tag", label: "Give Condition", tip: t => `Put a Condition on ${t}` },
  takeCondition: { icon: "fa-user-tag", label: "Take Condition", tip: t => `${t} puts a Condition on you` },
  harm: { icon: "fa-droplet", label: "Deal harm", tip: t => `${t} takes 1 harm` },
  forward: { icon: "fa-forward", label: "Take 1 Forward", tip: () => "Record a Forward on your sheet" },
  skirtDeath: { icon: "fa-skull", label: "Skirt Death", tip: () => "Erase all harm and choose the price" }
};

/** Build the button row for a card. `actions` is a list of BUTTONS keys. */
export function cardActions(actions, targetName = "") {
  const buttons = actions.map(key => {
    const b = BUTTONS[key];
    if (!b) return "";
    return `<button type="button" data-mh2-action="${key}" title="${esc(b.tip(targetName || "them"))}"><i class="fa-solid ${b.icon}"></i> ${b.label}</button>`;
  }).join("");
  return buttons ? `<div class="mh2-card-actions">${buttons}</div>` : "";
}

/** Buttons that act on someone else, and so need a name. */
const NEEDS_TARGET = new Set(["gainString", "giveString", "giveCondition", "takeCondition", "harm"]);

/**
 * The button keys a move puts on its card. A move set to "custom" gets exactly
 * what was ticked on its sheet; otherwise each button shows up when one of
 * `texts` (the move's own text, and the basic move it counts as) mentions it.
 * @param {{actionsMode?: string, actions?: object}} move
 * @param {string[]} texts  HTML or plain text to read in auto mode.
 */
export function moveActionKeys(move, texts = []) {
  if (move?.actionsMode === "custom") {
    return MH2.moveActions.filter(a => move.actions?.[a.key]).map(a => a.key);
  }
  const text = texts.filter(Boolean).join(" ").replace(/<[^>]*>/g, " ");
  return MH2.moveActions.filter(a => a.match.test(text)).map(a => a.key);
}

async function askText(title, label, placeholder = "", { options = [], value = "" } = {}) {
  const list = options.length
    ? `<datalist id="mh2-ask-list">${options.map(o => `<option value="${esc(o)}"></option>`).join("")}</datalist>`
    : "";
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `
      <div class="form-group">
        <label>${esc(label)}</label>
        <input type="text" name="text" value="${esc(value)}" placeholder="${esc(placeholder)}"${list ? ' list="mh2-ask-list"' : ""} autofocus>
        ${list}
      </div>`,
    ok: { label: "Confirm", callback: (event, button) => button.form.elements.text.value.trim() },
    rejectClose: false
  }).catch(() => null);
  return answer ?? null;
}

/** Last name picked on each card, so the next button on it starts there. */
const lastTarget = new Map();

/** Ask who a button is about, for a card that was posted against no one. */
async function askTarget(actor, messageId, title) {
  const names = [];
  const add = name => {
    const clean = String(name ?? "").trim();
    if (!clean || sameName(clean, actor.name) || names.some(n => sameName(n, clean))) return;
    names.push(clean);
  };
  for (const a of game.actors) if (a.type === "character") add(a.name);
  for (const s of actor.system.strings ?? []) add(s.name);
  for (const e of (game.settings.get("monsterhearts2", "npcStrings") ?? [])) {
    add(e.holder);
    add(e.target);
  }
  const name = await askText(title, "Who?", "their name", {
    options: names.sort((a, b) => a.localeCompare(b)),
    value: lastTarget.get(messageId) ?? ""
  });
  if (!name) return null;
  lastTarget.set(messageId, name);
  return name;
}

function post(actor, title, body, { actions = "", card = null } = {}) {
  const data = {
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `
      <div class="mh2-roll-card mh2-string-card">
        <header class="mh2-card-header"><h3>${esc(title)}</h3></header>
        <p>${body}</p>
        ${actions}
      </div>`
  };
  if (card) data.flags = { monsterhearts2: { card } };
  return ChatMessage.implementation.create(data);
}

const HANDLERS = {
  async gainString(actor, targetName) {
    if (!await gainString(actor, targetName, 1)) return;
    return post(actor, "String Gained",
      `<strong>${esc(actor.name)}</strong> gains a String on <strong>${esc(targetName)}</strong>.`);
  },

  async giveString(actor, targetName) {
    if (!await giveString(targetName, actor.name, 1)) return;
    return post(actor, "String Given",
      `<strong>${esc(targetName)}</strong> gains a String on <strong>${esc(actor.name)}</strong>.`);
  },

  async giveCondition(actor, targetName) {
    const name = await askText(`Condition on ${targetName}`, "Condition", "drained, terrified…");
    if (!name) return;
    const target = findCharacter(targetName);
    if (target && !await giveCondition(target, name, actor.name)) return;
    return post(actor, "Condition",
      `<strong>${esc(targetName)}</strong> gains the Condition <strong>${esc(name)}</strong> from ${esc(actor.name)}.`);
  },

  async takeCondition(actor, targetName) {
    const name = await askText(`Condition on ${actor.name}`, "Condition", "drained, terrified…");
    if (!name) return;
    if (!await giveCondition(actor, name, targetName)) return;
    return post(actor, "Condition",
      `<strong>${esc(actor.name)}</strong> gains the Condition <strong>${esc(name)}</strong> from ${esc(targetName)}.`);
  },

  async harm(actor, targetName) {
    const target = findCharacter(targetName);
    if (!target) {
      return post(actor, "Harm", `<strong>${esc(targetName)}</strong> takes 1 harm.`);
    }
    const { value, max } = target.system.harm;
    if (value >= max) {
      return ui.notifications.warn(`${target.name} is already at ${max} harm.`);
    }
    if (!await dealHarm(target, 1)) return;
    const now = value + 1;
    const dying = now >= max;
    return post(actor, "Harm",
      `<strong>${esc(target.name)}</strong> takes 1 harm (${now}/${max}).${dying ? " They're staring death down." : ""}`,
      dying ? { actions: cardActions(["skirtDeath"]), card: { actorId: target.id, targetName: "" } } : {});
  },

  async forward(actor, targetName) {
    const label = await askText("Take 1 Forward", "Forward to…", "acting on what the abyss showed you");
    if (label === null) return;
    await takeForward(actor, label, 1);
    return post(actor, "Forward",
      `<strong>${esc(actor.name)}</strong> takes 1 Forward${label ? ` to ${esc(label)}` : ""}.`);
  },

  async skirtDeath(actor) {
    return actor.skirtDeath();
  }
};

/** Wire the buttons each time a chat message renders. */
export function registerChatActions() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const row = html.querySelectorAll?.(".mh2-card-actions");
    if (!row?.length) return;
    const card = message.getFlag("monsterhearts2", "card");
    const actor = card ? game.actors.get(card.actorId) : null;
    if (!actor?.isOwner) {
      row.forEach(r => r.remove());
      return;
    }
    for (const button of html.querySelectorAll("[data-mh2-action]")) {
      button.addEventListener("click", async ev => {
        ev.preventDefault();
        const key = button.dataset.mh2Action;
        const handler = HANDLERS[key];
        if (!handler) return;
        button.disabled = true;
        try {
          let targetName = card.targetName ?? "";
          if (!targetName && NEEDS_TARGET.has(key)) {
            targetName = await askTarget(actor, message.id, BUTTONS[key]?.label ?? "Who?");
            if (!targetName) return;
          }
          await handler(actor, targetName);
        } finally {
          button.disabled = false;
        }
      });
    }
  });
}
