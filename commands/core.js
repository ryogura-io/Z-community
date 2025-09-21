const Player = require("../models/Player");

const coreCommands = {
    register: {
        description: "Register as a new user with a name",
        usage: "register <name>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, message }) => {
            if (!args[0]) {
                return bot.sendCommandResponse(chatId, "❌ Usage: !register <name>", sender, message);
            }

            try {
                let player = await Player.findOne({ userId: sender });
                if (player) {
                    return bot.sendCommandResponse(chatId, "✅ You are already registered!", sender, message);
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

                await bot.sendCommandResponse(chatId, welcomeMsg, sender, message);
            } catch (error) {
                console.error('Register error:', error);
                await bot.sendCommandResponse(chatId, "❌ Error registering player.", sender, message);
            }
        }
    },

    afk: {
        description: "Set your AFK status with optional message",
        usage: "afk [message]",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                const afkMessage = args.join(' ') || "I'm currently AFK";
                player.isAfk = true;
                player.afkMessage = afkMessage;
                await player.save();

                await bot.sendMessage(chatId, `😴 *AFK Set*\n📝 Message: "${afkMessage}"`);
            } catch (error) {
                console.error('AFK error:', error);
                await bot.sendMessage(chatId, "❌ Error setting AFK status.");
            }
        }
    },

    exp: {
        description: "Display your experience points",
        usage: "exp",
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                await bot.sendMessage(chatId, `⭐ *${player.name}*\n🎯 EXP: *${player.exp.toLocaleString()}*`);
            } catch (error) {
                console.error('EXP error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching EXP.");
            }
        }
    },

    rank: {
        description: "Show your level details",
        usage: "rank",
        aliases: ['level'],
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                const expForNext = player.level * 1000; // Simple leveling system
                const currentExp = player.exp % 1000;
                
                const msg = `🏆 *RANK INFO*\n\n` +
                    `👤 *Name:* ${player.name}\n` +
                    `📊 *Level:* ${player.level}\n` +
                    `⭐ *EXP:* ${player.exp.toLocaleString()}\n` +
                    `📈 *Progress:* ${currentExp}/${expForNext}\n` +
                    `🎯 *Next Level:* ${expForNext - currentExp} EXP needed`;

                await bot.sendMessage(chatId, msg);
            } catch (error) {
                console.error('Rank error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching rank info.");
            }
        }
    },

    inventory: {
        description: "Show your complete inventory",
        usage: "inventory",
        aliases: ['inv'],
        adminOnly: false,
        execute: async ({ sender, chatId, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender }).populate('collection deck familiaId');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
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

                await bot.sendMessage(chatId, msg);
            } catch (error) {
                console.error('Inventory error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching inventory.");
            }
        }
    },

    leaderboard: {
        description: "Show leaderboards",
        usage: "leaderboard [cards|shards]",
        aliases: ['lb'],
        adminOnly: false,
        execute: async ({ chatId, args, bot }) => {
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
                    
                    return bot.sendMessage(chatId, leaderboard);
                }
                
                const players = await Player.find({}).sort({ [sortField]: -1 }).limit(10);
                
                let leaderboard = `${title}\n\n`;
                players.forEach((player, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    const value = type === 'shards' ? player.shards.toLocaleString() : player.exp.toLocaleString();
                    leaderboard += `${medal} *${player.name}* - ${value} ${unit}\n`;
                });
                
                await bot.sendMessage(chatId, leaderboard);
            } catch (error) {
                console.error('Leaderboard error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching leaderboard.");
            }
        }
    },

    mods: {
        description: "Tag all moderators",
        usage: "mods",
        adminOnly: false,
        execute: async ({ chatId, bot }) => {
            const config = require('../config');
            const admins = config.get('admins');
            
            let modList = "🛡️ *MODERATORS*\n\n";
            admins.forEach(admin => {
                modList += `~ @${admin.split('@')[0]}\n`;
            });
            
            await bot.sendMessage(chatId, modList, {
                mentions: admins
            });
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
                    return bot.sendMessage(chatId, "❌ Please register first!");
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

                await bot.sendImage(chatId, buffer, profileMsg);
            } catch (error) {
                console.error('Profile error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching profile.");
            }
        }
    },

    setbio: {
        description: "Set your profile bio",
        usage: "setbio <bio_text>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, message }) => {
            if (!args[0]) {
                return bot.sendCommandResponse(chatId, "❌ Usage: !setbio <bio_text>", sender, message);
            }
            
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendCommandResponse(chatId, "❌ Please register first!", sender, message);
                }
                
                const newBio = args.join(' ');
                if (newBio.length > 150) {
                    return bot.sendCommandResponse(chatId, "❌ Bio must be 150 characters or less!", sender, message);
                }
                
                player.bio = newBio;
                await player.save();
                
                await bot.sendCommandResponse(chatId, `✅ Bio updated successfully!\n📝 *New Bio:* ${newBio}`, sender, message);
            } catch (error) {
                console.error('SetBio error:', error);
                await bot.sendCommandResponse(chatId, "❌ Error updating bio.", sender, message);
            }
        }
    }
};

module.exports = coreCommands;
