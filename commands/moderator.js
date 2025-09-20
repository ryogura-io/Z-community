const Player = require("../models/Player");
const Group = require("../models/Group");
const Config = require("../models/Config");
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
        execute: async ({ chatId, bot, sock }) => {
            try {
                let group = await Group.findOne({ groupId: chatId });

                if (!group) {
                    // Create if it doesn’t exist
                    group = new Group({ groupId: chatId, status: "enabled" });
                } else {
                    group.status = "enabled";
                    // Update group name when enabling
                    try {
                        const groupMeta = await sock.groupMetadata(chatId);
                        group.groupName = groupMeta.subject || "";
                    } catch (metaError) {
                        console.log("Could not fetch group metadata:", metaError);
                    }
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

            try {
                const enable = args[0].toLowerCase() === 'yes';
                
                let group = await Group.findOne({ groupId: chatId });
                if (!group) {
                    group = new Group({ 
                        groupId: chatId, 
                        spawn: enable ? "enabled" : "disabled" 
                    });
                } else {
                    group.spawn = enable ? "enabled" : "disabled";
                }
                
                await group.save();
                
                if (enable) {
                    await bot.sendMessage(chatId, "✅ Card spawning enabled in this group!");
                } else {
                    await bot.sendMessage(chatId, "🚫 Card spawning disabled in this group!");
                }
            } catch (error) {
                console.error('Spawn command error:', error);
                await bot.sendMessage(chatId, '❌ Error updating spawn settings.');
            }
        }
    },

    removecard: {
        description: "Remove a card from user's deck",
        usage: "removecard (reply to user) <deck_number>",
        aliases: ['rc'],
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

            try {
                const familiaName = args.join(' ');
                const Familia = require("../models/Familia");
                const Group = require("../models/Group");
                
                // Update familia slot status
                const familia = await Familia.findOne({ name: { $regex: new RegExp('^' + familiaName + '$', 'i') } });
                if (!familia) {
                    return bot.sendMessage(chatId, `❌ Familia '${familiaName}' not found!`);
                }
                
                familia.slot = "enabled";
                await familia.save();
                
                // Also enable slots in current group
                let group = await Group.findOne({ groupId: chatId });
                if (!group) {
                    group = new Group({ groupId: chatId, slot: "enabled" });
                } else {
                    group.slot = "enabled";
                }
                await group.save();
                
                await bot.sendMessage(chatId, `🎰 Slots opened for familia *${familiaName}* in this group!`);
            } catch (error) {
                console.error('StartSlot error:', error);
                await bot.sendMessage(chatId, '❌ Error enabling slots.');
            }
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

            try {
                const familiaName = args.join(' ');
                const Familia = require("../models/Familia");
                const Group = require("../models/Group");
                
                // Update familia slot status
                const familia = await Familia.findOne({ name: { $regex: new RegExp('^' + familiaName + '$', 'i') } });
                if (!familia) {
                    return bot.sendMessage(chatId, `❌ Familia '${familiaName}' not found!`);
                }
                
                familia.slot = "disabled";
                await familia.save();
                
                // Also disable slots in current group  
                let group = await Group.findOne({ groupId: chatId });
                if (group) {
                    group.slot = "disabled";
                    await group.save();
                }
                
                await bot.sendMessage(chatId, `🎰 Slots closed for familia *${familiaName}* in this group!`);
            } catch (error) {
                console.error('EndSlot error:', error);
                await bot.sendMessage(chatId, '❌ Error disabling slots.');
            }
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
    },

    cardinfo: {
        description: "View all players currently owning a particular card",
        usage: "cardinfo <cardname> - <tier>",
        aliases: ['ci'],
        adminOnly: true,
        execute: async ({ chatId, args, bot }) => {
            if (args.length < 3 || !args.includes('-')) {
                return bot.sendMessage(chatId, "❌ Usage: !cardinfo <cardname> - <tier>");
            }
            
            try {
                const inputText = args.join(' ');
                const [cardName, tier] = inputText.split(' - ').map(s => s.trim());
                
                if (!cardName || !tier) {
                    return bot.sendMessage(chatId, "❌ Usage: !cardinfo <cardname> - <tier>");
                }
                
                const Card = require("../models/Card");
                const Player = require("../models/Player");
                
                // Find the card
                const card = await Card.findOne({ 
                    name: { $regex: new RegExp('^' + cardName + '$', 'i') },
                    tier: tier
                });
                
                if (!card) {
                    return bot.sendMessage(chatId, `❌ Card '${cardName} [${tier}]' not found in database!`);
                }
                
                // Find all players who own this card
                const playersWithCard = await Player.find({
                    $or: [
                        { collection: card._id },
                        { deck: card._id },
                        { secondaryDeck: card._id }
                    ]
                });
                
                if (playersWithCard.length === 0) {
                    return bot.sendMessage(chatId, `📄 *Card Info: ${card.name} [${card.tier}]*\n\n❌ No players currently own this card.`);
                }
                
                let infoMsg = `📄 *Card Info: ${card.name} [${card.tier}]*\n\n👥 *Owners (${playersWithCard.length}):**\n\n`;
                
                playersWithCard.forEach((player, index) => {
                    // Count copies
                    const deckCopies = player.deck.filter(id => id && id.toString() === card._id.toString()).length;
                    const collectionCopies = player.collection.filter(id => id.toString() === card._id.toString()).length;
                    const secondaryDeckCopies = player.secondaryDeck.filter(id => id && id.toString() === card._id.toString()).length;
                    const totalCopies = deckCopies + collectionCopies + secondaryDeckCopies;
                    
                    infoMsg += `${index + 1}. *${player.name}* - ${totalCopies} copies\n`;
                });
                
                await bot.sendMessage(chatId, infoMsg);
            } catch (error) {
                console.error('CardInfo error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching card information.");
            }
        }
    },

    timeout: {
        description: "Timeout a user from using commands",
        usage: "timeout <duration_in_minutes> (reply to user)",
        adminOnly: true,
        execute: async ({ chatId, args, message, bot }) => {
            if (!args[0] || isNaN(args[0])) {
                return bot.sendMessage(chatId, "❌ Usage: !timeout <duration_in_minutes> (reply to user)");
            }
            
            let targetUser;
            
            if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                return bot.sendMessage(chatId, "❌ Reply to a user to timeout them!");
            }
            
            try {
                const durationMinutes = parseInt(args[0]);
                const timeoutUntil = new Date(Date.now() + (durationMinutes * 60 * 1000));
                
                const Player = require("../models/Player");
                let player = await Player.findOne({ userId: targetUser });
                
                if (!player) {
                    // Create player entry if doesn't exist
                    player = new Player({
                        userId: targetUser,
                        name: "Unknown User",
                        timeout: timeoutUntil
                    });
                } else {
                    player.timeout = timeoutUntil;
                }
                
                await player.save();
                
                const userName = targetUser.split('@')[0];
                await bot.sendMessage(chatId, `⏰ User *${userName}* has been timed out for ${durationMinutes} minutes.`);
            } catch (error) {
                console.error('Timeout error:', error);
                await bot.sendMessage(chatId, "❌ Error timing out user.");
            }
        }
    }
};

module.exports = moderatorCommands;
