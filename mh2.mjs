import { MH2 } from "./module/config.mjs";
import { CharacterData, MoveData, SkinData } from "./module/data-models.mjs";
import { MH2Actor } from "./module/documents.mjs";
import { MH2ActorSheet } from "./module/actor-sheet.mjs";
import { MH2ItemSheet } from "./module/item-sheet.mjs";
import { MH2SkinSheet } from "./module/skin-sheet.mjs";
import { MH2NpcStrings } from "./module/npc-strings.mjs";
import { MH2StringsWeb } from "./module/strings-web.mjs";
import { MH2Pinboard } from "./module/pinboard.mjs";
import { escapeHTML, sameName } from "./module/utils.mjs";

Hooks.once("init", () => {
  console.log("Monsterhearts 2 | Keeping the story feral.");

  CONFIG.MH2 = MH2;

  // Documents & data models
  CONFIG.Actor.documentClass = MH2Actor;
  CONFIG.Actor.dataModels = { character: CharacterData };
  CONFIG.Item.dataModels = { move: MoveData, skin: SkinData };

  // Token resource bars
  CONFIG.Actor.trackableAttributes = {
    character: {
      bar: ["harm", "experience"],
      value: ["stats.hot", "stats.cold", "stats.volatile", "stats.dark", "forward"]
    }
  };

  // Sheets
  const ActorsCol = foundry.documents?.collections?.Actors ?? Actors;
  const ItemsCol = foundry.documents?.collections?.Items ?? Items;

  ActorsCol.registerSheet("monsterhearts2", MH2ActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "MH2 Character Sheet"
  });
  ItemsCol.registerSheet("monsterhearts2", MH2ItemSheet, {
    types: ["move"],
    makeDefault: true,
    label: "MH2 Move Sheet"
  });
  ItemsCol.registerSheet("monsterhearts2", MH2SkinSheet, {
    types: ["skin"],
    makeDefault: true,
    label: "MH2 Skin Sheet"
  });

  // Shared world settings: NPC-Strings tracker and pinboard maps.
  MH2NpcStrings.registerSetting();
  MH2Pinboard.registerSetting();
  game.system.mh2 = {
    openNpcStrings: () => new MH2NpcStrings().render(true),
    openStringsWeb: () => new MH2StringsWeb().render(true),
    openPinboard: () => new MH2Pinboard().render(true),
    darkestFlare: (name) => {
      const el = document.createElement("div");
      el.className = "mh2-flare";
      el.innerHTML = `<div class="mh2-flare-inner"><i class="fa-solid fa-moon"></i><span>${escapeHTML(name)}</span><em>Darkest Self</em></div>`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3200);
    }
  };

  // Per-player sheet theme (client-scoped: each user picks their own).
  game.settings.register("monsterhearts2", "theme", {
    name: "Sheet Theme",
    hint: "Choose the look of Monsterhearts sheets. This is per-user.",
    scope: "client",
    config: true,
    type: String,
    choices: { dark: "Dark (ink & thread)", light: "Light (bone & thread)", karibik: "Karibik (sand & sea)", trinidad: "Trinidad (Carnival warmth)", island: "Island (sea & hibiscus)" },
    default: "dark",
    onChange: value => applyMH2Theme(value)
  });

  // Optional hibiscus corner decorations (per-user).
  game.settings.register("monsterhearts2", "flowers", {
    name: "Corner Flowers",
    hint: "Show watercolor hibiscus blooms in the corners of character sheets.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: value => applyMH2Flowers(value)
  });
});

/** Reflect the flower toggle onto the document root. */
function applyMH2Flowers(on) {
  const v = on ?? game.settings.get("monsterhearts2", "flowers") ?? false;
  document.documentElement.toggleAttribute("data-mh2-flowers", !!v);
}

/** Reflect the chosen theme onto the document root for CSS to read. */
function applyMH2Theme(theme) {
  const t = theme ?? game.settings.get("monsterhearts2", "theme") ?? "dark";
  document.documentElement.setAttribute("data-mh2-theme", t);
}

Hooks.once("ready", () => { applyMH2Theme(); applyMH2Flowers(); });

/* Socket: apply a String grant on an actor the acting user can't write to.
   Executed by the first GM online. */
Hooks.once("ready", () => {
  const isFirstActiveGM = () =>
    game.user.isGM && game.users.find(u => u.isGM && u.active)?.id === game.user.id;

  game.socket.on("system.monsterhearts2", async (payload) => {
    if (!payload) return;

    // Everyone renders the Darkest Self flare.
    if (payload.type === "darkestFlare") {
      return game.system.mh2?.darkestFlare?.(payload.name);
    }

    // GM-executed writes below.
    if (!isFirstActiveGM()) return;

    if (payload.type === "grantString") {
      const actor = game.actors.get(payload.actorId);
      if (!actor) return;
      const strings = foundry.utils.deepClone(actor.system.toObject().strings ?? []);
      const match = strings.find(s => sameName(s.name, payload.name));
      if (match) match.count += payload.count ?? 1;
      else strings.push({ name: payload.name, count: payload.count ?? 1 });
      return actor.update({ "system.strings": strings });
    }

    if (payload.type === "grantNpcString") {
      const entries = foundry.utils.deepClone(game.settings.get("monsterhearts2", "npcStrings") ?? []);
      const match = entries.find(e => sameName(e.holder, payload.holder) && sameName(e.target, payload.target));
      if (match) match.count = (Number(match.count) || 0) + (payload.count ?? 1);
      else entries.push({ holder: payload.holder, target: payload.target, count: payload.count ?? 1 });
      return game.settings.set("monsterhearts2", "npcStrings", entries);
    }

    if (payload.type === "setBoards") {
      return game.settings.set("monsterhearts2", "boards", payload.boards ?? []);
    }
  });
});

/* Add a launch button to the Actors directory header for everyone. */
Hooks.on("renderActorDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const header = root.querySelector(".directory-header .header-actions")
    ?? root.querySelector(".directory-header");
  if (!header || header.querySelector(".mh2-npc-strings-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mh2-npc-strings-btn";
  btn.innerHTML = `<i class="fa-solid fa-link"></i> NPC Strings`;
  btn.addEventListener("click", () => new MH2NpcStrings().render(true));
  header.appendChild(btn);

  const webBtn = document.createElement("button");
  webBtn.type = "button";
  webBtn.className = "mh2-npc-strings-btn mh2-web-btn";
  webBtn.innerHTML = `<i class="fa-solid fa-diagram-project"></i> Strings Web`;
  webBtn.addEventListener("click", () => new MH2StringsWeb().render(true));
  header.appendChild(webBtn);

  const mapBtn = document.createElement("button");
  mapBtn.type = "button";
  mapBtn.className = "mh2-npc-strings-btn mh2-map-btn";
  mapBtn.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> Maps`;
  mapBtn.addEventListener("click", () => new MH2Pinboard().render(true));
  header.appendChild(mapBtn);

});
