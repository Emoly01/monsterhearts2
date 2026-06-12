import { MH2 } from "./module/config.mjs";
import { CharacterData, MoveData, SkinData } from "./module/data-models.mjs";
import { MH2Actor } from "./module/documents.mjs";
import { MH2ActorSheet } from "./module/actor-sheet.mjs";
import { MH2ItemSheet } from "./module/item-sheet.mjs";
import { MH2SkinSheet } from "./module/skin-sheet.mjs";

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
});
