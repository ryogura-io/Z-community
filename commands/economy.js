const Player = require("../models/Player");
const mongoose = require('mongoose');

const economyCommands = {
    economy: {
        description: "View the total amount of money across all users",
        usage: "economy",
        aliases: ['econ'],
        adminOnly: false,
        execute: async ({ chatId, bot }) => {
            try {
                const totalShards = await Player.aggregate([
                    { $group: { _id: null, total: { $sum: "$shards" } } }
                ]);
                const totalCrystals = await Player.aggregate([
                    { $group: { _id: null, total: { $sum: "$crystals" } } }
                ]);
                
                const shardsTotal = totalShards[0]?.total || 0;
                const crystalsTotal = totalCrystals[0]?.total || 0;
                
                const msg = `💎 *ZEN ECONOMY OVERVIEW*\n\n` +
                    `💰 Total Shards: *${shardsTotal.toLocaleString()}*\n` +
                    `💎 Total Crystals: *${crystalsTotal.toLocaleString()}*\n` +
                    `👥 Active Players: *${await Player.countDocuments()}*`;
                
                await bot.sendMessage(chatId, msg);
            } catch (error) {
                console.error('Economy error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching economy data.");
            }
        }
    },

    bonus: {
        description: "Claim your welcome bonus (one-time only)",
        usage: "bonus",
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first using !register <name>");
                }
                
                if (player.bonusClaimed) {
                    return bot.sendMessage(chatId, "❌ You have already claimed your welcome bonus!");
                }
                
                const bonusAmount = 15000;
                player.shards += bonusAmount;
                player.bonusClaimed = true;
                await player.save();
                
                await bot.sendMessage(chatId, `🎉 Welcome bonus claimed! +${bonusAmount} shards!`);
            } catch (error) {
                console.error('Bonus error:', error);
                await bot.sendMessage(chatId, "❌ Error claiming bonus.");
            }
        }
    },

    buy: {
        description: "Buy an item from the shop",
        usage: "buy <shop_number>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !buy <shop_number>");
            }
            
            // TODO: Implement shop system
            await bot.sendMessage(chatId, "🚧 Shop system coming soon!");
        }
    },

    daily: {
        description: "Claim your daily shards (24h cooldown)",
        usage: "daily",
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first using !register <name>");
                }
                
                const now = new Date();
                const lastDaily = player.lastDaily || new Date(0);
                const timeDiff = now - lastDaily;
                const oneDayMs = 24 * 60 * 60 * 1000;
                
                if (timeDiff < oneDayMs) {
                    const timeLeft = oneDayMs - timeDiff;
                    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                    const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
                    
                    return bot.sendMessage(chatId, `⏰ Daily already claimed! Try again in ${hoursLeft}h ${minutesLeft}m`);
                }
                
                const dailyAmount = 200;
                player.shards += dailyAmount;
                player.lastDaily = now;
                await player.save();
                
                await bot.sendMessage(chatId, `💰 Daily claimed! +${dailyAmount} shards!`);
            } catch (error) {
                console.error('Daily error:', error);
                await bot.sendMessage(chatId, "❌ Error claiming daily reward.");
            }
        }
    },

    deposit: {
        description: "Transfer money to your vault",
        usage: "deposit <amount>",
        aliases: ['depo'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0] || isNaN(args[0])) {
                return bot.sendMessage(chatId, "❌ Usage: !deposit <amount>");
            }
            
            try {
                const amount = parseInt(args[0]);
                const player = await Player.findOne({ userId: sender });
                
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first using !register <name>");
                }
                
                if (player.shards < amount) {
                    return bot.sendMessage(chatId, "❌ Insufficient shards!");
                }
                
                player.shards -= amount;
                player.vault += amount;
                await player.save();
                
                await bot.sendMessage(chatId, `🏦 Deposited ${amount} shards to vault!`);
            } catch (error) {
                console.error('Deposit error:', error);
                await bot.sendMessage(chatId, "❌ Error processing deposit.");
            }
        }
    },

    give: {
        description: "Send shards to another player",
        usage: "give <amount> (reply to user or mention)",
        adminOnly: false,
        execute: async ({ sender, chatId, args, message, bot }) => {
            if (!args[0] || isNaN(args[0])) {
                return bot.sendMessage(chatId, "❌ Usage: !give <amount> (reply to user)");
            }
            
            const amount = parseInt(args[0]);
            let targetUser;
            
            // Get target user from reply or mention
            if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                return bot.sendMessage(chatId, "❌ Reply to a user or mention them!");
            }
            
            try {
                const sender_player = await Player.findOne({ userId: sender });
                const target_player = await Player.findOne({ userId: targetUser });
                
                if (!sender_player || !target_player) {
                    return bot.sendMessage(chatId, "❌ One or both users not registered!");
                }
                
                if (sender_player.shards < amount) {
                    return bot.sendMessage(chatId, "❌ Insufficient shards!");
                }
                
                sender_player.shards -= amount;
                target_player.shards += amount;
                
                await sender_player.save();
                await target_player.save();
                
                await bot.sendMessage(chatId, `💸 ${amount} shards sent successfully!`);
            } catch (error) {
                console.error('Give error:', error);
                await bot.sendMessage(chatId, "❌ Error transferring shards.");
            }
        }
    },

    rob: {
        description: "Attempt to steal shards from another player",
        usage: "rob (reply to user)",
        adminOnly: false,
        execute: async ({ sender, chatId, message, bot }) => {
            let targetUser;
            
            if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                return bot.sendMessage(chatId, "❌ Reply to a user to rob them!");
            }
            
            try {
                const robber = await Player.findOne({ userId: sender });
                const victim = await Player.findOne({ userId: targetUser });
                
                if (!robber || !victim) {
                    return bot.sendMessage(chatId, "❌ One or both users not registered!");
                }
                
                const success = Math.random() < 0.3; // 30% success rate
                
                if (success) {
                    const stolenAmount = Math.floor(victim.shards * 0.1); // 10% of victim's shards
                    victim.shards -= stolenAmount;
                    robber.shards += stolenAmount;
                    
                    await robber.save();
                    await victim.save();
                    
                    await bot.sendMessage(chatId, `🏴‍☠️ Robbery successful! Stole ${stolenAmount} shards!`);
                } else {
                    const penalty = Math.floor(robber.shards * 0.05); // 5% penalty
                    robber.shards = Math.max(0, robber.shards - penalty);
                    await robber.save();
                    
                    await bot.sendMessage(chatId, `🚫 Robbery failed! Lost ${penalty} shards as penalty!`);
                }
            } catch (error) {
                console.error('Rob error:', error);
                await bot.sendMessage(chatId, "❌ Error processing robbery.");
            }
        }
    },

    shop: {
        description: "View the item shop",
        usage: "shop",
        adminOnly: false,
        execute: async ({ chatId, bot }) => {
            const shopItems = `🏪 **ZEN SHOP**\n\n` +
                `1. 📦 Card Pack - 500 shards\n` +
                `2. 💎 Crystal x10 - 1000 shards\n` +
                `3. 🎯 Deck Slot - 2000 shards\n` +
                `4. 🔮 Lucky Box - 800 shards\n` +
                `5. ⭐ Rare Card Chance - 1500 shards\n\n` +
                `Use !buy <number> to purchase!`;
            
            await bot.sendMessage(chatId, shopItems);
        }
    },

    slot: {
        description: "Gamble your shards in slots (when enabled)",
        usage: "slot <amount>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, isGroup }) => {
            if (!args[0] || isNaN(args[0])) {
                return bot.sendMessage(chatId, "❌ Usage: !slot <amount>");
            }
            
            try {
                // Check if slots are enabled (TODO: store in database per group)
                const slotsEnabled = true; // Default enabled for now
                
                if (!slotsEnabled) {
                    return bot.sendMessage(chatId, "🎰 Slots are currently disabled in this group!");
                }
                
                const betAmount = parseInt(args[0]);
                const player = await Player.findOne({ userId: sender });
                
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first using !register <name>");
                }
                
                if (betAmount < 10) {
                    return bot.sendMessage(chatId, "❌ Minimum bet is 10 shards!");
                }
                
                if (player.shards < betAmount) {
                    return bot.sendMessage(chatId, "❌ Insufficient shards!");
                }
                
                const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎'];
                const probabilities = {
                    '🍒': 30,  // Cherry - 30%
                    '🍋': 25,  // Lemon - 25%
                    '🍊': 20,  // Orange - 20%
                    '🍇': 15,  // Grape - 15%
                    '⭐': 8,   // Star - 8%
                    '💎': 2    // Diamond - 2%
                };
                
                function getWeightedSymbol() {
                    const rand = Math.random() * 100;
                    let cumulative = 0;
                    for (const [symbol, prob] of Object.entries(probabilities)) {
                        cumulative += prob;
                        if (rand <= cumulative) return symbol;
                    }
                    return '🍒'; // fallback
                }
                
                const reel1 = getWeightedSymbol();
                const reel2 = getWeightedSymbol();
                const reel3 = getWeightedSymbol();
                
                let multiplier = 0;
                if (reel1 === reel2 && reel2 === reel3) {
                    // Triple match
                    if (reel1 === '💎') multiplier = 10;      // Diamond x10
                    else if (reel1 === '⭐') multiplier = 5;  // Star x5
                    else if (reel1 === '🍇') multiplier = 3; // Grape x3
                    else multiplier = 2;                    // Others x2
                } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
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
                
                await bot.sendMessage(chatId, resultMsg);
            } catch (error) {
                console.error('Slot error:', error);
                await bot.sendMessage(chatId, "❌ Error playing slots.");
            }
        }
    },

    shards: {
        description: "Check your shards balance",
        usage: "shards",
        aliases: ['money'],
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first using !register <name>");
                }
                
                await bot.sendMessage(chatId, `💰 You have *${player.shards.toLocaleString()}* shards`);
            } catch (error) {
                console.error('Shards error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching balance.");
            }
        }
    },

    vault: {
        description: "Check your vault balance",
        usage: "vault",
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first using !register <name>");
                }
                
                await bot.sendMessage(chatId, `🏦 Vault: *${player.vault.toLocaleString()}* shards`);
            } catch (error) {
                console.error('Vault error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching vault balance.");
            }
        }
    },

    withdraw: {
        description: "Withdraw money from your vault",
        usage: "withdraw <amount>",
        aliases: ['with'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0] || isNaN(args[0])) {
                return bot.sendMessage(chatId, "❌ Usage: !withdraw <amount>");
            }
            
            try {
                const amount = parseInt(args[0]);
                const player = await Player.findOne({ userId: sender });
                
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first using !register <name>");
                }
                
                if (player.vault < amount) {
                    return bot.sendMessage(chatId, "❌ Insufficient vault balance!");
                }
                
                player.vault -= amount;
                player.shards += amount;
                await player.save();
                
                await bot.sendMessage(chatId, `🏦 Withdrew ${amount} shards from vault!`);
            } catch (error) {
                console.error('Withdraw error:', error);
                await bot.sendMessage(chatId, "❌ Error processing withdrawal.");
            }
        }
    }
};

module.exports = economyCommands;