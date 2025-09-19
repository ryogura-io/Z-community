const mongoose = require("mongoose");

const cardSchema = new mongoose.Schema({
  name: String,
  tier: String,     // "Tier 1" - "Tier 6", "Tier S"
  series: String,
  img: String,
  maker: String,
  url: String
});

module.exports = mongoose.model("Card", cardSchema, "cards");
