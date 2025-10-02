const Player = require("../models/Player");
const mongoose = require("mongoose");

const economyCommands = {
    economy: {
        description: "View the total amount of money across all users",
        usage: "economy",
        aliases: ["econ"],
        adminOnly: false,
        execute: async ({ chatId, sock, message }) => {
            try {
                const totalShards = await Player.aggregate([
                    { $group: { _id: null, total: { $sum: "$shards" } } },
                ]);
                const totalCrystals = await Player.aggregate([
                    { $group: { _id: null, total: { $sum: "$crystals" } } },
                ]);

                const shardsTotal = totalShards[0]?.total || 0;
                const crystalsTotal = totalCrystals[0]?.total || 0;

                const msg =
                    `💎 *ZEN ECONOMY OVERVIEW*\n\n` +
                    `💰 Total Shards: *${shardsTotal.toLocaleString()}*\n` +
                    `💎 Total Crystals: *${crystalsTotal.toLocaleString()}*\n` +
                    `👥 Active Players: *${await Player.countDocuments()}*`;

                await sock.sendMessage(
                    chatId,
                    { text: msg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Economy error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching economy data." },
                    { quoted: message },
                );
            }
        },
    },

    bonus: {
        description: "Claim your welcome bonus (one-time only)",
        usage: "bonus",
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please register first using !register <name>",
                        },
                        { quoted: message },
                    );
                }

                if (player.bonusClaimed) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "❌ You have already claimed your welcome bonus!",
                        },
                        { quoted: message },
                    );
                }

                const bonusAmount = 30000;
                player.shards += bonusAmount;
                player.bonusClaimed = true;
                await player.save();

                await sock.sendMessage(
                    chatId,
                    {
                        text: `🎉 Welcome bonus claimed! +${bonusAmount} shards!`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Bonus error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error claiming bonus." },
                    { quoted: message },
                );
            }
        },
    },

    buy: {
        description: "Buy an item from the shop",
        usage: "buy <shop_number>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0] || isNaN(args[0])) {
                return sock.sendMessage(
                    chatId,
                    {
                        text: "❌ Usage: !buy <number>\n\n💡 Use !shop to see available items!",
                    },
                    { quoted: message },
                );
            }

            const itemNumber = parseInt(args[0]);
            const player = await Player.findOne({ userId: sender });

            if (!player) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Please register first using !register <name>" },
                    { quoted: message },
                );
            }

            if (itemNumber === 1) {
                // Buy 5000 shards for 50 crystals
                if (player.crystals < 50) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: `❌ Not enough crystals! You need 50 💎, but you have ${player.crystals} 💎`,
                        },
                        { quoted: message },
                    );
                }

                player.crystals -= 50;
                player.shards += 5000;
                await player.save();

                await sock.sendMessage(
                    chatId,
                    {
                        text: `✅ *Purchase Successful!*\n\n🛒 Item: 5000 Shards\n💎 Cost: 50 crystals\n💰 New Balance: ${player.shards} shards, ${player.crystals} crystals`,
                    },
                    { quoted: message },
                );
            } else if (itemNumber === 2) {
                // Buy common card pack
                if (player.crystals < 20) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: `❌ Not enough crystals! You need 20 💎, but you have ${player.crystals} 💎`,
                        },
                        { quoted: message },
                    );
                }

                try {
                    const Card = require("../models/Card");
                    const tier4Cards = await Card.find({ tier: "4" });

                    if (tier4Cards.length === 0) {
                        return sock.sendMessage(
                            chatId,
                            {
                                text: "❌ No tier 4 cards available in the database!",
                            },
                            { quoted: message },
                        );
                    }

                    const randomCard =
                        tier4Cards[
                            Math.floor(Math.random() * tier4Cards.length)
                        ];

                    player.crystals -= 20;
                    player.shards += 1000;
                    player.collection.push(randomCard._id);
                    await player.save();

                    const cardDetails =
                        `🎴 *Name:* ${randomCard.name}\n` +
                        `🏷️ *Series:* ${randomCard.series}\n` +
                        `⭐ *Tier:* ${randomCard.tier}\n` +
                        `👨‍🎨 *Maker:* ${randomCard.maker}`;

                    const successMsg =
                        `✅ *Common Card Pack Opened!*\n\n` +
                        `🎁 *You have gotten a tier 4 card!*\n\n` +
                        `${cardDetails}\n\n` +
                        `💰 Bonus: +1000 shards\n` +
                        `💎 New Balance: ${player.shards} shards, ${player.crystals} crystals`;

                    if (randomCard.img) {
                        const axios = require("axios");
                        try {
                            const response = await axios.get(randomCard.img, {
                                responseType: "arraybuffer",
                            });
                            const imageBuffer = Buffer.from(response.data);

                            await sock.sendMessage(
                                chatId,
                                {
                                    image: imageBuffer,
                                    caption: successMsg,
                                },
                                { quoted: message },
                            );
                        } catch (imgError) {
                            console.error(
                                "Error loading card image:",
                                imgError,
                            );
                            await sock.sendMessage(
                                chatId,
                                { text: successMsg },
                                { quoted: message },
                            );
                        }
                    } else {
                        await sock.sendMessage(
                            chatId,
                            { text: successMsg },
                            { quoted: message },
                        );
                    }
                } catch (error) {
                    console.error("Buy command error:", error);
                    await sock.sendMessage(
                        chatId,
                        { text: "❌ Error processing card pack purchase!" },
                        { quoted: message },
                    );
                }
            } else {
                await sock.sendMessage(
                    chatId,
                    {
                        text: "❌ Invalid item number! Use !shop to see available items.",
                    },
                    { quoted: message },
                );
            }
        },
    },

    daily: {
        description: "Claim your daily shards (24h cooldown)",
        usage: "daily",
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please register first using !register <name>",
                        },
                        { quoted: message },
                    );
                }

                const now = new Date();
                const lastDaily = player.lastDaily || new Date(0);
                const timeDiff = now - lastDaily;
                const oneDayMs = 24 * 60 * 60 * 1000;

                if (timeDiff < oneDayMs) {
                    const timeLeft = oneDayMs - timeDiff;
                    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                    const minutesLeft = Math.floor(
                        (timeLeft % (60 * 60 * 1000)) / (60 * 1000),
                    );

                    return sock.sendMessage(
                        chatId,
                        {
                            text: `⏰ Daily already claimed! Try again in ${hoursLeft}h ${minutesLeft}m`,
                        },
                        { quoted: message },
                    );
                }

                const dailyAmount = 200;
                player.shards += dailyAmount;
                player.lastDaily = now;
                await player.save();

                await sock.sendMessage(
                    chatId,
                    { text: `💰 Daily claimed! +${dailyAmount} shards!` },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Daily error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error claiming daily reward." },
                    { quoted: message },
                );
            }
        },
    },

    weekly: {
    description: "Claim your weekly reward (7-day cooldown) with a chance for shards",
    usage: "weekly",
    adminOnly: false,
    execute: async ({ sender, chatId, sock, message }) => {
        try {
            const player = await Player.findOne({ userId: sender });
            if (!player) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Please register first using !register <name>" },
                    { quoted: message }
                );
            }

            const now = new Date();
            const lastWeekly = player.lastWeekly || new Date(0);
            const timeDiff = now - lastWeekly;
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

            if (timeDiff < sevenDaysMs) {
                const timeLeft = sevenDaysMs - timeDiff;
                const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
                const hoursLeft = Math.floor(
                    (timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
                );

                return sock.sendMessage(
                    chatId,
                    {
                        text: `⏰ Weekly reward already claimed! Try again in ${daysLeft}d ${hoursLeft}h`,
                    },
                    { quoted: message }
                );
            }

            // Add 1 common pack to inventory
            const { addItemToInventory } = require("../utils/inventoryHelper");
            await addItemToInventory(sender, "common pack", 1);

            // 20% chance to add 2000 shards
            let shardBonus = 0;
            if (Math.random() < 0.2) {
                shardBonus = 2000;
                player.shards += shardBonus;
            }

            player.lastWeekly = now;
            await player.save();

            let reply = `📦 Weekly reward claimed! You received:\n- 1 Common Pack`;
            if (shardBonus > 0) reply += `\n💰 Lucky bonus! +${shardBonus} shards!`;

            await sock.sendMessage(chatId, { text: reply }, { quoted: message });
        } catch (error) {
            console.error("Weekly error:", error);
            await sock.sendMessage(
                chatId,
                { text: "❌ Error claiming weekly reward." },
                { quoted: message }
            );
        }
    }
},


    deposit: {
        description: "Transfer money to your vault",
        usage: "deposit <amount>",
        aliases: ["depo"],
        adminOnly: false,
        execute: async ({ sender, chatId, message, args, sock }) => {
            if (!args[0] || isNaN(args[0])) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !deposit <amount>" },
                    { quoted: message },
                );
            }

            try {
                const amount = parseInt(args[0]);
                const player = await Player.findOne({ userId: sender });

                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please register first using !register <name>",
                        },
                        { quoted: message },
                    );
                }

                if (player.shards < amount) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Insufficient shards!" },
                        { quoted: message },
                    );
                }

                player.shards -= amount;
                player.vault += amount;
                await player.save();

                await sock.sendMessage(
                    chatId,
                    { text: `🏦 Deposited ${amount} shards to vault!` },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Deposit error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error processing deposit." },
                    { quoted: message },
                );
            }
        },
    },

    give: {
        description: "Send shards to another player",
        usage: "give <amount> (reply to user or mention)",
        adminOnly: false,
        execute: async ({ sender, chatId, args, message, sock }) => {
            if (!args[0] || isNaN(args[0])) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !give <amount> (reply to user)" },
                    { quoted: message },
                );
            }

            const amount = parseInt(args[0]);
            let targetUser;

            // Get target user from reply or mention
            if (
                message.message?.extendedTextMessage?.contextInfo?.participant
            ) {
                targetUser =
                    message.message.extendedTextMessage.contextInfo.participant;
            } else if (
                message.message?.extendedTextMessage?.contextInfo?.mentionedJid
                    ?.length
            ) {
                targetUser =
                    message.message.extendedTextMessage.contextInfo
                        .mentionedJid[0];
            } else {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Reply to a user or mention them!" },
                    { quoted: message },
                );
            }

            try {
                const sender_player = await Player.findOne({ userId: sender });
                const target_player = await Player.findOne({
                    userId: targetUser,
                });

                if (!sender_player || !target_player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ One or both users not registered!" },
                        { quoted: message },
                    );
                }

                if (sender_player.shards < amount) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Insufficient shards!" },
                        { quoted: message },
                    );
                }

                sender_player.shards -= amount;
                target_player.shards += amount;

                await sender_player.save();
                await target_player.save();

                await sock.sendMessage(
                    chatId,
                    {
                        text: `*${sender_player.name}* sent 💸 *${amount}* shards to *${target_player.name}* successfully!`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Give error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error transferring shards." },
                    { quoted: message },
                );
            }
        },
    },

    rob: {
        description: "Attempt to steal shards from another player",
        usage: "rob (reply to user)",
        adminOnly: false,
        execute: async ({ sender, chatId, message, sock }) => {
            let targetUser;

            if (
                message.message?.extendedTextMessage?.contextInfo?.participant
            ) {
                targetUser =
                    message.message.extendedTextMessage.contextInfo.participant;
            } else if (
                message.message?.extendedTextMessage?.contextInfo?.mentionedJid
                    ?.length
            ) {
                targetUser =
                    message.message.extendedTextMessage.contextInfo
                        .mentionedJid[0];
            } else {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Reply to a user to rob them!" },
                    { quoted: message },
                );
            }

            try {
                const robber = await Player.findOne({ userId: sender });
                const victim = await Player.findOne({ userId: targetUser });

                if (!robber || !victim) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ One or both users not registered!" },
                        { quoted: message },
                    );
                }

                const success = Math.random() < 0.3; // 30% success rate

                if (success) {
                    const stolenAmount = Math.floor(victim.shards * 0.001); // 0.1% of victim's shards
                    victim.shards -= stolenAmount;
                    robber.shards += stolenAmount;

                    await robber.save();
                    await victim.save();

                    await sock.sendMessage(
                        chatId,
                        {
                            text: `🏴‍☠️ Robbery successful! Stole ${stolenAmount} shards!`,
                        },
                        { quoted: message },
                    );
                } else {
                    const penalty = Math.floor(robber.shards * 0.005); // 0.5% penalty
                    robber.shards = Math.max(0, robber.shards - penalty);
                    await robber.save();

                    await sock.sendMessage(
                        chatId,
                        {
                            text: `🚫 Robbery failed! Lost ${penalty} shards as penalty!`,
                        },
                        { quoted: message },
                    );
                }
            } catch (error) {
                console.error("Rob error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error processing robbery." },
                    { quoted: message },
                );
            }
        },
    },

    shop: {
        description: "View available items in the shop",
        usage: "shop",
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            const shopMsg =
                `🏪 *ZEN SHOP* 🏪\n\n` +
                `1️⃣ *Buy 5000 shards for 50 crystals*\n` +
                `   💰 Cost: 50 💎\n` +
                `   📦 Reward: 5000 shards\n\n` +
                `2️⃣ *Buy a common card pack*\n` +
                `   💰 Cost: 20 💎\n` +
                `   📦 Reward: Random tier 4 card + 1000 shards\n` +
                `   📝 Description: Get a random tier 4 card and 1000 shards\n\n` +
                `💡 Use \`!buy <number>\` to purchase items!`;

            await sock.sendMessage(
                chatId,
                { text: shopMsg },
                { quoted: message },
            );
        },
    },

    slot: {
        description: "Gamble your shards in slots (when enabled)",
        usage: "slot <amount>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message, isGroup }) => {
            if (!args[0] || isNaN(args[0])) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !slot <amount>" },
                    { quoted: message },
                );
            }

            try {
                // Check if slots are enabled in group and user's familia
                const Group = require("../models/Group");
                const Familia = require("../models/Familia");

                const group = await Group.findOne({ groupId: chatId });
                const groupSlotsEnabled = group?.slot === "enabled";

                if (!groupSlotsEnabled) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "🎰 Slots are currently disabled in this group!",
                        },
                        { quoted: message },
                    );
                }
                const player = await Player.findOne({ userId: sender });

                // Check if user's familia has slots enabled
                if (player.familiaId) {
                    const familia = await Familia.findById(player.familiaId);
                    if (!familia || familia.slot !== "enabled") {
                        return sock.sendMessage(
                            chatId,
                            { text: "🎰 Slots are disabled for your familia!" },
                            { quoted: message },
                        );
                    }
                } else {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "🎰 You need to be in a familia with enabled slots to play!",
                        },
                        { quoted: message },
                    );
                }

                const betAmount = parseInt(args[0]);

                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please register first using !register <name>",
                        },
                        { quoted: message },
                    );
                }

                if (betAmount < 10) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Minimum bet is 10 shards!" },
                        { quoted: message },
                    );
                }

                if (player.shards < betAmount) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Insufficient shards!" },
                        { quoted: message },
                    );
                }

                const symbols = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎"];
                const probabilities = {
                    "🍒": 25, // Cherry - 25%
                    "🍋": 20, // Lemon - 20%
                    "🍊": 18, // Orange - 18%
                    "🍇": 17, // Grape - 17%
                    "⭐": 15, // Star - 15%
                    "💎": 5, // Diamond - 5%
                };

                function getWeightedSymbol() {
                    const rand = Math.random() * 100;
                    let cumulative = 0;
                    for (const [symbol, prob] of Object.entries(
                        probabilities,
                    )) {
                        cumulative += prob;
                        if (rand <= cumulative) return symbol;
                    }
                    return "🍒"; // fallback
                }

                let reel1 = getWeightedSymbol();
                let reel2 = getWeightedSymbol();
                let reel3 = getWeightedSymbol();
                if (Math.random() < 0.5) {
                    // 50% of the time
                    const common = ["🍒", "🍋", "🍊"];
                    const symbol =
                        common[Math.floor(Math.random() * common.length)];
                    reel1 = reel2 = reel3 = symbol;
                }
                let multiplier = 0;
                if (reel1 === reel2 && reel2 === reel3) {
                    // Triple match
                    if (reel1 === "💎")
                        multiplier = 6; // Diamond x10
                    else if (reel1 === "⭐")
                        multiplier = 4; // Star x5
                    else if (reel1 === "🍇")
                        multiplier = 3; // Grape x3
                    else multiplier = 1.5; // Others x2
                } else if (
                    reel1 === reel2 ||
                    reel2 === reel3 ||
                    reel1 === reel3
                ) {
                    // Double match
                    multiplier = 1.2;
                } else {
                    // No match - lose bet
                    multiplier = 0;
                }

                const winAmount = Math.floor(betAmount * multiplier);
                const netGain = winAmount - betAmount;

                player.shards -= betAmount;
                player.shards += winAmount;
                await player.save();

                let resultMsg = `🎰 [ ${reel1} | ${reel2} | ${reel3} ]\n\n`;

                if (netGain > 0) {
                    resultMsg += `🎉 *WINNER!* +${netGain} shards!\n💰 Total won: ${winAmount} shards`;
                } else if (netGain === 0) {
                    resultMsg += `😐 *PUSH!* No win, no loss!`;
                } else {
                    resultMsg += `😔 *LOST!* -${betAmount} shards`;
                }

                await sock.sendMessage(
                    chatId,
                    { text: resultMsg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Slot error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error playing slots." },
                    { quoted: message },
                );
            }
        },
    },

    shards: {
        description: "Check your shards balance",
        usage: "shards",
        aliases: ["money"],
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please register first using !register <name>",
                        },
                        { quoted: message },
                    );
                }

                await sock.sendMessage(
                    chatId,
                    {
                        text: `💰 You have *${player.shards.toLocaleString()}* shards`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Shards error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching balance." },
                    { quoted: message },
                );
            }
        },
    },

    vault: {
        description: "Check your vault balance",
        usage: "vault",
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please register first using !register <name>",
                        },
                        { quoted: message },
                    );
                }

                await sock.sendMessage(
                    chatId,
                    {
                        text: `🏦 Vault: *${player.vault.toLocaleString()}* shards`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Vault error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching vault balance." },
                    { quoted: message },
                );
            }
        },
    },

    withdraw: {
        description: "Withdraw money from your vault",
        usage: "withdraw <amount>",
        aliases: ["with"],
        adminOnly: false,
        execute: async ({ sender, chatId, message, args, sock }) => {
            if (!args[0] || isNaN(args[0])) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !withdraw <amount>" },
                    { quoted: message },
                );
            }

            try {
                const amount = parseInt(args[0]);
                const player = await Player.findOne({ userId: sender });

                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please register first using !register <name>",
                        },
                        { quoted: message },
                    );
                }

                if (player.vault < amount) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Insufficient vault balance!" },
                        { quoted: message },
                    );
                }

                player.vault -= amount;
                player.shards += amount;
                await player.save();

                await sock.sendMessage(
                    chatId,
                    { text: `🏦 Withdrew ${amount} shards from vault!` },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Withdraw error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error processing withdrawal." },
                    { quoted: message },
                );
            }
        },
    },
};

module.exports = economyCommands;
