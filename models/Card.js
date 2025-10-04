const mongoose = require("mongoose");

// Base card schema shared by both normal and event cards
const baseCardSchema = new mongoose.Schema(
  {
    name: String,
    tier: String,
    series: String,
    img: String,
    maker: String,
    url: String,
  },
  { discriminatorKey: "kind", collection: "cards" }
);

// Base model
const Card = mongoose.model("Card", baseCardSchema);

// eCard discriminator — inherits all fields from Card + adds event properties
const eCardSchema = new mongoose.Schema({
  event: String,
  isEvent: { type: Boolean, default: true },
});

// Store event cards in a separate collection
const eCard = Card.discriminator("eCard", eCardSchema, "eventCards");

// Export both separately
module.exports = Card;
module.exports.eCard = eCard;
