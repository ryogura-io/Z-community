const mongoose = require("mongoose");

const configSchema = new mongoose.Schema({

  // Owners & Moderators
  owners: [{ type: String }],      // WhatsApp JIDs
  moderators: [{ type: String }],  // WhatsApp JIDs

  // Disabled commands functionality
  disabledCommands: [{ type: String }], // Array of disabled command names

  // Other global settings if needed later
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

configSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Config", configSchema);
