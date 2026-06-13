import { MH2 } from "./module/config.mjs";
import { CharacterData, MoveData, SkinData } from "./module/data-models.mjs";
import { MH2Actor } from "./module/documents.mjs";
import { MH2ActorSheet } from "./module/actor-sheet.mjs";
import { MH2ItemSheet } from "./module/item-sheet.mjs";
import { MH2SkinSheet } from "./module/skin-sheet.mjs";
import { MH2NpcStrings } from "./module/npc-strings.mjs";

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

  // MC's open NPC-Strings tracker (shared world setting).
  MH2NpcStrings.registerSetting();
  game.system.mh2 = { openNpcStrings: () => new MH2NpcStrings().render(true) };
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
});
