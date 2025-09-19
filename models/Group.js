const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  groupId: String,
  activeSpawn: {
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: "Card" },
    captcha: String
  }
});

module.exports = mongoose.model("Group", groupSchema);
