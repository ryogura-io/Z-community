const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true },
  groupName: { type: String, default: "" },
  activeSpawn: {
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: "Card" }, // from Cards DB
    captcha: String
  },
  status: { type: String, enum: ["enabled", "disabled"], default: "disabled" },
  spawn: { type: String, enum: ["enabled", "disabled"], default: "enabled" }
});

groupSchema.methods.updateName = async function (sock) {
  try {
    const metadata = await sock.groupMetadata(this.groupId);
    this.groupName = metadata.subject;
    await this.save();
  } catch (err) {
    console.error("Failed to update group name:", err);
  }
};

module.exports = mongoose.model("Group", groupSchema);
