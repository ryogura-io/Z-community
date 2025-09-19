const Player = require("../models/Player");

// Simple in-memory familia storage for now - should be moved to database
const familias = new Map();

const familiaCommands = {
    familialist: {
        description: "View list of all familias",
        usage: "familialist",
        adminOnly: false,
        execute: async ({ chatId, bot }) => {
            if (familias.size === 0) {
                return bot.sendMessage(chatId, "📋 No familias exist yet!");
            }
            
            let list = "🏰 *FAMILIA LIST*\n\n";
            let index = 1;
            for (const [id, familia] of familias.entries()) {
                list += `${index}. *${familia.name}*\n`;
                list += `   👑 Head: ${familia.head}\n`;
                list += `   👥 Members: ${familia.members.length}\n`;
                list += `   📝 ${familia.description || 'No description'}\n\n`;
                index++;
            }
            
            await bot.sendMessage(chatId, list);
        }
    },

    add: {
        description: "Add member to your familia (familia head only)",
        usage: "add (reply to user)",
        adminOnly: false,
        execute: async ({ sender, chatId, message, bot }) => {
            let targetUser;
            
            if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                return bot.sendMessage(chatId, "❌ Reply to a user to add them!");
            }

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player || !player.familiaId) {
                    return bot.sendMessage(chatId, "❌ You don't have a familia!");
                }

                const familia = familias.get(player.familiaId);
                if (!familia || familia.head !== sender) {
                    return bot.sendMessage(chatId, "❌ Only familia head can add members!");
                }

                const targetPlayer = await Player.findOne({ userId: targetUser });
                if (!targetPlayer) {
                    return bot.sendMessage(chatId, "❌ Target user not registered!");
                }

                if (targetPlayer.familiaId) {
                    return bot.sendMessage(chatId, "❌ User is already in a familia!");
                }

                familia.members.push(targetUser);
                targetPlayer.familiaId = player.familiaId;
                await targetPlayer.save();

                await bot.sendMessage(chatId, `✅ User added to familia *${familia.name}*!`);
            } catch (error) {
                console.error('Add member error:', error);
                await bot.sendMessage(chatId, "❌ Error adding member.");
            }
        }
    },

    remove: {
        description: "Remove member from your familia (familia head only)",
        usage: "remove (reply to user)",
        adminOnly: false,
        execute: async ({ sender, chatId, message, bot }) => {
            let targetUser;
            
            if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                return bot.sendMessage(chatId, "❌ Reply to a user to remove them!");
            }

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player || !player.familiaId) {
                    return bot.sendMessage(chatId, "❌ You don't have a familia!");
                }

                const familia = familias.get(player.familiaId);
                if (!familia || familia.head !== sender) {
                    return bot.sendMessage(chatId, "❌ Only familia head can remove members!");
                }

                const memberIndex = familia.members.indexOf(targetUser);
                if (memberIndex === -1) {
                    return bot.sendMessage(chatId, "❌ User is not in your familia!");
                }

                familia.members.splice(memberIndex, 1);
                
                const targetPlayer = await Player.findOne({ userId: targetUser });
                if (targetPlayer) {
                    targetPlayer.familiaId = null;
                    await targetPlayer.save();
                }

                await bot.sendMessage(chatId, `✅ User removed from familia *${familia.name}*!`);
            } catch (error) {
                console.error('Remove member error:', error);
                await bot.sendMessage(chatId, "❌ Error removing member.");
            }
        }
    },

    createfamilia: {
        description: "Create a new familia",
        usage: "createfamilia <name>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !createfamilia <name>");
            }

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                if (player.familiaId) {
                    return bot.sendMessage(chatId, "❌ You're already in a familia!");
                }

                const familiaName = args.join(' ');
                const familiaId = Date.now().toString();
                
                const familia = {
                    id: familiaId,
                    name: familiaName,
                    head: sender,
                    members: [sender],
                    description: "",
                    credits: 0,
                    createdAt: new Date()
                };

                familias.set(familiaId, familia);
                player.familiaId = familiaId;
                await player.save();

                await bot.sendMessage(chatId, `🏰 Familia *${familiaName}* created successfully!\nYou are now the familia head.`);
            } catch (error) {
                console.error('Create familia error:', error);
                await bot.sendMessage(chatId, "❌ Error creating familia.");
            }
        }
    },

    setdescription: {
        description: "Set your familia's description (familia head only)",
        usage: "setdescription <description>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !setdescription <description>");
            }

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player || !player.familiaId) {
                    return bot.sendMessage(chatId, "❌ You don't have a familia!");
                }

                const familia = familias.get(player.familiaId);
                if (!familia || familia.head !== sender) {
                    return bot.sendMessage(chatId, "❌ Only familia head can set description!");
                }

                familia.description = args.join(' ');
                await bot.sendMessage(chatId, `✅ Familia description updated!`);
            } catch (error) {
                console.error('Set description error:', error);
                await bot.sendMessage(chatId, "❌ Error setting description.");
            }
        }
    },

    joinfamilia: {
        description: "Join a familia by ID",
        usage: "joinfamilia <familia_id>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !joinfamilia <familia_id>");
            }

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                if (player.familiaId) {
                    return bot.sendMessage(chatId, "❌ You're already in a familia!");
                }

                // Find familia by index (1-based)
                const familiaIndex = parseInt(args[0]) - 1;
                const familiaArray = Array.from(familias.values());
                
                if (familiaIndex < 0 || familiaIndex >= familiaArray.length) {
                    return bot.sendMessage(chatId, "❌ Invalid familia ID!");
                }

                const familia = familiaArray[familiaIndex];
                familia.members.push(sender);
                player.familiaId = familia.id;
                await player.save();

                await bot.sendMessage(chatId, `🏰 Joined familia *${familia.name}*!`);
            } catch (error) {
                console.error('Join familia error:', error);
                await bot.sendMessage(chatId, "❌ Error joining familia.");
            }
        }
    },

    leavefamilia: {
        description: "Leave your current familia",
        usage: "leavefamilia",
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player || !player.familiaId) {
                    return bot.sendMessage(chatId, "❌ You're not in a familia!");
                }

                const familia = familias.get(player.familiaId);
                if (familia) {
                    if (familia.head === sender) {
                        return bot.sendMessage(chatId, "❌ Familia head cannot leave! Transfer leadership first.");
                    }

                    const memberIndex = familia.members.indexOf(sender);
                    if (memberIndex !== -1) {
                        familia.members.splice(memberIndex, 1);
                    }
                }

                player.familiaId = null;
                await player.save();

                await bot.sendMessage(chatId, `✅ Left familia successfully!`);
            } catch (error) {
                console.error('Leave familia error:', error);
                await bot.sendMessage(chatId, "❌ Error leaving familia.");
            }
        }
    },

    familia: {
        description: "View your current familia details",
        usage: "familia",
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player || !player.familiaId) {
                    return bot.sendMessage(chatId, "❌ You're not in a familia!");
                }

                const familia = familias.get(player.familiaId);
                if (!familia) {
                    return bot.sendMessage(chatId, "❌ Familia not found!");
                }

                let membersList = "";
                for (const member of familia.members) {
                    const isHead = member === familia.head ? "👑 " : "👤 ";
                    membersList += `${isHead}${member.split('@')[0]}\n`;
                }

                const msg = `🏰 *${familia.name}*\n\n` +
                    `📝 *Description:* ${familia.description || 'No description'}\n` +
                    `👑 *Head:* ${familia.head.split('@')[0]}\n` +
                    `👥 *Members (${familia.members.length}):*\n${membersList}\n` +
                    `💎 *Credits:* ${familia.credits}\n` +
                    `📅 *Created:* ${familia.createdAt.toDateString()}`;

                await bot.sendMessage(chatId, msg);
            } catch (error) {
                console.error('Familia info error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching familia info.");
            }
        }
    }
};

module.exports = familiaCommands;