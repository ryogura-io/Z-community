const Player = require("../models/Player");
const fetch = require("node-fetch");
const Group = require("../models/Group");
const Familia = require("../models/Familia");
const axios = require("axios");
const FormData = require("form-data");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { getPokemonCount } = require("./pokemon");

// helper to fetch characters live from GitHub
async function getCharacters() {
    const res = await fetch(
        "https://github.com/ryogura-io/Z-community/releases/download/Utils/waifu_details.json",
    );
    if (!res.ok)
        throw new Error(`Failed to fetch characters: ${res.statusText}`);
    return await res.json();
}

const coreCommands = {
    register: {
        description: "Register as a new user with a name",
        usage: "register <name>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !register <name>" },
                    { quoted: message },
                );
            }

            try {
                let player = await Player.findOne({ userId: sender });
                if (player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "✅ You are already registered!" },
                        { quoted: message },
                    );
                }

                const playerName = args.join(" ");
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
                    character: "",
                });

                await player.save();

                const welcomeMsg =
                    `🎉 *Welcome to ZEN Collection!*\n\n` +
                    `👤 *Name:* ${playerName}\n` +
                    `💰 *Starting Shards:* 0\n` +
                    `📊 *Level:* 1\n\n` +
                    `Use !bonus to claim your welcome bonus!\n` +
                    `Use !help to see all commands!`;

                await sock.sendMessage(
                    chatId,
                    { text: welcomeMsg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Register error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error registering player." },
                    { quoted: message },
                );
            }
        },
    },

    afk: {
        description: "Set or disable your AFK status",
        usage: "afk [message] | afk off",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                // If command is "afk off"
                if (args[0] && args[0].toLowerCase() === "off") {
                    player.isAfk = false;
                    player.afkMessage = "";
                    await player.save();

                    return sock.sendMessage(
                        chatId,
                        { text: "✅ You are no longer AFK." },
                        { quoted: message },
                    );
                }

                // Otherwise, set AFK with optional message
                const afkMessage = args.join(" ") || "I'm currently AFK";
                player.isAfk = true;
                player.afkMessage = afkMessage;
                await player.save();

                await sock.sendMessage(
                    chatId,
                    { text: `😴 *AFK Set*\n📝 Message: "${afkMessage}"` },
                    { quoted: message },
                );
            } catch (error) {
                console.error("AFK error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error setting AFK status." },
                    { quoted: message },
                );
            }
        },
    },

    exp: {
        description: "Display your experience points",
        usage: "exp",
        adminOnly: false,
        execute: async ({ sender, chatId, bot, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                await sock.sendMessage(
                    chatId,
                    {
                        text: `⭐ *${player.name}*\n🎯 EXP: *${player.exp.toLocaleString()}*`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("EXP error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching EXP." },
                    { quoted: message },
                );
            }
        },
    },

    rank: {
        description: "Show your level details",
        usage: "rank",
        aliases: ["level"],
        adminOnly: false,
        execute: async ({ sender, chatId, bot, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                const expForNext = player.level * 1000; // Simple leveling system
                const currentExp = player.exp % (1000 * player.level);

                const msg =
                    `🏆 *RANK INFO*\n\n` +
                    `👤 *Name:* ${player.name}\n` +
                    `📊 *Level:* ${player.level}\n` +
                    `⭐ *EXP:* ${player.exp.toLocaleString()}\n` +
                    `📈 *Progress:* ${currentExp}/${expForNext}\n` +
                    `🎯 *Next Level:* ${expForNext - currentExp} EXP needed`;

                await sock.sendMessage(
                    chatId,
                    { text: msg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Rank error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching rank info." },
                    { quoted: message },
                );
            }
        },
    },

    inventory: {
    description: "Show your complete inventory",
    usage: "inventory",
    aliases: ["inv"],
    adminOnly: false,
    execute: async ({ sender, chatId, bot, sock, message }) => {
        try {
            const player = await Player.findOne({
                userId: sender,
            }).populate("collection deck familiaId");
            if (!player) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Please register first!" },
                    { quoted: message }
                );
            }

            const totalCards = player.collection.length;
            const deckCards = player.deck.filter((card) => card !== null).length;

            // --- Build items section ---
            let itemsMsg = "📦 *Items:* None";
            if (player.inventory && player.inventory.length > 0) {
                const ownedItems = player.inventory
                    .filter((i) => i.quantity > 0)
                    .map((i) => `${i.item} x${i.quantity}`);
                if (ownedItems.length > 0) itemsMsg = `📦 *Items:*\n- ${ownedItems.join("\n- ")}`;
            }

            const msg =
                `🎒 *${player.name}'s INVENTORY*\n\n` +
                `💰 *Shards:* ${player.shards.toLocaleString()}\n` +
                `💎 *Crystals:* ${player.crystals.toLocaleString()}\n` +
                `🏦 *Vault:* ${player.vault.toLocaleString()}\n` +
                `🎴 *Total Cards:* ${totalCards}\n` +
                `🃏 *Cards in Deck:* ${deckCards}/12\n` +
                `🐾 *Pokemon Count:* ${pokeCount}\n` +
                `📊 *Level:* ${player.level}\n` +
                `⭐ *EXP:* ${player.exp.toLocaleString()}\n` +
                `🏰 *Familia:* ${player.familiaId ? player.familiaId.name : "None"}\n\n` +
                itemsMsg;

            await sock.sendMessage(chatId, { text: msg }, { quoted: message });
        } catch (error) {
            console.error("Inventory error:", error);
            await sock.sendMessage(
                chatId,
                { text: "❌ Error fetching inventory." },
                { quoted: message }
            );
        }
    },
},

    leaderboard: {
    description: "Show leaderboards",
    usage: "leaderboard [exp|cards|shards|games|familia|pokemon]",
    aliases: ["lb"],
    adminOnly: false,
    execute: async ({ chatId, args, sock, message }) => {
        try {
            const type = args[0] || "exp";
            let sortField = "exp";
            let title = "⭐ *EXP LEADERBOARD*";

            // ====== SHARDS LEADERBOARD ======
            if (type === "shards") {
                sortField = "shards";
                title = "💰 *SHARDS LEADERBOARD*";

            // ====== GAMES LEADERBOARD ======
            } else if (type === "games") {
                sortField = "gameWins";
                title = "🎮 *GAMES LEADERBOARD*";

            // ====== CARDS LEADERBOARD ======
            } else if (type === "cards") {
                const players = await Player.find({})
                    .populate("familiaId", "name")
                    .populate("collection");

                const sorted = players.sort(
                    (a, b) => b.collection.length - a.collection.length
                );

                let leaderboard = `🎴 *CARDS LEADERBOARD*\n\n`;
                sorted.slice(0, 10).forEach((player, index) => {
                    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
                    leaderboard += `${medal} *${player.name}*\n`;
                    leaderboard += `   ⭐ Exp: ${player.exp || 0}\n`;
                    leaderboard += `   🏰 Familia: ${player.familiaId?.name || "None"}\n`;
                    leaderboard += `   💰 Shards: ${player.shards}\n`;
                    leaderboard += `   🎴 Cards: ${player.collection.length}\n`;
                    leaderboard += `   🎮 Wins: ${player.gameWins}\n\n`;
                });

                return sock.sendMessage(chatId, { text: leaderboard }, { quoted: message });
            }

            // ====== POKEMON LEADERBOARD ======
            else if (type === "pokemon") {
                const players = await Player.find({})
                    .populate("familiaId", "name");

                // 🐾 Assuming your Player model stores Pokémon in `player.pokemonCollection` or `player.pokemon`
                const sorted = players.sort(
                    (a, b) => (b.pokemonCollection?.length || 0) - (a.pokemonCollection?.length || 0)
                );

                let leaderboard = `🐾 *POKÉMON LEADERBOARD*\n\n`;
                sorted.slice(0, 10).forEach((player, index) => {
                    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
                    const pokeCount = player.pokemonCollection?.length || 0;
                    leaderboard += `${medal} *${player.name}*\n`;
                    leaderboard += `   ⭐ Exp: ${player.exp || 0}\n`;
                    leaderboard += `   🏰 Familia: ${player.familiaId?.name || "None"}\n`;
                    leaderboard += `   💰 Shards: ${player.shards}\n`;
                    leaderboard += `   🐾 Pokémon: ${pokeCount}\n`;
                    leaderboard += `   🎮 Wins: ${player.gameWins}\n\n`;
                });

                return sock.sendMessage(chatId, { text: leaderboard }, { quoted: message });
            }

            // ====== FAMILIA LEADERBOARD ======
            else if (type === "familia") {
                const familias = await Familia.find({}).populate("members");
                const familiaStats = [];

                for (const familia of familias) {
                    const members = await Player.find({
                        userId: { $in: familia.members },
                    });
                    const totalExp = members.reduce(
                        (sum, m) => sum + (m.exp || 0),
                        0
                    );
                    familiaStats.push({
                        name: familia.name,
                        head: familia.head,
                        members: familia.members,
                        totalExp,
                    });
                }

                familiaStats.sort((a, b) => b.totalExp - a.totalExp);

                let leaderboard = `🏰 *FAMILIA LEADERBOARD*\n\n`;
                familiaStats.slice(0, 10).forEach((familia, index) => {
                    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
                    leaderboard += `${medal} *${familia.name}*\n`;
                    leaderboard += `   Total Exp: ${familia.totalExp.toLocaleString()} XP\n`;
                    leaderboard += `   Members: ${familia.members?.length}\n\n`;
                });

                return sock.sendMessage(chatId, { text: leaderboard }, { quoted: message });
            }

            // ====== DEFAULT (EXP / SHARDS / GAMES) ======
            const players = await Player.find({})
                .populate("familiaId", "name")
                .populate("collection")
                .sort({ [sortField]: -1 })
                .limit(10);

            let leaderboard = `${title}\n\n`;
            players.forEach((player, index) => {
                const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
                const pokeCount = player.pokemonCollection?.length || 0;
                leaderboard += `${medal} *${player.name}*\n`;
                leaderboard += `   ⭐ Exp: ${player.exp || 0}\n`;
                leaderboard += `   🏰 Familia: ${player.familiaId?.name || "None"}\n`;
                leaderboard += `   💰 Shards: ${player.shards}\n`;
                leaderboard += `   🎴 Cards: ${player.collection.length}\n`;
                leaderboard += `   🐾 Pokémon: ${pokeCount}\n`;
                leaderboard += `   🎮 Wins: ${player.gameWins}\n\n`;
            });

            await sock.sendMessage(chatId, { text: leaderboard }, { quoted: message });
        } catch (error) {
            console.error("Leaderboard error:", error);
            await sock.sendMessage(chatId, { text: "❌ Error fetching leaderboard." }, { quoted: message });
        }
    },
},


