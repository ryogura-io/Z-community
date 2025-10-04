const Player = require("../models/Player");
const Group = require("../models/Group");
const Config = require("../models/Config");
const config = require("../config");
const { eCard: eCardModel } = require("../models/Card");
const Card = require("../models/Card");
const { sendCard, createCardGrid } = require("../utils/deckHelper");
const {
  addItemToInventory,
  removeItemFromInventory,
} = require("../utils/inventoryHelper");

const eventCommands = {
  addecard: {
    description: "Add an event card to the eDeck using its URL",
    usage: "addecard <url>",
    aliases: ["addeck"],
    adminOnly: true,
    execute: async ({ chatId, sock, message, args }) => {
      if (!args[0])
        return sock.sendMessage(
          chatId,
          { text: "❌ Usage: !addecard <url>" },
          { quoted: message },
        );

      try {
        const url = args[0];
        const eCard = await eCardModel.findOne({ url });

        if (!eCard)
          return sock.sendMessage(
            chatId,
            { text: "❌ Event card not found!" },
            { quoted: message },
          );

        let config = await Config.findOne({});
        if (!config) config = new Config();

        if (config.eDeck.includes(eCard._id)) {
          return sock.sendMessage(
            chatId,
            { text: "❌ This card is already in the eDeck!" },
            { quoted: message },
          );
        }

        config.eDeck.push(eCard._id);
        await config.save();

        return sock.sendMessage(
          chatId,
          { text: `✅ Added *${eCard.name}* to the eDeck!` },
          { quoted: message },
        );
      } catch (err) {
        console.error(err);
        return sock.sendMessage(
          chatId,
          { text: "❌ Error adding event card to eDeck." },
          { quoted: message },
        );
      }
    },
  },

  edeck: {
    description: "Show the eDeck of event cards",
    usage: "edeck [index]",
    aliases: ["eventdeck"],
    adminOnly: false,
    execute: async ({ chatId, sock, message, args }) => {
      try {
        const Config = require("../models/Config");
        const config = await Config.findOne({}).populate("eDeck");

        if (!config || !config.eDeck || config.eDeck.length === 0) {
          return sock.sendMessage(
            chatId,
            { text: "📭 The eDeck is empty!" },
            { quoted: message },
          );
        }

        const deck = config.eDeck;
        const deckHelper = require("../utils/deckHelper");

        // Single card view
        if (args[0] && !isNaN(args[0])) {
          const idx = parseInt(args[0]) - 1;
          if (!deck[idx]) {
            return sock.sendMessage(
              chatId,
              { text: "❌ No card at that position!" },
              { quoted: message },
            );
          }

          const card = deck[idx];
          const caption =
            `┌──「 *EVENT CARD DETAILS* 」\n\n` +
            `📜 *Name:* ${card.name}\n` +
            `🎭 *Series:* ${card.series}\n` +
            `🎀 *Event:* ${card.event}\n` +
            `⭐ *Tier:* ${card.tier}\n` +
            `👨‍🎨 *Maker:* ${card.maker}`;

          return deckHelper.sendCard(sock, chatId, message, card, caption);
        }

        // Grid view
        const imgBuffer = await deckHelper.createCardGrid(deck.filter(Boolean));

        const readMore = String.fromCharCode(8206).repeat(4001);
        let deckMsg = `🃏 *Event Deck*\n\n${readMore}`;

        deck.forEach((card, i) => {
          if (card) {
            deckMsg += `🎴 *${i + 1}.* ${card.name}\n     Series: ${card.series}\n     Tier: ${card.tier}\n\n`;
          }
        });

        deckMsg += `\n💡 Use \`!edeck <number>\` to see individual cards`;

        return sock.sendMessage(
          chatId,
          { image: imgBuffer, caption: deckMsg },
          { quoted: message },
        );
      } catch (error) {
        console.error("eDeck error:", error);
        return sock.sendMessage(
          chatId,
          { text: "❌ Error displaying eDeck." },
          { quoted: message },
        );
      }
    },
  },

  setseries: {
    description: "Set a new series for a card in the eDeck",
    usage: "setseries <edeck_index> <new_series_name>",
    adminOnly: true,
    execute: async ({ chatId, sock, message, args }) => {
      const Config = require("../models/Config");
      const eCard = require("../models/eCard");
      try {
        // Check args
        if (args.length < 2) {
          return sock.sendMessage(
            chatId,
            {
              text: "❌ Usage: !setseries <edeck_index> <new_series_name>",
            },
            { quoted: message },
          );
        }

        const index = parseInt(args[0]) - 1;
        const newSeries = args.slice(1).join(" ").trim();

        if (isNaN(index) || index < 0) {
          return sock.sendMessage(
            chatId,
            {
              text: "⚠️ Please provide a valid eDeck index number.",
            },
            { quoted: message },
          );
        }

        // Get config and populate eDeck
        const config = await Config.findOne({}).populate("eDeck");
        if (!config || !config.eDeck || !config.eDeck[index]) {
          return sock.sendMessage(
            chatId,
            {
              text: "❌ No card found at that index in the eDeck.",
            },
            { quoted: message },
          );
        }

        const card = config.eDeck[index];

        // Update the card in the eventCards DB
        await eCard.findByIdAndUpdate(
          card._id,
          { $set: { series: newSeries } },
          { new: true },
        );

        await sock.sendMessage(
          chatId,
          {
            text: `✅ Updated *${card.name}*'s series to *${newSeries}*!`,
          },
          { quoted: message },
        );
      } catch (err) {
        console.error("setseries error:", err);
        await sock.sendMessage(
          chatId,
          { text: "❌ Failed to update card series." },
          { quoted: message },
        );
      }
    },
  },

  epull: {
    description:
      "Use an Event Slip for a chance to pull rewards or event cards",
    usage: "!epull",
    aliases: ["eventpull", "eslip"],
    async execute({ sender, chatId, sock, message }) {
      try {
        const player = await Player.findOne({ userId: sender });
        if (!player) {
          return sock.sendMessage(
            chatId,
            { text: "❌ You need to register first using !register <name>." },
            { quoted: message },
          );
        }

        // ✅ Check if player has event slip
        const slipItem = player.inventory.find((i) => i.item === "event slip");
        if (!slipItem || slipItem.quantity < 1) {
          return sock.sendMessage(
            chatId,
            { text: "❌ You don’t have any Event Slips!" },
            { quoted: message },
          );
        }

        // Consume one slip
        await removeItemFromInventory(sender, "event slip", 1);

        // 🎲 Roll chance
        const roll = Math.random() * 100; // 0-99.9999
        let resultText = "";
        let rewardGiven = false;

        // 🎴 1% chance — Event Card
        if (roll < 1) {
          const config = await Config.findOne();
          if (!config || !config.eDeck || config.eDeck.length === 0) {
            resultText =
              "🎟️ You used an Event Slip, but no Event Cards are currently available!";
          } else {
            // Pick a random event card from config.eDeck
            const randomIndex = Math.floor(Math.random() * config.eDeck.length);
            const eventCardId = config.eDeck[randomIndex];

            // Fetch event card from eCard collection
            const card = await eCard.findById(eventCardId);
            if (!card) {
              resultText = "⚠️ Error: Event card not found!";
            } else {
              // Add card to player's collection
              player.collection.push(card._id);
              // Remove from eDeck
              config.eDeck.splice(randomIndex, 1);
              await config.save();

              resultText = `🌟 You pulled an *Event Card!* 🎴\n**${card.name}** (Tier ${card.tier})`;
            }
          }
          rewardGiven = true;
        }

        // 💎 3% — 30 Crystals
        else if (roll < 4) {
          player.crystals += 30;
          resultText = "💎 You received **30 Crystals!**";
          rewardGiven = true;
        }

        // 🔮 3% — Random Tier 5 card
        else if (roll < 100) {
          const t5Cards = await Card.find({ tier: "5" });
          if (t5Cards.length > 0) {
            const randomCard =
              t5Cards[Math.floor(Math.random() * t5Cards.length)];
            player.collection.push(randomCard._id);
            resultText = `✨ You pulled a *Tier 5 Card!* 🎴\n*${randomCard.name}* (${randomCard.tier})`;
          } else {
            resultText = "⚠️ No Tier 5 cards found in the database!";
          }
          rewardGiven = true;
        }

        // 💰 50% — 500 Shards
        else if (roll < 57) {
          player.shards += 500;
          resultText = "💰 You received *500 Shards!*";
          rewardGiven = true;
        }

        // 💰 25% — 1000 Shards
        else if (roll < 82) {
          player.shards += 1000;
          resultText = "💰 You received *1000 Shards!*";
          rewardGiven = true;
        }

        // 💰 18% — 2000 Shards
        else {
          player.shards += 2000;
          resultText = "💰 You received *2000 Shards!*";
          rewardGiven = true;
        }

        if (rewardGiven) await player.save();

        await sock.sendMessage(
          chatId,
          { text: `🎟️ *Event Pull Results:*\n\n${resultText}` },
          { quoted: message },
        );
      } catch (error) {
        console.error("Event Pull Error:", error);
        await sock.sendMessage(
          chatId,
          { text: "❌ There was an error processing your event pull." },
          { quoted: message },
        );
      }
    },
  },
};
module.exports = eventCommands;
