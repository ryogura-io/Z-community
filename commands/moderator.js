const Player = require("../models/Player");
const Group = require("../models/Group");
const Config = require("../models/Config");
const config = require("../config");
const eCardModel = require("../models/eCard");
const { sendCard, createCardGrid } = require("../utils/deckHelper");

const moderatorCommands = {
    ban: {
        description: "Ban a user from using the bot",
        usage: "ban (reply to user)",
        adminOnly: true,
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
                    { text: "❌ Reply to a user to ban them!" },
                    { quoted: message },
                );
            }

            try {
                const player = await Player.findOne({ userId: targetUser });
                if (player) {
                    player.isBanned = true;
                    await player.save();
                }

                await sock.sendMessage(
                    chatId,
                    { text: `🚫 User banned from bot!` },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Ban error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error banning user." },
                    { quoted: message },
                );
            }
        },
    },

    unban: {
        description: "Unban a user",
        usage: "unban (reply to user)",
        adminOnly: true,
        execute: async ({ sender, chatId, message, bot, sock }) => {
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
                    { text: "❌ Reply to a user to unban them!" },
                    { quoted: message },
                );
            }

            try {
                const player = await Player.findOne({ userId: targetUser });
                if (player) {
                    player.isBanned = false;
                    await player.save();
                }

                await sock.sendMessage(
                    chatId,
                    { text: `✅ User unbanned!` },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Unban error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error unbanning user." },
                    { quoted: message },
                );
            }
        },
    },

    enable: {
        description: "Enable the bot in current group",
        usage: "enable",
        adminOnly: true,
        execute: async ({ chatId, bot, sock, message }) => {
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
                        console.log(
                            "Could not fetch group metadata:",
                            metaError,
                        );
                    }
                }

                await group.save();

                await sock.sendMessage(
                    chatId,
                    { text: "✅ Bot has been *enabled* in this group!" },
                    { quoted: message },
                );
            } catch (err) {
                console.error("Enable error:", err);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error enabling bot in this group." },
                    { quoted: message },
                );
            }
        },
    },

    disable: {
        description: "Disable the bot in current group",
        usage: "disable",
        adminOnly: true,
        execute: async ({ chatId, sock, message }) => {
            try {
                let group = await Group.findOne({ groupId: chatId });

                if (!group) {
                    group = new Group({ groupId: chatId, status: "disabled" });
                } else {
                    group.status = "disabled";
                }

                await group.save();

                await sock.sendMessage(
                    chatId,
                    { text: "🚫 Bot has been *disabled* in this group!" },
                    { quoted: message },
                );
            } catch (err) {
                console.error("Disable error:", err);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error disabling bot in this group." },
                    { quoted: message },
                );
            }
        },
    },

    spawn: {
        description: "Enable/disable card spawning in group",
        usage: "spawn <yes/no>",
        adminOnly: true,
        execute: async ({ chatId, args, bot, message, sock }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !spawn <yes/no>" },
                    { quoted: message },
                );
            }

            try {
                const enable = args[0].toLowerCase() === "yes";

                let group = await Group.findOne({ groupId: chatId });
                if (!group) {
                    group = new Group({
                        groupId: chatId,
                        spawn: enable ? "enabled" : "disabled",
                    });
                } else {
                    group.spawn = enable ? "enabled" : "disabled";
                }

                await group.save();

                if (enable) {
                    await sock.sendMessage(
                        chatId,
                        { text: "✅ Card spawning enabled in this group!" },
                        { quoted: message },
                    );
                } else {
                    await sock.sendMessage(
                        chatId,
                        { text: "🚫 Card spawning disabled in this group!" },
                        { quoted: message },
                    );
                }
            } catch (error) {
                console.error("Spawn command error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error updating spawn settings." },
                    { quoted: message },
                );
            }
        },
    },

    removecard: {
        description: "Remove a card from user's deck",
        usage: "removecard (reply to user) <deck_number>",
        aliases: ["rc"],
        adminOnly: true,
        execute: async ({ sender, chatId, message, args, sock }) => {
            if (!args[0] || isNaN(args[0])) {
                return sock.sendMessage(
                    chatId,
                    {
                        text: "❌ Usage: !removecard (reply to user) <deck_number>",
                    },
                    { quoted: message },
                );
            }

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
                    { text: "❌ Reply to a user!" },
                    { quoted: message },
                );
            }

            try {
                const deckPosition = parseInt(args[0]) - 1;
                const player = await Player.findOne({ userId: targetUser });

                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ User not registered!" },
                        { quoted: message },
                    );
                }

                if (deckPosition < 0 || deckPosition >= 12) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Deck position must be 1-12!" },
                        { quoted: message },
                    );
                }

                if (!player.deck[deckPosition]) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ No card at that position!" },
                        { quoted: message },
                    );
                }

                player.deck[deckPosition] = null; // set to null

                // Compact deck by shifting cards left to remove gaps
                const compactedDeck = player.deck.filter(
                    (card) => card !== null,
                );
                player.deck = [
                    ...compactedDeck,
                    ...Array(12 - compactedDeck.length).fill(null),
                ];

                await player.save();

                await sock.sendMessage(
                    chatId,
                    {
                        text: `✅ Card removed from user's deck position ${args[0]}!`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Remove card error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error removing card." },
                    { quoted: message },
                );
            }
        },
    },

    startslot: {
        description: "Open slot for familia members",
        usage: "startslot <familia_name>",
        adminOnly: true,
        execute: async ({ chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !startslot <familia_name>" },
                    { quoted: message },
                );
            }

            try {
                const familiaName = args.join(" ");
                const Familia = require("../models/Familia");
                const Group = require("../models/Group");

                // Update familia slot status
                const familia = await Familia.findOne({
                    name: { $regex: new RegExp("^" + familiaName + "$", "i") },
                });
                if (!familia) {
                    return sock.sendMessage(
                        chatId,
                        { text: `❌ Familia '${familiaName}' not found!` },
                        { quoted: message },
                    );
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

                await sock.sendMessage(
                    chatId,
                    {
                        text: `🎰 Slots opened for familia *${familiaName}* in this group!`,
                    },
                    { quoted: message },
                );

                // Auto-disable after 5 minutes if still enabled
            setTimeout(async () => {
                try {
                    const updatedFamilia = await Familia.findById(familia._id);
                    const updatedGroup = await Group.findOne({ groupId: chatId });

                    if (updatedFamilia?.slot === "enabled") {
                        updatedFamilia.slot = "disabled";
                        await updatedFamilia.save();
                    }

                    if (updatedGroup?.slot === "enabled") {
                        updatedGroup.slot = "disabled";
                        await updatedGroup.save();
                    }

                    // Notify group if they were still open
                    if (
                        updatedFamilia?.slot === "disabled" ||
                        updatedGroup?.slot === "disabled"
                    ) {
                        await sock.sendMessage(chatId, {
                            text: `⏰ Slots for familia *${familiaName}* have been automatically closed after 5 minutes.`,
                        });
                    }
                } catch (err) {
                    console.error("Auto disable slot error:", err);
                }
            }, 5 * 60 * 1000); // 5 minutes
            } catch (error) {
                console.error("StartSlot error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error enabling slots." },
                    { quoted: message },
                );
            }
        },
    },

    endslot: {
        description: "Close slot for familia",
        usage: "endslot <familia_name>",
        adminOnly: true,
        execute: async ({ chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !endslot <familia_name>" },
                    { quoted: message },
                );
            }

            try {
                const familiaName = args.join(" ");
                const Familia = require("../models/Familia");
                const Group = require("../models/Group");

                // Update familia slot status
                const familia = await Familia.findOne({
                    name: { $regex: new RegExp("^" + familiaName + "$", "i") },
                });
                if (!familia) {
                    return sock.sendMessage(
                        chatId,
                        { text: `❌ Familia '${familiaName}' not found!` },
                        { quoted: message },
                    );
                }

                familia.slot = "disabled";
                await familia.save();

                // Also disable slots in current group
                let group = await Group.findOne({ groupId: chatId });
                if (group) {
                    group.slot = "disabled";
                    await group.save();
                }

                await sock.sendMessage(
                    chatId,
                    {
                        text: `🎰 Slots closed for familia *${familiaName}* in this group!`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("EndSlot error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error disabling slots." },
                    { quoted: message },
                );
            }
        },
    },

    summon: {
        description: "Force spawn a card immediately in current group",
        usage: "summon [url|name]",
        aliases: ["summon"],
        adminOnly: true,
        execute: async ({ chatId, args, bot, sock, msgQueue, message }) => {
            try {
                if (!chatId.endsWith("@g.us")) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ This command only works in groups!" },
                        { quoted: message },
                    );
                }

                const spawnManager = require("../spawnManager.js");

                const arg = args.length > 0 ? args.join(" ") : null;
                const success = await spawnManager.forceSpawnCard(
                    sock,
                    msgQueue,
                    chatId,
                    arg,
                );

                if (success) {
                    await sock.sendMessage(
                        chatId,
                        { text: "⚡ Card summoned successfully!" },
                        { quoted: message },
                    );
                } else {
                    await sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Failed to spawn card (card not found or requirements not met).",
                        },
                        { quoted: message },
                    );
                }
            } catch (error) {
                console.error("Force spawn error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error force spawning card." },
                    { quoted: message },
                );
            }
        },
    },

    cardinfo: {
        description: "View all players currently owning a particular card",
        usage: "cardinfo <cardname> - <tier>",
        aliases: ["ci"],
        adminOnly: true,
        execute: async ({ chatId, args, bot, sock, message }) => {
            if (args.length < 3 || !args.includes("-")) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !cardinfo <cardname> - <tier>" },
                    { quoted: message },
                );
            }

            try {
                const inputText = args.join(" ");
                const [cardName, tier] = inputText
                    .split(" - ")
                    .map((s) => s.trim());

                if (!cardName || !tier) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Usage: !cardinfo <cardname> - <tier>" },
                        { quoted: message },
                    );
                }

                const Card = require("../models/Card");
                const Player = require("../models/Player");

                // Find the card
                const card = await Card.findOne({
                    name: { $regex: new RegExp("^" + cardName + "$", "i") },
                    tier: tier,
                });

                if (!card) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: `❌ Card '${cardName} [${tier}]' not found in database!`,
                        },
                        { quoted: message },
                    );
                }

                // Find all players who own this card
                const playersWithCard = await Player.find({
                    $or: [
                        { collection: card._id },
                        { deck: card._id },
                        { secondaryDeck: card._id },
                    ],
                });

                if (playersWithCard.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: `📄 *Card Info: ${card.name} [${card.tier}]*\n\n❌ No players currently own this card.`,
                        },
                        { quoted: message },
                    );
                }

                let infoMsg = `📄 *Card Info: ${card.name} [${card.tier}]*\n\n👥 *Owners (${playersWithCard.length}):**\n\n`;

                playersWithCard.forEach((player, index) => {
                    // Count copies
                    const deckCopies = player.deck.filter(
                        (id) => id && id.toString() === card._id.toString(),
                    ).length;
                    const collectionCopies = player.collection.filter(
                        (id) => id.toString() === card._id.toString(),
                    ).length;
                    const secondaryDeckCopies = player.secondaryDeck.filter(
                        (id) => id && id.toString() === card._id.toString(),
                    ).length;
                    const totalCopies =
                        deckCopies + collectionCopies + secondaryDeckCopies;

                    infoMsg += `${index + 1}. *${player.name}* - ${totalCopies} copies\n`;
                });

                await sock.sendMessage(
                    chatId,
                    { text: infoMsg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("CardInfo error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching card information." },
                    { quoted: message },
                );
            }
        },
    },

    stop: {
        description: "Disable a command globally",
        usage: "stop <command_name>",
        adminOnly: true,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !stop <command_name>" },
                    { quoted: message },
                );
            }

            const commandName = args[0].toLowerCase();

            try {
                let configDoc = await Config.findOne({});
                if (!configDoc) {
                    configDoc = new Config({ disabledCommands: [commandName] });
                } else {
                    if (!configDoc.disabledCommands) {
                        configDoc.disabledCommands = [];
                    }
                    if (configDoc.disabledCommands.includes(commandName)) {
                        return sock.sendMessage(
                            chatId,
                            {
                                text: `❌ Command '${commandName}' is already disabled!`,
                            },
                            { quoted: message },
                        );
                    }
                    configDoc.disabledCommands.push(commandName);
                }

                await configDoc.save();
                await sock.sendMessage(
                    chatId,
                    {
                        text: `🚫 Command '${commandName}' has been disabled globally!`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Stop command error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error disabling command." },
                    { quoted: message },
                );
            }
        },
    },

    show: {
        description: "View all cards of a specific series sorted by tier",
        usage: "show <series_name>",
        adminOnly: true,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !show <series_name>" },
                    { quoted: message },
                );
            }

            const seriesName = args.join(" ");

            try {
                const Card = require("../models/Card");
                const cards = await Card.find({
                    series: { $regex: new RegExp(seriesName, "i") },
                }).sort({ tier: -1 }); // Sort by tier (ascending order for tiers like 1, 2, 3, S)

                if (cards.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        { text: `❌ No cards found for series: ${seriesName}` },
                        { quoted: message },
                    );
                }

                // Group cards by tier
                const tierGroups = {};
                cards.forEach((card) => {
                    if (!tierGroups[card.tier]) {
                        tierGroups[card.tier] = [];
                    }
                    tierGroups[card.tier].push(card);
                });

                let response = `🎴 *Cards in "${seriesName}" series:*\n\n`;

                // Sort tiers (S, then 1, 2, 3, etc.)
                const sortedTiers = Object.keys(tierGroups).sort((a, b) => {
                    if (a === "S") return -1;
                    if (b === "S") return 1;
                    return parseInt(a) - parseInt(b);
                });

                sortedTiers.forEach((tier) => {
                    response += `⭐ *Tier ${tier}:*\n`;
                    tierGroups[tier].forEach((card) => {
                        response += `• ${card.name} (by ${card.maker})\n`;
                    });
                    response += "\n";
                });

                response += `**Total: ${cards.length} cards**`;

                await sock.sendMessage(
                    chatId,
                    { text: response },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Show command error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching cards." },
                    { quoted: message },
                );
            }
        },
    },

    resume: {
        description: "Re-enable a previously disabled command globally",
        usage: "resume <command_name>",
        adminOnly: true,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !resume <command_name>" },
                    { quoted: message },
                );
            }

            const commandName = args[0].toLowerCase();

            try {
                let configDoc = await Config.findOne({});
                if (!configDoc || !configDoc.disabledCommands) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: `❌ Command '${commandName}' was never disabled!`,
                        },
                        { quoted: message },
                    );
                }

                if (!configDoc.disabledCommands.includes(commandName)) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: `❌ Command '${commandName}' is not disabled!`,
                        },
                        { quoted: message },
                    );
                }

                // Remove the command from disabled list
                configDoc.disabledCommands = configDoc.disabledCommands.filter(
                    (cmd) => cmd !== commandName,
                );

                await configDoc.save();

                await sock.sendMessage(
                    chatId,
                    {
                        text: `✅ Command '${commandName}' has been re-enabled globally!`,
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Resume command error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error re-enabling command." },
                    { quoted: message },
                );
            }
        },
    },

    timeout: {
        description: "Timeout a user for specified duration",
        usage: "timeout <duration_in_minutes> (reply to user)",
        adminOnly: true,
        execute: async ({ sender, chatId, args, message, sock }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !timeout <minutes> (reply to user)" },
                    { quoted: message },
                );
            }

            const duration = parseInt(args[0]);
            if (isNaN(duration) || duration <= 0) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Please provide a valid duration in minutes!" },
                    { quoted: message },
                );
            }

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
                    { text: "❌ Reply to a user to timeout them!" },
                    { quoted: message },
                );
            }

            try {
                const timeoutUntil = new Date(
                    Date.now() + duration * 60 * 1000,
                );

                let player = await Player.findOne({ userId: targetUser });
                if (!player) {
                    player = new Player({
                        userId: targetUser,
                        name: targetUser.split("@")[0],
                    });
                }

                player.timeout = timeoutUntil;
                await player.save();

                await sock.sendMessage(
                    chatId,
                    {
                        text: `⏰ User @${targetUser.split("@")[0]} has been timed out for ${duration} minutes!\nTimeout expires: ${timeoutUntil.toLocaleString()}`,
                        mentions: [targetUser],
                    },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Timeout command error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error setting timeout." },
                    { quoted: message },
                );
            }
        },
    },

    addecard: {
        description: "Add an event card to the eDeck using its URL",
        usage: "addecard <url>",
        aliases: ["addeck"],
        adminOnly: true,
        execute: async ({ chatId, sock, message, args }) => {
            if (!args[0])
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !addecard <url>" },
                    { quoted: message },
                );

            try {
                const url = args[0];
                const eCard = await eCardModel.findOne({ url });

                if (!eCard)
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Event card not found!" },
                        { quoted: message },
                    );

                let config = await Config.findOne({});
                if (!config) config = new Config();

                if (config.eDeck.includes(eCard._id)) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ This card is already in the eDeck!" },
                        { quoted: message },
                    );
                }

                config.eDeck.push(eCard._id);
                await config.save();

                return sock.sendMessage(
                    chatId,
                    { text: `✅ Added *${eCard.name}* to the eDeck!` },
                    { quoted: message },
                );
            } catch (err) {
                console.error(err);
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Error adding event card to eDeck." },
                    { quoted: message },
                );
            }
        },
    },

    edeck: {
        description: "Show the eDeck of event cards",
        usage: "edeck [index]",
        aliases: ["eventdeck"],
        adminOnly: false,
        execute: async ({ chatId, sock, message, args }) => {
            try {
                const Config = require("../models/Config");
                const config = await Config.findOne({}).populate("eDeck");

                if (!config || !config.eDeck || config.eDeck.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        { text: "📭 The eDeck is empty!" },
                        { quoted: message },
                    );
                }

                const deck = config.eDeck;
                const deckHelper = require("../utils/deckHelper");

                // Single card view
                if (args[0] && !isNaN(args[0])) {
                    const idx = parseInt(args[0]) - 1;
                    if (!deck[idx]) {
                        return sock.sendMessage(
                            chatId,
                            { text: "❌ No card at that position!" },
                            { quoted: message },
                        );
                    }

                    const card = deck[idx];
                    const caption =
                        `┌──「 *CARD DETAILS* 」\n\n` +
                        `📜 *Name:* ${card.name}\n` +
                        `⭐ *Tier:* ${card.tier}\n` +
                        `👨‍🎨 *Maker:* ${card.maker}`;

                    return deckHelper.sendCard(
                        sock,
                        chatId,
                        message,
                        card,
                        caption,
                    );
                }

                // Grid view
                const imgBuffer = await deckHelper.createCardGrid(
                    deck.filter(Boolean),
                );

                const readMore = String.fromCharCode(8206).repeat(4001);
                let deckMsg = `🃏 *Event Deck*\n\n${readMore}`;

deck.forEach((card, i) => {
                    if (card) {
                        deckMsg += `🎴 *${i + 1}.* ${card.name}\n     Event: ${card.event}\n     Tier: ${card.tier}\n\n`;
                    }
                });

                deckMsg += `\n💡 Use \`!edeck <number>\` to see individual cards`;

                return sock.sendMessage(
                    chatId,
                    { image: imgBuffer, caption: deckMsg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("eDeck error:", error);
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Error displaying eDeck." },
                    { quoted: message },
                );
            }
        },
    },

    setseries: {
        description: "Set a new series for a card in the eDeck",
        usage: "setseries <edeck_index> <new_series_name>",
        adminOnly: true,
        execute: async ({ chatId, sock, message, args }) => {
            const Config = require("../models/Config");
const eCard = require("../models/eCard");
            try {
                // Check args
                if (args.length < 2) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Usage: !setseries <edeck_index> <new_series_name>" },
                        { quoted: message },
                    );
                }

                const index = parseInt(args[0]) - 1;
                const newSeries = args.slice(1).join(" ").trim();

                if (isNaN(index) || index < 0) {
                    return sock.sendMessage(
                        chatId,
                        { text: "⚠️ Please provide a valid eDeck index number." },
                        { quoted: message },
                    );
                }

                // Get config and populate eDeck
                const config = await Config.findOne({}).populate("eDeck");
                if (!config || !config.eDeck || !config.eDeck[index]) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ No card found at that index in the eDeck." },
                        { quoted: message },
                    );
                }

                const card = config.eDeck[index];

                // Update the card in the eventCards DB
                await eCard.findByIdAndUpdate(
                    card._id,
                    { $set: { series: newSeries } },
                    { new: true }
                );

                await sock.sendMessage(
                    chatId,
                    {
                        text: `✅ Updated *${card.name}*'s series to *${newSeries}*!`,
                    },
                    { quoted: message },
                );
            } catch (err) {
                console.error("setseries error:", err);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Failed to update card series." },
                    { quoted: message },
                );
            }
        },
    },
};

module.exports = moderatorCommands;