mods: {
    description: "Tag all moderators",
    usage: "mods",
    adminOnly: false,
    execute: async ({ chatId, sock, message }) => {
        try {
            const config = require("../config");
            const admins = config.get("admins") || [];

            // Load Config model
            const Config = require("../models/Config");
            const dbConfig = await Config.findOne({});
            const dbModerators = dbConfig?.moderators || [];

            // Merge and remove duplicates
            const allMods = [...new Set([...admins, ...dbModerators])];

            if (!allMods.length) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ No moderators found." },
                    { quoted: message }
                );
            }

            let modList = "🛡️ *MODERATORS*\n\n";
            allMods.forEach((mod) => {
                modList += `~ @${mod.split("@")[0]}\n`;
            });

            await sock.sendMessage(
                chatId,
                {
                    text: modList,
                    mentions: allMods,
                },
                { quoted: message }
            );
        } catch (error) {
            console.error("Mods command error:", error);
            await sock.sendMessage(
                chatId,
                { text: "❌ Error fetching moderators." },
                { quoted: message }
            );
        }
    },
},


    setpp: {
        description: "Set your profile picture",
        usage: "setpp <reply to image>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            try {
                // Get quoted or direct image
                const cited =
                    message.message?.extendedTextMessage?.contextInfo
                        ?.quotedMessage;
                const quotedInfo =
                    message.message?.extendedTextMessage?.contextInfo;
                const directImage =
                    message.message?.imageMessage ||
                    message.message?.documentMessage;

                if (!cited && !directImage) {
                    return await sock.sendMessage(
                        chatId,
                        { text: "❌ Please reply to an image with `!setpp`" },
                        { quoted: message },
                    );
                }

                let targetMessage;
                if (cited) {
                    targetMessage = { message: cited };
                    if (quotedInfo?.stanzaId) {
                        targetMessage.key = { id: quotedInfo.stanzaId };
                    }
                } else {
                    targetMessage = message;
                }

                // Download buffer
                const buffer = await downloadMediaMessage(
                    targetMessage,
                    "buffer",
                    {},
                );
                if (!buffer || !Buffer.isBuffer(buffer)) {
                    throw new Error("Failed to download image buffer");
                }

                // Upload to Catbox
                const form = new FormData();
                form.append("fileToUpload", buffer, {
                    filename: "profile.jpg",
                });
                form.append("reqtype", "fileupload");

                const catboxRes = await axios.post(
                    "https://catbox.moe/user/api.php",
                    form,
                    {
                        headers: form.getHeaders(),
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                        timeout: 30000,
                    },
                );

                if (
                    !catboxRes.data ||
                    !String(catboxRes.data).startsWith("http")
                ) {
                    throw new Error("Catbox did not return a valid URL");
                }

                const url = String(catboxRes.data);

                // Save to Player model
                let player = await Player.findOne({ userId: sender });
                if (!player) {
                    player = new Player({
                        userId: sender,
                        name: sender.split("@")[0],
                    });
                }
                player.profilePic = url;
                await player.save();

                await sock.sendMessage(
                    chatId,
                    { text: `✅ Profile picture updated!` },
                    { quoted: message },
                );
            } catch (err) {
                console.error("setpp error:", err);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Failed to set profile picture." },
                    { quoted: message },
                );
            }
        },
    },

    profile: {
        description: "Show your profile details",
        usage: "profile",
        aliases: ["p"],
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
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

                const player = await Player.findOne({
                    userId: target,
                }).populate("collection familiaId");
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                // Get profile picture
                let pfpUrl;
                if (player.profilePic && player.profilePic.startsWith("http")) {
                    pfpUrl = player.profilePic;
                } else {
                    try {
                        pfpUrl = await sock.profilePictureUrl(target, "image");
                    } catch {
                        pfpUrl = "https://i.waifu.pics/mJkPaVR.png";
                    }
                }

                // Download profile pic safely
                let buffer = null;
                try {
                    const fetch = require("node-fetch");
                    const res = await fetch(pfpUrl);
                    buffer = Buffer.from(await res.arrayBuffer());
                } catch (err) {
                    console.warn(
                        "Failed to fetch profile pic, using fallback:",
                        err.message,
                    );
                    const fetch = require("node-fetch");
                    const res = await fetch("https://i.waifu.pics/mJkPaVR.png");
                    buffer = Buffer.from(await res.arrayBuffer());
                }

                const totalCards = player.collection.length;
                const deckCards = player.deck.filter(
                    (card) => card !== null,
                ).length;

                // Get familia name
                let familiaName = "None";
                if (player.familiaId) {
                    const familiaCommands = require("./familia");
                    // Access familias from memoria (this is a simple approach)
                    familiaName = "Member"; // Fallback
                }

                const profileMsg =
                    `👤 *PROFILE*\n\n` +
                    `🏷️ *Name:* ${player.name}\n` +
                    `📊 *Level:* ${player.level}\n` +
                    `⭐ *EXP:* ${player.exp.toLocaleString()}\n` +
                    `💰 *Shards:* ${player.shards.toLocaleString()}\n` +
                    `🎴 *Cards:* ${totalCards}\n` +
                    `🃏 *Deck:* ${deckCards}/12\n` +
                    `🐾 *Pokemon Count:* ${pokeCount}\n` +
                    `🏰 *Familia:* ${player.familiaId ? player.familiaId.name : "None"}\n` +
                    `🎮 *Game Wins:* ${player.gameWins || 0}\n` +
                    `📝 *Bio:* ${player.bio || "No bio set"}\n` +
                    `🎭 *Character:* ${player.characterName || "Not set"}`;

                await sock.sendMessage(
                    chatId,
                    {
                        image: buffer,
                        caption: profileMsg,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Profile error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching profile." },
                    { quoted: message },
                );
            }
        },
    },

    setbio: {
        description: "Set your profile bio",
        usage: "setbio <bio_text>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !setbio <bio_text>" },
                    { quoted: message },
                );
            }

            try {
                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                const newBio = args.join(" ");
                if (newBio.length > 150) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Bio must be 150 characters or less!" },
                        { quoted: message },
                    );
                }

                player.bio = newBio;
                await player.save();

                await sock.sendMessage(
                    chatId,
                    {
                        text: `✅ Bio updated successfully!\n📝 *New Bio:* ${newBio}`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("SetBio error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error updating bio." },
                    { quoted: message },
                );
            }
        },
    },

    character: {
        description: "Show random Character",
        usage: "character",
        aliases: ["char"],
        adminOnly: false,
        execute: async ({ chatId, sock, message }) => {
            const characters = await getCharacters();

            // Pick random character
            const character =
                characters[Math.floor(Math.random() * characters.length)];

            // Save to group as lastCharacter
            const group = await Group.findOneAndUpdate(
                { groupId: chatId },
                {
                    $set: {
                        lastCharacter: {
                            id: character.id,
                            slug: character.slug,
                            name: character.name,
                            romaji_name: character.romaji_name,
                            display_picture: character.display_picture,
                            description: character.description,
                            appearances: character.appearances,
                            url: character.url,
                        },
                    },
                },
                { new: true, upsert: true },
            );

            // Format caption
            const appearances =
                character.appearances?.map((a) => a.name).join(", ") ||
                "Unknown";
            const caption =
                `Name: *${character.name}*\n` +
                `Appearances: ${appearances}\n\n` +
                `Description: ${character.description.slice(0, 400)}...\n`;

            // Send message
            await sock.sendMessage(
                chatId,
                {
                    image: { url: character.display_picture },
                    caption,
                },
                { quoted: message },
            );
        },
    },

    addcharacter: {
        description: "Set your Character",
        usage: "addcharacter",
        aliases: ["addchar"],
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            // Get group last character
            const group = await Group.findOne({ groupId: chatId });
            if (!group || !group.lastCharacter) {
                return sock.sendMessage(
                    chatId,
                    {
                        text: "❌ No character has been summoned yet. Use *!character* first.",
                    },
                    { quoted: message },
                );
            }

            const character = group.lastCharacter;

            // Check if taken
            const existingOwner = await Player.findOne({
                character: character.id,
            });
            if (existingOwner) {
                return sock.sendMessage(
                    chatId,
                    { text: `❌ *${character.name}* is already taken.` },
                    { quoted: message },
                );
            }

            // Assign to player
            await Player.findOneAndUpdate(
                { userId: sender },
                { characterID: character.id, characterName: character.name },
                { new: true, upsert: true },
            );

            await sock.sendMessage(
                chatId,
                { text: `✅ You claimed *${character.name}*!` },
                { quoted: message },
            );
        },
    },

    removecharacter: {
        description: "Remove your Character",
        usage: "removecharacter",
        aliases: ["removechar", "delchar"],
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            const player = await Player.findOne({ userId: sender });
            if (!player || !player.character) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ You don’t have any character to remove." },
                    { quoted: message },
                );
            }

            const oldCharId = player.character;
            const characters = await getCharacters();
            const oldChar =
                characters.find((c) => c.id === oldCharId)?.name || oldCharId;

            await Player.updateOne(
                { userId: sender },
                { $set: { character: "" } },
            );

            await sock.sendMessage(
                chatId,
                { text: `✅ You released *${oldChar}*.` },
                { quoted: message },
            );
        },
    },
};

module.exports = coreCommands;
