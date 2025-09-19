const mongoose = require("mongoose");

const familiaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  head: { type: String, required: true }, // WhatsApp JID of head
  members: [{ type: String }], // list of member JIDs
  description: { type: String, default: "" },
  credits: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Familia", familiaSchema);
