const mongoose = require("mongoose");

const pokemonSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: {
    english: String,
    japanese: String,
    chinese: String,
    french: String
  },
  type: [String],
  base: {
    HP: Number,
    Attack: Number,
    Defense: Number,
    "Sp. Attack": Number,
    "Sp. Defense": Number,
    Speed: Number
  },
  species: String,
  description: String,
  evolution: {
    prev: [[String]],
    next: [[String]]
  },
  profile: {
    height: String,
    weight: String,
    egg: [String],
    ability: [[String]],
    gender: String
  },
  image: {
    sprite: String,
    thumbnail: String,
    hires: String
  }
});

module.exports = mongoose.model("Pokemon", pokemonSchema, "pokemons");
