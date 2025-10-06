const mongoose = require("mongoose");

const pokemonInstanceSchema = new mongoose.Schema({
  pokemonId: { type: Number, required: true },
  name: { type: String, required: true },
  displayName: { type: String, required: true },
  level: { type: Number, default: 1, min: 1, max: 100 },
  exp: { type: Number, default: 0 },
  types: [{ type: String }],
  hires: { type: String, required: true },
  sprite: { type: String },
  species: { type: String },
  baseStats: {
    hp: { type: Number },
    attack: { type: Number },
    defense: { type: Number },
    spAttack: { type: Number },
    spDefense: { type: Number },
    speed: { type: Number }
  },
  evolutionData: {
    prev: [[String]],
    next: [[String]]
  },
  capturedAt: { type: Date, default: Date.now }
}, { _id: true });

const pokePlayerSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  
  party: [pokemonInstanceSchema],
  
  pokedex: [pokemonInstanceSchema],
  
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PokePlayer", pokePlayerSchema);
