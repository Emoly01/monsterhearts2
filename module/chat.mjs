import { escapeHTML as esc } from "./utils.mjs";
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

/** Follow-ups offered on a roll that hit. */
export function rollActions(targetName) {
  const keys = targetName
    ? ["gainString", "giveString", "giveCondition", "takeCondition", "harm", "forward"]
    : ["forward"];
  return cardActions(keys, targetName);
}

async function askText(title, label, placeholder = "") {
  const value = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `
      <div class="form-group">
        <label>${esc(label)}</label>
        <input type="text" name="text" placeholder="${esc(placeholder)}" autofocus>
      </div>`,
    ok: { label: "Confirm", callback: (event, button) => button.form.elements.text.value.trim() },
    rejectClose: false
  }).catch(() => null);
  return value ?? null;
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
        const handler = HANDLERS[button.dataset.mh2Action];
        if (!handler) return;
        button.disabled = true;
        try {
          await handler(actor, card.targetName ?? "");
        } finally {
          button.disabled = false;
        }
      });
    }
  });
}
