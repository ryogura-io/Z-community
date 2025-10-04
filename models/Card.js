const mongoose = require("mongoose");

const cardSchema = new mongoose.Schema({
  name: String,
  tier: String, 
  series: String,
  img: String,
  maker: String,
  url: String
});

module.exports = mongoose.model("Card", cardSchema, "cards");
