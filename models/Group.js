const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true },
  groupName: { type: String, default: "" },
  activeSpawn: {
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: "Card" }, // from Cards DB
    captcha: String
  },
  status: { type: String, enum: ["enabled", "disabled"], default: "disabled" },
  spawn: { type: String, enum: ["enabled", "disabled"], default: "enabled" },
  slot: { type: String, enum: ["enabled", "disabled"], default: "disabled" }
});

module.exports = mongoose.model("Group", groupSchema);

