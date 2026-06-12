const { ArrayField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

function statField() {
  return new NumberField({ required: true, integer: true, initial: 0, min: -3, max: 4 });
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

      /** One-shot bonus consumed by the next roll. */
      forward: new NumberField({ required: true, integer: true, initial: 0 }),
      /** Persistent bonus applied to every roll until cleared. */
      ongoing: new NumberField({ required: true, integer: true, initial: 0 }),

      conditions: new ArrayField(new StringField({ required: true, blank: true })),

      strings: new ArrayField(new SchemaField({
        name: new StringField({ required: true, blank: true }),
        count: new NumberField({ required: true, integer: true, min: 0, initial: 1 })
      })),

      advancements: new StringField({ required: true, blank: true }),

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
      description: new HTMLField()
    };
  }
}
