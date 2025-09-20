const Player = require("../models/Player");
const Group = require("../models/Group");
const config = require('../config');

const moderatorCommands = {
    ban: {
        description: "Ban a user from using the bot",
        usage: "ban (reply to user)",
        adminOnly: true,
        execute: async ({ sender, chatId, message, bot }) => {
            let targetUser;
            
            if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                return bot.sendMessage(chatId, "❌ Reply to a user to ban them!");
            }

            try {
                const player = await Player.findOne({ userId: targetUser });
                if (player) {
                    player.isBanned = true;
                    await player.save();
                }

                await bot.sendMessage(chatId, `🚫 User banned from bot!`);
            } catch (error) {
                console.error('Ban error:', error);
                await bot.sendMessage(chatId, "❌ Error banning user.");
            }
        }
    },

    unban: {
        description: "Unban a user",
        usage: "unban (reply to user)",
        adminOnly: true,
        execute: async ({ sender, chatId, message, bot }) => {
            let targetUser;
            
            if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                return bot.sendMessage(chatId, "❌ Reply to a user to unban them!");
            }

            try {
                const player = await Player.findOne({ userId: targetUser });
                if (player) {
                    player.isBanned = false;
                    await player.save();
                }

                await bot.sendMessage(chatId, `✅ User unbanned!`);
            } catch (error) {
                console.error('Unban error:', error);
                await bot.sendMessage(chatId, "❌ Error unbanning user.");
            }
        }
    },

    enable: {
        description: "Enable the bot in current group",
        usage: "enable",
        adminOnly: true,
        execute: async ({ chatId, bot }) => {
            try {
                let group = await Group.findOne({ groupId: chatId });

                if (!group) {
                    // Create if it doesn’t exist
                    group = new Group({ groupId: chatId, status: "enabled" });
                } else {
                    group.status = "enabled";
                }

                await group.save();

                await bot.sendMessage(chatId, "✅ Bot has been *enabled* in this group!");
            } catch (err) {
                console.error("Enable error:", err);
                await bot.sendMessage(chatId, "❌ Error enabling bot in this group.");
            }
        }
    },

    disable: {
        description: "Disable the bot in current group",
        usage: "disable",
        adminOnly: true,
        execute: async ({ chatId, bot }) => {
            try {
                let group = await Group.findOne({ groupId: chatId });

                if (!group) {
                    group = new Group({ groupId: chatId, status: "disabled" });
                } else {
                    group.status = "disabled";
                }

                await group.save();

                await bot.sendMessage(chatId, "🚫 Bot has been *disabled* in this group!");
            } catch (err) {
                console.error("Disable error:", err);
                await bot.sendMessage(chatId, "❌ Error disabling bot in this group.");
            }
        }
    },

    spawn: {
        description: "Enable/disable card spawning in group",
        usage: "spawn <yes/no>",
        adminOnly: true,
        execute: async ({ chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !spawn <yes/no>");
            }

            const enable = args[0].toLowerCase() === 'yes';
            // TODO: Store spawn settings in database
            
            if (enable) {
                await bot.sendMessage(chatId, "✅ Card spawning enabled in this group!");
            } else {
                await bot.sendMessage(chatId, "🚫 Card spawning disabled in this group!");
            }
        }
    },

    removecard: {
        description: "Remove a card from user's deck",
        usage: "removecard (reply to user) <deck_number>",
        adminOnly: true,
        execute: async ({ sender, chatId, message, args, bot }) => {
            if (!args[0] || isNaN(args[0])) {
                return bot.sendMessage(chatId, "❌ Usage: !removecard (reply to user) <deck_number>");
            }

            let targetUser;
            
            if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                return bot.sendMessage(chatId, "❌ Reply to a user!");
            }

            try {
                const deckPosition = parseInt(args[0]) - 1;
                const player = await Player.findOne({ userId: targetUser });
                
                if (!player) {
                    return bot.sendMessage(chatId, "❌ User not registered!");
                }

                if (deckPosition < 0 || deckPosition >= 12) {
                    return bot.sendMessage(chatId, "❌ Deck position must be 1-12!");
                }

                if (!player.deck[deckPosition]) {
                    return bot.sendMessage(chatId, "❌ No card at that position!");
                }

                player.deck[deckPosition] = null;
                await player.save();

                await bot.sendMessage(chatId, `✅ Card removed from user's deck position ${args[0]}!`);
            } catch (error) {
                console.error('Remove card error:', error);
                await bot.sendMessage(chatId, "❌ Error removing card.");
            }
        }
    },

    startslot: {
        description: "Open slot for familia members",
        usage: "startslot <familia_name>",
        adminOnly: true,
        execute: async ({ chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !startslot <familia_name>");
            }

            // TODO: Implement familia slot system
            await bot.sendMessage(chatId, `🎰 Slots opened for familia ${args[0]}!`);
        }
    },

    endslot: {
        description: "Close slot for familia",
        usage: "endslot <familia_name>",
        adminOnly: true,
        execute: async ({ chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !endslot <familia_name>");
            }

            // TODO: Implement familia slot system
            await bot.sendMessage(chatId, `🎰 Slots closed for familia ${args[0]}!`);
        }
    },

    summon: {
        description: "Force spawn a card immediately in current group",
        usage: "summon [url|name]",
        aliases: ["summon"],
        adminOnly: true,
        execute: async ({ chatId, args, bot, sock, msgQueue }) => {
            try {
                if (!chatId.endsWith("@g.us")) {
                    return bot.sendMessage(chatId, "❌ This command only works in groups!");
                }

                const spawnManager = require("../spawnManager.js");

                const arg = args.length > 0 ? args.join(" ") : null;
                const success = await spawnManager.forceSpawnCard(sock, msgQueue, chatId, arg);

                if (success) {
                    await bot.sendMessage(chatId, "⚡ Card summoned successfully!");
                } else {
                    await bot.sendMessage(chatId, "❌ Failed to spawn card (card not found or requirements not met).");
                }
            } catch (error) {
                console.error("Force spawn error:", error);
                await bot.sendMessage(chatId, "❌ Error force spawning card.");
            }
        }
    }
};

module.exports = moderatorCommands;
