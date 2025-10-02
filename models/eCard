const mongoose = require("mongoose");

const cardSchema = new mongoose.Schema({
  name: String,
  tier: String, 
  series: String,
  img: String,
  maker: String,
  url: String, 
  event: String,
  isEvent: Boolean
});

module.exports = mongoose.model("eCard", cardSchema, "eventCard");
