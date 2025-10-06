const mongoose = require("mongoose");
const PokePlayer = require("./PokePlayer"); // Import your pokemon player model

const playerSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // WhatsApp JID
  name: { type: String, required: true },
  level: { type: Number, default: 1 },
  exp: { type: Number, default: 0 },
  familiaCredits: { type: Number, default: 0 },
  familiaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Familia",
    default: null,
  },

  // Economy
  shards: { type: Number, default: 0 },
  crystals: { type: Number, default: 50 },
  vault: { type: Number, default: 0 },

  // Deck & Collection
  deck: [{ type: mongoose.Schema.Types.ObjectId, ref: "Card", default: null }],
  secondaryDeck: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Card", default: null },
  ],
  secondaryDeckName: { type: String, default: "Deck 2" },
  collection: [{ type: mongoose.Schema.Types.ObjectId, ref: "Card" }],
  inventory: [
    {
      item: { type: String, required: true },
      quantity: { type: Number, default: 0 },
    },
  ],

  // Status & Settings
  isModerator: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  timeout: { type: Date, default: null },
  isAfk: { type: Boolean, default: false },
  afkMessage: { type: String, default: "" },

  // Profile
  bio: { type: String, default: "" },
  characterID: { type: Number, default: 0 },
  characterName: { type: String, default: "" },
  profilePic: { type: String, default: "" },

  // Daily & Bonus
  bonusClaimed: { type: Boolean, default: false },
  lastDaily: { type: Date, default: null },
  lastWeekly: { type: Date, default: null },

  // Streak tracking
  gameWins: { type: Number, default: 0 },
  gameStreak: { type: Number, default: 0 },
  lastGameResult: { type: String, default: "" },

  createdAt: { type: Date, default: Date.now },
});

// 🧮 Virtual property for Pokémon count
playerSchema.virtual("pokeCount").get(async function () {
  const pokePlayer = await PokePlayer.findOne({ userId: this.userId });
  if (!pokePlayer) return 0;
  return pokePlayer.pokedex?.length || 0;
});

// ✅ Add a helper function for explicit use
playerSchema.methods.getPokeCount = async function () {
  const pokePlayer = await PokePlayer.findOne({ userId: this.userId });
  if (!pokePlayer) return 0;
  return pokePlayer.pokedex?.length || 0;
};

module.exports = mongoose.model("Player", playerSchema);
