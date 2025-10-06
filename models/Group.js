const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true },
  groupName: { type: String, default: "" },

  activeSpawn: {
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: "Card" },
    captcha: String,
  },

  activePokemonSpawn: {
    pokemonName: String,
    pokemonData: Object,
  },

  lastCharacter: {
    id: { type: String, default: "" },
    slug: { type: String, default: "" },
    name: { type: String, default: "" },
    romaji_name: { type: String, default: "" },
    display_picture: { type: String, default: "" },
    description: { type: String, default: "" },
    appearances: [{ name: { type: String } }],
    url: { type: String, default: "" },
  },

  status: { type: String, enum: ["enabled", "disabled"], default: "disabled" },
  spawn: { type: String, enum: ["enabled", "disabled"], default: "enabled" },
  pokespawn: { type: String, enum: ["enabled", "disabled"], default: "enabled" },
  slot: { type: String, enum: ["enabled", "disabled"], default: "disabled" },
});

module.exports = mongoose.model("Group", groupSchema);
