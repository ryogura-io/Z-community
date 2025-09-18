const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // WhatsApp JID
  username: { type: String },
  level: level/*userlevel*/ ,
  exp: exp/*userexp*/ ,
  familiaCredits: credits/*user familiacredits*/ ,
  // Economy
  shards: { type: Number, default: 0 },
  crystals: { type: Number, default: 0 },

  // Deck & Collection
  deck: [{ type: mongoose.Schema.Types.ObjectId, ref: "Card" }], // primary cards
  deck2: [{ type: mongoose.Schema.Types.ObjectId, ref: "Card" }], // secondary deck
  collection: [{ type: mongoose.Schema.Types.ObjectId, ref: "Card" }], // all owned cards

  moderator: true/false,
  banned: true/false,


  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Player", playerSchema);
