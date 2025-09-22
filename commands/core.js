const Player = require("../models/Player");

const coreCommands = {
    register: {
        description: "Register as a new user with a name",
        usage: "register <name>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(chatId, { text: "❌ Usage: !register <name>" }, { quoted: message });
            }

            try {
                let player = await Player.findOne({ userId: sender });
                if (player) {
                    return sock.sendMessage(chatId, { text: "✅ You are already registered!" }, { quoted: message });
                }

                const playerName = args.join(' ');
                player = new Player({
                    userId: sender,
                    name: playerName,
                    shards: 0,
                    crystals: 0,
                    vault: 0,
                    exp: 0,
                    level: 1,
                    deck: new Array(12).fill(null),
                    secondaryDeck: new Array(12).fill(null),
                    secondaryDeckName: "Deck 2",
                    collection: [],
                    inventory: [],
                    bonusClaimed: false,
                    lastDaily: null,
                    familiaId: null,
                    isAfk: false,
                    afkMessage: "",
                    bio: "",
                    character: ""
                });
                
                await player.save();
                
                const welcomeMsg = `🎉 *Welcome to ZEN Collection!*\n\n` +
                    `👤 *Name:* ${playerName}\n` +
                    `💰 *Starting Shards:* 0\n` +
                    `📊 *Level:* 1\n\n` +
                    `Use !bonus to claim your welcome bonus!\n` +
                    `Use !help to see all commands!`;

                await sock.sendMessage(chatId, { text: welcomeMsg }, { quoted: message });
            } catch (error) {
                console.error('Register error:', error);
                await sock.sendMessage(chatId, { text: "❌ Error registering player." }, { quoted: message });
            }
        }
    },

    afk: {
        description: "Set your AFK status with optional message",
        usage: "afk [message]",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                }

                const afkMessage = args.join(' ') || "I'm currently AFK";
                player.isAfk = true;
                player.afkMessage = afkMessage;
                await player.save();

                await sock.sendMessage(chatId, { text: `😴 *AFK Set*\n📝 Message: "${afkMessage}"` }, { quoted: message });
            } catch (error) {
                console.error('AFK error:', error);
                await sock.sendMessage(chatId, { text: "❌ Error setting AFK status." }, { quoted: message });
            }
        }
    },

    exp: {
        description: "Display your experience points",
        usage: "exp",
        adminOnly: false,
        execute: async ({ sender, chatId, bot, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                }

                await sock.sendMessage(chatId, { text: `⭐ *${player.name}*\n🎯 EXP: *${player.exp.toLocaleString()}*` }, { quoted: message });
            } catch (error) {
                console.error('EXP error:', error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching EXP." }, { quoted: message });
            }
        }
    },

    rank: {
        description: "Show your level details",
        usage: "rank",
        aliases: ['level'],
        adminOnly: false,
        execute: async ({ sender, chatId, bot, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                }

                const expForNext = player.level * 1000; // Simple leveling system
                const currentExp = player.exp % 1000;
                
                const msg = `🏆 *RANK INFO*\n\n` +
                    `👤 *Name:* ${player.name}\n` +
                    `📊 *Level:* ${player.level}\n` +
                    `⭐ *EXP:* ${player.exp.toLocaleString()}\n` +
                    `📈 *Progress:* ${currentExp}/${expForNext}\n` +
                    `🎯 *Next Level:* ${expForNext - currentExp} EXP needed`;

                await sock.sendMessage(chatId, { text: msg }, { quoted: message });
            } catch (error) {
                console.error('Rank error:', error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching rank info." }, { quoted: message });
            }
        }
    },

    inventory: {
        description: "Show your complete inventory",
        usage: "inventory",
        aliases: ['inv'],
        adminOnly: false,
        execute: async ({ sender, chatId, bot, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender }).populate('collection deck familiaId');
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                }

                const totalCards = player.collection.length;
                const deckCards = player.deck.filter(card => card !== null).length;
                
                const msg = `🎒 *${player.name}'s INVENTORY*\n\n` +
                    `💰 *Shards:* ${player.shards.toLocaleString()}\n` +
                    `💎 *Crystals:* ${player.crystals.toLocaleString()}\n` +
                    `🏦 *Vault:* ${player.vault.toLocaleString()}\n` +
                    `🎴 *Total Cards:* ${totalCards}\n` +
                    `🃏 *Cards in Deck:* ${deckCards}/12\n` +
                    `📊 *Level:* ${player.level}\n` +
                    `⭐ *EXP:* ${player.exp.toLocaleString()}\n` +
                    `🏰 *Familia:* ${player.familiaId ? player.familiaId.name : 'None'}`;

                await sock.sendMessage(chatId, { text: msg }, { quoted: message });
            } catch (error) {
                console.error('Inventory error:', error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching inventory." }, { quoted: message });
            }
        }
    },

    leaderboard: {
        description: "Show leaderboards",
        usage: "leaderboard [cards|shards]",
        aliases: ['lb'],
        adminOnly: false,
        execute: async ({ chatId, args,sock,message, bot }) => {
            try {
                const type = args[0] || 'exp';
                let sortField = 'exp';
                let title = '⭐ *EXP LEADERBOARD*';
                let unit = 'XP'
                
                if (type === 'shards') {
                    sortField = 'shards';
                    title = '💰 *SHARDS LEADERBOARD*';
                    unit = 'shards';
                } else if (type === 'cards') {
                    // For cards, we'll count collection length
                    const players = await Player.find({}).populate('collection');
                    const sorted = players.sort((a, b) => b.collection.length - a.collection.length);
                    
                    let leaderboard = `🎴 *CARDS LEADERBOARD*\n\n`;
                    sorted.slice(0, 10).forEach((player, index) => {
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                        leaderboard += `${medal} *${player.name}* - ${player.collection.length} cards\n`;
                    });
                    
                    return sock.sendMessage(chatId, { text: leaderboard }, { quoted: message });
                }
                
                const players = await Player.find({}).sort({ [sortField]: -1 }).limit(10);
                
                let leaderboard = `${title}\n\n`;
                players.forEach((player, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    const value = type === 'shards' ? player.shards.toLocaleString() : player.exp.toLocaleString();
                    leaderboard += `${medal} *${player.name}* - ${value} ${unit}\n`;
                });
                
                await sock.sendMessage(chatId, { text: leaderboard }, { quoted: message });
            } catch (error) {
                console.error('Leaderboard error:', error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching leaderboard." }, { quoted: message });
            }
        }
    },

    mods: {
        description: "Tag all moderators",
        usage: "mods",
        adminOnly: false,
        execute: async ({ chatId, sock,message, bot }) => {
            const config = require('../config');
            const admins = config.get('admins');
            
            let modList = "🛡️ *MODERATORS*\n\n";
            admins.forEach(admin => {
                modList += `~ @${admin.split('@')[0]}\n`;
            });
            
            await sock.sendMessage(chatId, { 
                text: modList, 
                mentions: admins 
            }, { quoted: message });
        }
    },

    profile: {
        description: "Show your profile details",
        usage: "profile",
        aliases: ['p'],
        adminOnly: false,
        execute: async ({ sender, chatId, bot, sock, message }) => {
            try {
                let target;

                if (
                    message.message?.extendedTextMessage?.contextInfo
                        ?.participant
                ) {
                    target =
                        message.message.extendedTextMessage.contextInfo
                            .participant;
                } else if (
                    message.message?.extendedTextMessage?.contextInfo
                        ?.mentionedJid?.length
                ) {
                    target =
                        message.message.extendedTextMessage.contextInfo
                            .mentionedJid[0];
                } else {
                    target = message.key.participant || message.key.remoteJid;
                }
                
                const player = await Player.findOne({ userId: target }).populate('collection familiaId');
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                }

                // Get profile picture
                let pfpUrl;
                try {
                    pfpUrl = await sock.profilePictureUrl(target, "image");
                } catch {
                    pfpUrl = "https://i.ibb.co/1m1dFHS/default-pfp.png";
                }

                const totalCards = player.collection.length;
                const deckCards = player.deck.filter(card => card !== null).length;
                
                // Get familia name
                let familiaName = 'None';
                if (player.familiaId) {
                    const familiaCommands = require('./familia');
                    // Access familias from memoria (this is a simple approach)
                    familiaName = 'Member'; // Fallback
                }
                
                const profileMsg = `👤 *PROFILE*\n\n` +
                    `🏷️ *Name:* ${player.name}\n` +
                    `📊 *Level:* ${player.level}\n` +
                    `⭐ *EXP:* ${player.exp.toLocaleString()}\n` +
                    `💰 *Shards:* ${player.shards.toLocaleString()}\n` +
                    `🎴 *Cards:* ${totalCards}\n` +
                    `🃏 *Deck:* ${deckCards}/12\n` +
                    `🏰 *Familia:* ${player.familiaId ? player.familiaId.name : 'None'}\n` +
                    `📝 *Bio:* ${player.bio || 'No bio set'}\n` +
                    `🎭 *Character:* ${player.character || 'Not set'}`;

                // Send with profile picture
                const fetch = require('node-fetch');
                const res = await fetch(pfpUrl);
                const buffer = Buffer.from(await res.arrayBuffer());

                await sock.sendMessage(chatId, { 
                    image: buffer, 
                    caption: profileMsg 
                }, { quoted: message });
            } catch (error) {
                console.error('Profile error:', error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching profile." }, { quoted: message });
            }
        }
    },

    setbio: {
        description: "Set your profile bio",
        usage: "setbio <bio_text>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(chatId, { text: "❌ Usage: !setbio <bio_text>"}, { quoted: message });
            }
            
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(chatId, { text:"❌ Please register first!"}, { quoted: message });
                }
                
                const newBio = args.join(' ');
                if (newBio.length > 150) {
                    return sock.sendMessage(chatId, { text: "❌ Bio must be 150 characters or less!"}, { quoted: message });
                }
                
                player.bio = newBio;
                await player.save();
                
                await sock.sendMessage(chatId, { text: `✅ Bio updated successfully!\n📝 *New Bio:* ${newBio}`}, { quoted: message });
            } catch (error) {
                console.error('SetBio error:', error);
                await sock.sendMessage(chatId, { text:"❌ Error updating bio."}, { quoted: message });
            }
        }
    }
};

module.exports = coreCommands;
