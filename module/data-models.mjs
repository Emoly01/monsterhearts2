const { ArrayField, BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

function statField() {
  return new NumberField({ required: true, integer: true, initial: 0, min: -3, max: 4 });
}

function statLine() {
  return new SchemaField({
    hot: statField(),
    cold: statField(),
    volatile: statField(),
    dark: statField()
  });
}

/* -------------------------------------------- */
/*  Actor: character                            */
/* -------------------------------------------- */

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      skin: new StringField({ required: true, blank: true }),
      look: new StringField({ required: true, blank: true }),
      eyes: new StringField({ required: true, blank: true }),
      origin: new StringField({ required: true, blank: true }),

      stats: new SchemaField({
        hot: statField(),
        cold: statField(),
        volatile: statField(),
        dark: statField()
      }),

      harm: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        max: new NumberField({ required: true, integer: true, min: 1, initial: 4 })
      }),

      experience: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        max: new NumberField({ required: true, integer: true, min: 1, initial: 5 })
      }),

      /** Persistent bonus applied to every roll until cleared. */
      ongoing: new NumberField({ required: true, integer: true, initial: 0 }),

      /** Conditional one-shot bonuses: each fires only when you choose it. */
      forwards: new ArrayField(new SchemaField({
        label: new StringField({ required: true, blank: true }),
        value: new NumberField({ required: true, integer: true, initial: 1 })
      })),

      conditions: new ArrayField(new StringField({ required: true, blank: true })),

      /** Skin-specific tracker, e.g. the Ghoul's Hungers or the Fae's promises. */
      customLabel: new StringField({ required: true, blank: true }),
      custom: new ArrayField(new StringField({ required: true, blank: true })),

      strings: new ArrayField(new SchemaField({
        name: new StringField({ required: true, blank: true }),
        count: new NumberField({ required: true, integer: true, min: 0, initial: 1 })
      })),

      advancements: new StringField({ required: true, blank: true }),
      /** Indices of skin advancement lines already taken (each is once-only). */
      advancementsTaken: new ArrayField(new NumberField({ required: true, integer: true, min: 0 })),
      /** Whether the character is currently in their Darkest Self. */
      darkestSelfActive: new BooleanField({ initial: false }),

      darkestSelf: new HTMLField(),
      sexMove: new HTMLField(),
      backstory: new HTMLField(),
      notes: new HTMLField()
    };
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.harm.value = Math.clamp(this.harm.value, 0, this.harm.max);
    this.experience.value = Math.clamp(this.experience.value, 0, this.experience.max);
  }
}

/* -------------------------------------------- */
/*  Item: move                                  */
/* -------------------------------------------- */

export class MoveData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      /** One of: "", "hot", "cold", "volatile", "dark". Blank = no roll. */
      stat: new StringField({ required: true, blank: true, initial: "" }),
      /** "basic" or "skin". Controls which sheet section the move lives in. */
      category: new StringField({ required: true, blank: false, initial: "skin" }),
      /** Flat bonus this move adds to its own roll, e.g. +1. */
      bonus: new NumberField({ required: true, integer: true, initial: 0 }),
      /** Optional grouping label, e.g. "Hexes", "Bargains". */
      group: new StringField({ required: true, blank: true }),
      description: new HTMLField()
    };
  }
}

/* -------------------------------------------- */
/*  Item: skin (playbook)                       */
/* -------------------------------------------- */

export class SkinData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField(),

      /** Comma-separated suggestion lists shown when the skin is applied. */
      names: new StringField({ required: true, blank: true }),
      looks: new StringField({ required: true, blank: true }),
      eyes: new StringField({ required: true, blank: true }),
      origins: new StringField({ required: true, blank: true }),

      /** The two stat lines the player chooses between. */
      statlines: new SchemaField({
        a: statLine(),
        b: statLine()
      }),

      /** Name of the character's custom tracker this skin uses, e.g. "Hungers". */
      customLabel: new StringField({ required: true, blank: true }),

      /** How many non-automatic skin moves to pick at creation. */
      moveChoices: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      /** Free-text rule shown in the chooser, e.g. "You get Faery Contract, and choose one more". */
      moveNote: new StringField({ required: true, blank: true }),

      /** Snapshots of moves dropped onto this skin. */
      moves: new ArrayField(new SchemaField({
        name: new StringField({ required: true, blank: true }),
        img: new StringField({ required: true, blank: true }),
        stat: new StringField({ required: true, blank: true }),
        bonus: new NumberField({ required: true, integer: true, initial: 0 }),
        group: new StringField({ required: true, blank: true }),
        granted: new BooleanField({ initial: false }),
        description: new StringField({ required: true, blank: true })
      })),

      /** Advancement options offered when the experience track is full. */
      advancements: new ArrayField(new SchemaField({
        label: new StringField({ required: true, blank: true }),
        grantsMove: new BooleanField({ initial: false }),
        anySkin: new BooleanField({ initial: false })
      })),

      darkestSelf: new HTMLField(),
      sexMove: new HTMLField(),
      backstory: new HTMLField()
    };
  }
}
