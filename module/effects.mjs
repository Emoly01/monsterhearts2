import { sameName } from "./utils.mjs";

/**
 * Shared mechanical effects — Strings, Conditions, harm, Forward — that can be
 * triggered from anywhere (sheet, roll dialog, chat-card buttons).
 *
 * Each `apply*` function performs the write and must run on a client that may
 * edit the document. Each public wrapper picks the route: write directly when
 * the current user owns the document, otherwise ask the first active GM to do
 * it over the system socket. Wrappers resolve to `true` when the effect was
 * applied or dispatched, `false` when nobody could apply it.
 */

export const SOCKET = "system.monsterhearts2";

const gmOnline = () => !!game.users.find(u => u.isGM && u.active);

/** The character actor with this name (case-insensitive), if any. */
export function findCharacter(name) {
  const clean = String(name ?? "").trim();
  if (!clean) return null;
  return game.actors.find(a => a.type === "character" && sameName(a.name, clean)) ?? null;
}

/* -------------------------------------------- */
/*  Direct writes (owner or GM only)            */
/* -------------------------------------------- */

export async function applyString(actor, name, count = 1) {
  const strings = foundry.utils.deepClone(actor.system.toObject().strings ?? []);
  const match = strings.find(s => sameName(s.name, name));
  if (match) match.count = Math.max(0, match.count + count);
  else if (count > 0) strings.push({ name, count });
  else return actor;
  return actor.update({ "system.strings": strings });
}

export async function applyNpcString(holder, target, count = 1) {
  const entries = foundry.utils.deepClone(game.settings.get("monsterhearts2", "npcStrings") ?? []);
  const match = entries.find(e => sameName(e.holder, holder) && sameName(e.target, target));
  if (match) match.count = Math.max(0, (Number(match.count) || 0) + count);
  else if (count > 0) entries.push({ holder, target, count });
  else return entries;
  return game.settings.set("monsterhearts2", "npcStrings", entries);
}

export async function applyCondition(actor, name, from = "") {
  const conditions = foundry.utils.deepClone(actor.system.toObject().conditions ?? []);
  conditions.push({ name, from });
  return actor.update({ "system.conditions": conditions });
}

export async function applyHarm(actor, amount = 1) {
  const { value, max } = actor.system.harm;
  return actor.update({ "system.harm.value": Math.clamp(value + amount, 0, max) });
}

/* -------------------------------------------- */
/*  Routed effects                              */
/* -------------------------------------------- */

function route(canWrite, direct, payload, failMessage) {
  if (canWrite) return direct().then(() => true);
  if (gmOnline()) {
    game.socket.emit(SOCKET, payload);
    return Promise.resolve(true);
  }
  ui.notifications.warn(failMessage);
  return Promise.resolve(false);
}

/** `actor` gains `count` Strings on `name`. */
export function gainString(actor, name, count = 1) {
  const clean = String(name ?? "").trim();
  if (!clean) return Promise.resolve(false);
  return route(actor.isOwner,
    () => applyString(actor, clean, count),
    { type: "grantString", actorId: actor.id, name: clean, count },
    `No GM online to update ${actor.name}'s Strings.`);
}

/**
 * `holderName` gains `count` Strings on `targetName` (negative: loses them). A holder with a sheet
 * gets a row on it; anyone else is recorded in the shared NPC tracker.
 */
export function giveString(holderName, targetName, count = 1) {
  const holder = String(holderName ?? "").trim();
  const target = String(targetName ?? "").trim();
  if (!holder || !target) return Promise.resolve(false);
  const actor = findCharacter(holder);
  if (actor) return gainString(actor, target, count);
  return route(game.user.isGM,
    () => applyNpcString(holder, target, count),
    { type: "grantNpcString", holder, target, count },
    `No GM online to record ${holder}'s String in the tracker.`);
}

/** How many Strings `holderName` holds on `targetName`, sheet or tracker. */
export function stringsHeld(holderName, targetName) {
  const actor = findCharacter(holderName);
  if (actor) {
    return (actor.system.strings ?? []).find(s => sameName(s.name, targetName))?.count ?? 0;
  }
  const entry = (game.settings.get("monsterhearts2", "npcStrings") ?? [])
    .find(e => sameName(e.holder, holderName) && sameName(e.target, targetName));
  return Number(entry?.count) || 0;
}

/** Put a Condition on `actor`, remembering who it came from. */
export function giveCondition(actor, name, from = "") {
  const clean = String(name ?? "").trim();
  if (!clean) return Promise.resolve(false);
  return route(actor.isOwner,
    () => applyCondition(actor, clean, from),
    { type: "grantCondition", actorId: actor.id, name: clean, from },
    `No GM online to put that Condition on ${actor.name}.`);
}

/** Deal `amount` harm to `actor`. */
export function dealHarm(actor, amount = 1) {
  return route(actor.isOwner,
    () => applyHarm(actor, amount),
    { type: "dealHarm", actorId: actor.id, amount },
    `No GM online to mark harm on ${actor.name}.`);
}

/** Record a conditional Forward on `actor` (owner only). */
export async function takeForward(actor, label = "", value = 1) {
  const forwards = foundry.utils.deepClone(actor.system.toObject().forwards ?? []);
  forwards.push({ label, value });
  await actor.update({ "system.forwards": forwards });
  return true;
}
