const mongoose = require("mongoose");

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
  deck: [{ type: mongoose.Schema.Types.ObjectId, ref: "Card", default: null }], // primary cards (12 slots)
  secondaryDeck: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Card", default: null },
  ], // secondary deck (12 slots)
  secondaryDeckName: { type: String, default: "Deck 2" },
  collection: [{ type: mongoose.Schema.Types.ObjectId, ref: "Card" }], // all owned cards
  inventory: [{ type: String }], // items

  // Status & Settings
  isModerator: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  timeout: { type: Date, default: null }, // Timeout until this date
  isAfk: { type: Boolean, default: false },
  afkMessage: { type: String, default: "" },

  // Profile
  bio: { type: String, default: "" },
  character: { type: String, default: "" },

  // Daily & Bonus
  bonusClaimed: { type: Boolean, default: false },
  lastDaily: { type: Date, default: null },

  // streak tracking
  gameWins: { type: Number, default: 0 },
  gameStreak: { type: Number, default: 0 }, // consecutive wins
  lastGameResult: { type: String, default: "" }, // "win" | "loss"

  // Timeout
  timeout: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Player", playerSchema);
