const Player = require("../models/Player");
const Group = require("../models/Group");
const Card = require("../models/Card");
const axios = require("axios");
const generateCaptcha = require("../utils/captcha");


const cardCommands = {
    register: {
        description: "Register a new profile in the card system",
        usage: "register",
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                let player = await Player.findOne({ userId: sender, groupId: chatId });
                if (player) {
                    return bot.sendMessage(chatId, "✅ You are already registered!");
                }

                player = new Player({ userId: sender, groupId: chatId });
                await player.save();

                bot.sendMessage(chatId, "🎉 Registration complete! You now have a card profile.");
            } catch (err) {
                console.error(err);
                bot.sendMessage(chatId, "❌ Error registering profile.");
            }
        }
    },

    shards: {
        description: "Check your shards balance",
        usage: "balance",
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
        }
    },

    collection: {
        description: "Show your cards collection",
        usage: "mycards",
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {

    }},

    spawn: {
        description: "Spawn a random card immediately",
        usage: "spawn",
        adminOnly: false,
        execute: async ({ chatId, bot }) => {
            
    },

    claim: {
        description: "Claim the currently spawned card in the group using captcha",
        usage: "claim <captcha>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            
        }
    },
}
}

module.exports = cardCommands;
