const mongoose = require("mongoose");

const cardSchema = new mongoose.Schema({
  name: String,
  tier: String, 
  series: String,
  img: String,
  maker: String,
  url: String, 
  event: { type: String, default: null },
  isEvent: { type: Boolean, default: false },
});

module.exports = mongoose.model("Card", cardSchema, "cards");

