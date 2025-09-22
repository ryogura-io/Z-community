const Player = require("../models/Player");
const Familia = require("../models/Familia");

const familiaCommands = {
    // 🏰 Create a new familia
    createfamilia: {
        description: "Create a new familia",
        usage: "createfamilia <name>",
        aliases: ['cfam', 'cfamilia'],
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(chatId, { text: "❌ Usage: !createfamilia <name>" }, { quoted: message });
            }

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                if (player.familiaId) return sock.sendMessage(chatId, { text: "❌ You're already in a familia!" }, { quoted: message });
                if (player.level < 8) return sock.sendMessage(chatId, { text: "❌ You need to be level 8 or higher to create a familia!" }, { quoted: message });

                const familiaName = args.join(' ');

                const familia = new Familia({
                    name: familiaName,
                    head: sender,
                    members: [sender]
                });
                await familia.save();

                player.familiaId = familia._id;
                await player.save();

                await sock.sendMessage(chatId, { text: `🏰 Familia *${familiaName}* created!\nYou are now the familia head.` }, { quoted: message });
            } catch (error) {
                console.error("Create familia error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error creating familia." }, { quoted: message });
            }
        }
    },

    // ➕ Add member to familia
    add: {
        description: "Add a member to your familia",
        usage: "add <@user>",
        aliases: ['addmember'],
        execute: async ({ sender, chatId, message, args, bot, sock }) => {

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player?.familiaId) return sock.sendMessage(chatId, { text: "❌ You're not in a familia!" }, { quoted: message });

                const familia = await Familia.findById(player.familiaId);
                if (!familia) return sock.sendMessage(chatId, { text: "❌ Familia not found!" }, { quoted: message });
                if (familia.head !== sender) return sock.sendMessage(chatId, { text: "❌ Only the familia head can add members!" }, { quoted: message });

                let mentionedUser;

                if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                    mentionedUser = message.message.extendedTextMessage.contextInfo.participant;
                } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    mentionedUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                } else {
                    return sock.sendMessage(chatId, { text: "❌ mention a user to add them!" }, { quoted: message });
                }

                const newMember = await Player.findOne({ userId: mentionedUser });
                if (!newMember) return sock.sendMessage(chatId, { text: "❌ That user is not registered!" }, { quoted: message });
                if (newMember.familiaId) return sock.sendMessage(chatId, { text: "❌ That user is already in a familia!" }, { quoted: message });

                familia.members.push(mentionedUser);
                await familia.save();

                newMember.familiaId = familia._id;
                await newMember.save();

                await sock.sendMessage(chatId,{ text: `✅ Added ${args[0]} to *${familia.name}*!`}, { quoted: message });
            } catch (error) {
                console.error("Add familia member error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error adding member." }, { quoted: message });
            }
        }
    },

    // ❌ Remove member
    remove: {
        description: "Remove a member from your familia",
        usage: "remove <@user>",
        aliases: ['rm', 'rmmember'],
        execute: async ({ sender, chatId, message, args, bot, sock }) => {

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player?.familiaId) return sock.sendMessage(chatId, { text: "❌ You're not in a familia!" }, { quoted: message });

                const familia = await Familia.findById(player.familiaId);
                if (!familia) return sock.sendMessage(chatId, { text: "❌ Familia not found!" }, { quoted: message });
                if (familia.head !== sender) return sock.sendMessage(chatId, { text: "❌ Only the familia head can remove members!" }, { quoted: message });

                let mentionedUser;

                if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                    mentionedUser = message.message.extendedTextMessage.contextInfo.participant;
                } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    mentionedUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                } else {
                    return sock.sendMessage(chatId, { text: "❌ mention a user to remove them!" }, { quoted: message });
                }

                if (!familia.members.includes(mentionedUser)) {
                    return sock.sendMessage(chatId, { text: "❌ That user is not in your familia!" }, { quoted: message });
                }

                familia.members = familia.members.filter(m => m !== mentionedUser);
                await familia.save();

                await Player.updateOne({ userId: mentionedUser }, { $set: { familiaId: null } });

                await sock.sendMessage(chatId, { text:`❌ Removed ${args[0]} from *${familia.name}*!`}, { quoted: message });
            } catch (error) {
                console.error("Remove familia member error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error removing member." }, { quoted: message });
            }
        }
    },

    // 📋 List all familias
    familialist: {
        description: "List all familias",
        usage: "familialist",
        aliases: ['flist', 'famlist'],
        execute: async ({ chatId, bot, message, sock }) => {
            try {
                const familias = await Familia.find();
                if (familias.length === 0) return sock.sendMessage(chatId, { text:"❌ No familias exist yet!"}, { quoted: message });

                let msg = "🏰 *Existing Familias:*\n\n";
                for (const f of familias) {
                    // Fetch only the head player
                    const headPlayer = await Player.findOne({ userId: f.head });
                    const headName = headPlayer ? headPlayer.name : f.head;

                    msg += `👑 *${f.name}*\nHead: ${headName}\nMembers: ${f.members.length}\n\n`;
                }

                await sock.sendMessage(chatId, { text:msg}, { quoted: message });
            } catch (error) {
                console.error("Familialist error:", error);
                await sock.sendMessage(chatId,{ text: "❌ Error fetching familia list."}, { quoted: message });
            }
        }
    },

    // 📖 Show familia info
    familia: {
        description: "Show familia details",
        usage: "familia",
        aliases: ['myfamilia', 'fam'],
        execute: async ({ sender, chatId, sock, bot, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player?.familiaId) return sock.sendMessage(chatId, { text: "❌ You're not in a familia!" }, { quoted: message });

                const familia = await Familia.findById(player.familiaId);
                if (!familia) return sock.sendMessage(chatId, { text: "❌ Familia not found!" }, { quoted: message });

                let msg = `🏰 *${familia.name}*\n👑 Head: @${familia.head.split('@')[0]}\n\n`;
                msg += `👥 Members (${familia.members.length}):\n`;
                // Load all member documents at once
                const members = await Player.find({ userId: { $in: familia.members } });

                familia.members.forEach(memberId => {
                    const player = members.find(m => m.userId === memberId);
                    const displayName = player ? player.name : memberId.split('@')[0]; // fallback
                    msg += `- ${displayName}\n`;
                });

                await sock.sendMessage(chatId, { text:msg}, {quoted: message , mentions: [ familia.head ] });
            } catch (error) {
                console.error("Familia info error:", error);
                await sock.sendMessage(chatId, { text:"❌ Error fetching familia info."}, { quoted: message });
            }
        }
    },

    setdescription: {
        description: "Set your familia's description (familia head only)",
        usage: "setdescription <description>",
        aliases: ['setdesc'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(chatId, { text:"❌ Usage: !setdescription <description>"}, { quoted: message });
            }

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player || !player.familiaId) {
                    return sock.sendMessage(chatId,{ text: "❌ You don't have a familia!"}, { quoted: message });
                }

                const familia = await Familia.findById(player.familiaId);
                if (!familia || familia.head !== sender) {
                    return sock.sendMessage(chatId, { text:"❌ Only the familia head can set the description!"}, { quoted: message });
                }

                familia.description = args.join(" ");
                await familia.save();

                await sock.sendMessage(chatId, { text:`✅ Familia description updated!`}, { quoted: message });
            } catch (error) {
                console.error("Set description error:", error);
                await sock.sendMessage(chatId, { text:"❌ Error setting description."}, { quoted: message });
            }
        }
    },

    joinfamilia: {
        description: "Join a familia by ID",
        usage: "joinfamilia <familia_id>",
        aliases: ['jfam'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(chatId, { text:"❌ Usage: !joinfamilia <familia_id>"}, { quoted: message });
            }

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(chatId, { text:"❌ Please register first!"}, { quoted: message });
                }

                if (player.familiaId) {
                    return sock.sendMessage(chatId, { text:"❌ You're already in a familia!"}, { quoted: message });
                }

                const familia = await Familia.findById(args[0]);
                if (!familia) {
                    return sock.sendMessage(chatId, { text:"❌ Invalid familia ID!"}, { quoted: message });
                }

                familia.members.push(sender);
                await familia.save();

                player.familiaId = familia._id;
                await player.save();

                await sock.sendMessage(chatId, { text:`🏰 Joined familia *${familia.name}*!`}, { quoted: message });
            } catch (error) {
                console.error("Join familia error:", error);
                await sock.sendMessage(chatId, { text:"❌ Error joining familia."}, { quoted: message });
            }
        }
    },

    leavefamilia: {
        description: "Leave your current familia",
        usage: "leavefamilia",
        aliases: ['lfam'],
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player || !player.familiaId) {
                    return sock.sendMessage(chatId, { text:"❌ You're not in a familia!"}, { quoted: message });
                }

                const familia = await Familia.findById(player.familiaId);
                if (!familia) {
                    player.familiaId = null;
                    await player.save();
                    return sock.sendMessage(chatId, { text:"❌ Familia not found, removed from your profile."}, { quoted: message });
                }

                if (familia.head === sender) {
                    return sock.sendMessage(chatId, { text:"❌ Familia head cannot leave! Transfer leadership first."}, { quoted: message });
                }

                familia.members = familia.members.filter(m => m !== sender);
                await familia.save();

                player.familiaId = null;
                await player.save();

                await sock.sendMessage(chatId, { text:`✅ Left familia *${familia.name}* successfully!`}, { quoted: message });
            } catch (error) {
                console.error("Leave familia error:", error);
                await sock.sendMessage(chatId, { text:"❌ Error leaving familia."}, { quoted: message });
            }
        }
    }
};

module.exports = familiaCommands;
