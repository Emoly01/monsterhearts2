import { MH2 } from "./module/config.mjs";
import { CharacterData, MoveData, SkinData } from "./module/data-models.mjs";
import { MH2Actor } from "./module/documents.mjs";
import { MH2ActorSheet } from "./module/actor-sheet.mjs";
import { MH2ItemSheet } from "./module/item-sheet.mjs";
import { MH2SkinSheet } from "./module/skin-sheet.mjs";
import { MH2NpcStrings } from "./module/npc-strings.mjs";
import { MH2StringsWeb } from "./module/strings-web.mjs";
import { escapeHTML } from "./module/utils.mjs";
import { applyCondition, applyHarm, applyNpcString, applyString } from "./module/effects.mjs";
import { registerChatActions } from "./module/chat.mjs";

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
      value: ["stats.hot", "stats.cold", "stats.volatile", "stats.dark"]
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

  registerChatActions();

  // Shared world setting: the NPC-Strings tracker.
  MH2NpcStrings.registerSetting();
  MH2StringsWeb.registerLiveUpdates();
  game.system.mh2 = {
    openNpcStrings: () => new MH2NpcStrings().render(true),
    openStringsWeb: () => new MH2StringsWeb().render(true),
    darkestFlare: (name) => {
      const el = document.createElement("div");
      el.className = "mh2-flare";
      // The screen cracks from the corners; the name is stamped across the middle.
      el.innerHTML = `<div class="mh2-flare-cracks" aria-hidden="true"></div><div class="mh2-flare-inner"><span>${escapeHTML(name)}</span><em>Darkest Self</em></div>`;
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
    choices: {
      dark: "Dark — ink & thread",
      light: "Light — bone & thread",
      karibik: "Karibik — sand & sea",
      trinidad: "Trinidad — Carnival warmth",
      island: "Island — sea & sky",
      soucouyant: "Soucouyant — ash & ember",
      lagoon: "Bioluminescence — the lagoon at night",
      diablesse: "La Diablesse — muslin & black lace",
      burnbook: "Burn Book — gel pen & gossip",
      lateshow: "Late Show — VHS horror marathon",
      prom: "Prom Night — satin, silver & blood"
    },
    default: "dark",
    onChange: value => applyMH2Theme(value)
  });

  // Optional chaconia sprays behind character sheets (per-user, any theme).
  // The key stays "flowers" so existing choices carry over.
  game.settings.register("monsterhearts2", "flowers", {
    name: "Chaconia",
    hint: "Show sprays of chaconia — Trinidad & Tobago's national flower — behind character sheets. Works with every theme.",
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
      if (!actor || !payload.name) return;
      return applyString(actor, payload.name, payload.count ?? 1);
    }

    if (payload.type === "grantNpcString") {
      return applyNpcString(payload.holder, payload.target, payload.count ?? 1);
    }

    if (payload.type === "grantCondition") {
      const actor = game.actors.get(payload.actorId);
      if (!actor || !payload.name) return;
      return applyCondition(actor, payload.name, payload.from ?? "");
    }

    if (payload.type === "dealHarm") {
      const actor = game.actors.get(payload.actorId);
      if (!actor) return;
      return applyHarm(actor, Number(payload.amount) || 1);
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
});
