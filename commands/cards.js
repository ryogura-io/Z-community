const Player = require("../models/Player");
const Card = require("../models/Card");
const axios = require("axios");
const spawnManager = require("../spawnManager");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

// Helper function to convert media to MP4
async function convertToMp4(inputBuffer, outputPath) {
    return new Promise((resolve, reject) => {
        const tempInputPath = path.join(
            __dirname,
            "..",
            "temp_input_" + Date.now(),
        );

        // Write buffer to temporary file
        fs.writeFileSync(tempInputPath, inputBuffer);

        ffmpeg(tempInputPath)
            .toFormat("mp4")
            .videoCodec("libx264")
            .audioCodec("aac")
            .outputOptions([
                "-movflags +faststart",
                "-pix_fmt yuv420p",
                "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2", // Ensure even dimensions
            ])
            .on("end", () => {
                fs.unlinkSync(tempInputPath); // Clean up temp input file
                resolve();
            })
            .on("error", (err) => {
                if (fs.existsSync(tempInputPath)) {
                    fs.unlinkSync(tempInputPath); // Clean up on error
                }
                reject(err);
            })
            .save(outputPath);
    });
}

const cardCommands = {
    claim: {
        description: "Claim the currently spawned card using captcha",
        usage: "claim <captcha>",
        aliases: ["c"],
        adminOnly: false,
        execute: async ({
            sender,
            chatId,
            args,
            bot,
            sock,
            msgQueue,
            message,
        }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !claim <captcha>" },
                    { quoted: message },
                );
            }

            try {
                const activeSpawn = spawnManager.getActiveSpawn(chatId);
                if (!activeSpawn) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ No active card spawn in this group!" },
                        { quoted: message },
                    );
                }

                if (
                    args[0].toUpperCase() !== activeSpawn.captcha.toUpperCase()
                ) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Incorrect captcha!" },
                        { quoted: message },
                    );
                }

                let player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please register first using !register <name>",
                        },
                        { quoted: message },
                    );
                }

                // ✅ Check shards
                const cardPrice =
                    spawnManager.tierConfig[activeSpawn.card.tier]?.price ||
                    100;
                if (player.shards < cardPrice) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: `❌ You need *${cardPrice} shards* to claim this card!\n💰 Your shards: ${player.shards}`,
                        },
                        { quoted: message },
                    );
                }

                // Deduct shards
                player.shards -= cardPrice;

                // Find empty deck slot or add to collection
                const emptySlot = player.deck.findIndex(
                    (slot) => slot === null,
                );
                if (emptySlot !== -1) {
                    player.deck[emptySlot] = activeSpawn.card._id;
                } else {
                    player.collection.push(activeSpawn.card._id);
                }

                player.exp += 50;
                await player.save();

                spawnManager.removeActiveSpawn(chatId);

                // ✅ Now define claimMsg BEFORE sending
                const claimMsg =
                    `🎉 *Card claimed by ${player.name}!*\n\n` +
                    `🎴 Card: *${activeSpawn.card.name}* [Tier ${activeSpawn.card.tier}] \n` +
                    `🎯 Added to: ${emptySlot !== -1 ? `Deck slot ${emptySlot + 1}` : "Collection"}\n`;

                await sock.sendMessage(
                    chatId,
                    { text: claimMsg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Claim error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error claiming card." },
                    { quoted: message },
                );
            }
        },
    },

    collection: {
        description: "Display user cards collection in numerical order",
        usage: "collection [number]",
        aliases: ["coll"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("collection");
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                if (args[0] && !isNaN(args[0])) {
                    const cardIndex = parseInt(args[0]) - 1;
                    if (
                        cardIndex < 0 ||
                        cardIndex >= player.collection.length
                    ) {
                        return sock.sendMessage(
                            chatId,
                            { text: "❌ Invalid card number!" },
                            { quoted: message },
                        );
                    }

                    const card = player.collection[cardIndex];
                    const cardMsg =
                        `┌──「 *CARD DETAILS* 」\n\n` +
                        `📜 *Name:* ${card.name}\n` +
                        `⭐ *Tier:* ${card.tier}\n` +
                        `🎭 *Series:* ${card.series}\n` +
                        `👨‍🎨 *Maker:* ${card.maker}`;

                    // Check if tier 6 or S card with video format
                    if (
                        (card.tier === "6" || card.tier === "S") &&
                        (card.img.endsWith(".webm") ||
                            card.img.endsWith(".gif"))
                    ) {
                        try {
                            const mediaBuffer = (
                                await axios.get(card.img, {
                                    responseType: "arraybuffer",
                                })
                            ).data;
                            const outputPath = path.join(
                                __dirname,
                                "..",
                                `temp_output_${Date.now()}.mp4`,
                            );

                            await convertToMp4(mediaBuffer, outputPath);
                            const videoBuffer = fs.readFileSync(outputPath);
                            fs.unlinkSync(outputPath); // Clean up

                            await sock.sendMessage(
                                chatId,
                                {
                                    video: videoBuffer,
                                    caption: cardMsg,
                                    mimetype: "video/mp4",
                                    gifPlayback: true,
                                },
                                { quoted: message },
                            );
                        } catch (conversionError) {
                            console.error(
                                "Video conversion error:",
                                conversionError,
                            );
                            // Fallback to sending as image
                            const imgBuffer = (
                                await axios.get(card.img, {
                                    responseType: "arraybuffer",
                                })
                            ).data;
                            await sock.sendMessage(
                                chatId,
                                {
                                    image: imgBuffer,
                                    caption: cardMsg,
                                },
                                { quoted: message },
                            );
                        }
                    } else {
                        const imgBuffer = (
                            await axios.get(card.img, {
                                responseType: "arraybuffer",
                            })
                        ).data;
                        await sock.sendMessage(
                            chatId,
                            {
                                image: imgBuffer,
                                caption: cardMsg,
                            },
                            { quoted: message },
                        );
                    }
                } else {
                    const totalCards = player.collection.length;
                    if (totalCards === 0) {
                        return sock.sendMessage(
                            chatId,
                            { text: "📦 Your collection is empty!" },
                            { quoted: message },
                        );
                    }

                    let collectionMsg = `🎴 *${player.name}'s Collection (${totalCards} cards)*\n\n`;
                    player.collection.forEach((card, index) => {
                        collectionMsg += `*${index + 1}. ${card.name}* [${card.tier}]\n    Series: ${card.series}\n`;
                    });

                    await sock.sendMessage(
                        chatId,
                        { text: collectionMsg },
                        { quoted: message },
                    );
                }
            } catch (error) {
                console.error("Collection error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching collection." },
                    { quoted: message },
                );
            }
        },
    },

    cards: {
        description: "Display user cards sorted by tier",
        usage: "cards",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            try {
                const player = await Player.findOne({ userId: sender })
                    .populate("collection")
                    .populate("deck");

                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                // Merge collection + deck into one array
                let allCards = [...player.collection, ...player.deck];

                if (allCards.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        { text: "📦 Your collection is empty!" },
                        { quoted: message },
                    );
                }

                // Define tier display order (higher first)
                const tierOrder = ["S", "6", "5", "4", "3", "2", "1"];

                // Group cards by tier
                const grouped = {};
                for (const t of tierOrder) grouped[t] = [];
                allCards.forEach((card) => {
                    if (grouped[card.tier]) grouped[card.tier].push(card);
                });

                // Build message
                let cardsMsg = `🎴 *${player.name}'s Cards* (${allCards.length} cards)\n\n`;

                for (const tier of tierOrder) {
                    const tierCards = grouped[tier];
                    if (tierCards.length === 0) continue; // skip empty tiers

                    cardsMsg += `⭐ *Tier ${tier}* (${tierCards.length})\n`;
                    tierCards.forEach((card, idx) => {
                        cardsMsg += `   ${idx + 1}. ${card.name}\n`;
                    });
                    cardsMsg += `\n`;
                }

                await sock.sendMessage(
                    chatId,
                    { text: cardsMsg.trim() },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Cards error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching cards." },
                    { quoted: message },
                );
            }
        },
    },

    mtd: {
        description: "Move cards from collection to deck",
        usage: "mtd <collection_numbers>",
        aliases: ["movetodeck"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    {
                        text: "❌ Usage: !mtd <collection_numbers> (e.g., !mtd 1 5 12)",
                    },
                    { quoted: message },
                );
            }

            try {
                // Only populate collection, keep deck raw with nulls
                const player = await Player.findOne({
                    userId: sender,
                }).populate("collection");
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                const cardNumbers = args
                    .map((arg) => parseInt(arg) - 1)
                    .filter((num) => !isNaN(num));

                let moved = 0;
                cardNumbers.sort((a, b) => b - a);

                for (const cardIndex of cardNumbers) {
                    if (cardIndex < 0 || cardIndex >= player.collection.length)
                        continue;

                    // find the first null slot in the deck
                    const emptySlot = player.deck.findIndex(
                        (slot) => slot === null,
                    );
                    if (emptySlot === -1) {
                        await sock.sendMessage(
                            chatId,
                            {
                                text: "⚠️ Deck is full! Some cards couldn't be moved.",
                            },
                            { quoted: message },
                        );
                        break;
                    }

                    const card = player.collection[cardIndex];
                    if (!card) continue;

                    player.deck[emptySlot] = card._id; // store only the ObjectId
                    player.collection.splice(cardIndex, 1);
                    moved++;
                }

                await player.save();
                await sock.sendMessage(
                    chatId,
                    { text: `✅ Moved ${moved} card(s) to deck!` },
                    { quoted: message },
                );
            } catch (error) {
                console.error("MTD error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error moving cards." },
                    { quoted: message },
                );
            }
        },
    },

    mtc: {
        description: "Move cards from deck to collection",
        usage: "mtc <deck_numbers> or mtc all",
        aliases: ["movetocoll"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !mtc <deck_numbers> or !mtc all" },
                    { quoted: message },
                );
            }

            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("deck");
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                let moved = 0;

                if (args[0].toLowerCase() === "all") {
                    // Move all non-empty cards
                    const cardsToMove = player.deck.filter(
                        (card) => card !== null,
                    );
                    moved = cardsToMove.length;

                    player.collection.push(...cardsToMove);
                    player.deck = Array(12).fill(null); // reset deck back to 12 empty slots
                } else {
                    const deckNumbers = args
                        .map((arg) => parseInt(arg) - 1)
                        .filter((num) => !isNaN(num) && num >= 0 && num < 12);

                    // Sort deck numbers in descending order to avoid index issues when removing
                    deckNumbers.sort((a, b) => b - a);

                    for (const deckIndex of deckNumbers) {
                        if (player.deck[deckIndex]) {
                            player.collection.push(player.deck[deckIndex]);
                            player.deck[deckIndex] = null; // set to null, maintain 12 slots
                            moved++;
                        }
                    }

                    // Compact deck by shifting cards left to remove gaps
                    const compactedDeck = player.deck.filter(
                        (card) => card !== null,
                    );
                    player.deck = [
                        ...compactedDeck,
                        ...Array(12 - compactedDeck.length).fill(null),
                    ];
                }

                await player.save();
                await sock.sendMessage(
                    chatId,
                    { text: `✅ Moved ${moved} card(s) to collection!` },
                    { quoted: message },
                );
            } catch (error) {
                console.error("MTC error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error moving cards." },
                    { quoted: message },
                );
            }
        },
    },

    collector: {
        description: "Display top 3 players with most cards in a series",
        usage: "collector <series_name>",
        aliases: ["cltr"],
        adminOnly: false,
        execute: async ({ chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !collector <series_name>" },
                    { quoted: message },
                );
            }

            try {
                const seriesName = args.join(" ");
                const players = await Player.find({}).populate("collection");

                const collectors = players
                    .map((player) => {
                        const seriesCards = player.collection.filter((card) =>
                            card.series
                                .toLowerCase()
                                .includes(seriesName.toLowerCase()),
                        );
                        return {
                            name: player.name,
                            count: seriesCards.length,
                        };
                    })
                    .filter((collector) => collector.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3);

                if (collectors.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        {
                            text: `📦 No collectors found for series: ${seriesName}`,
                        },
                        { quoted: message },
                    );
                }

                let collectorMsg = `🏆 *Top ${seriesName} Collectors*\n\n`;
                collectors.forEach((collector, index) => {
                    const medal =
                        index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
                    collectorMsg += `${medal} *${collector.name}* - ${collector.count} cards\n`;
                });

                await sock.sendMessage(
                    chatId,
                    { text: collectorMsg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Collector error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching collectors." },
                    { quoted: message },
                );
            }
        },
    },

    series: {
        description: "Show all possessed cards in a series by tier",
        usage: "series <series_name>",
        aliases: ["ss", "seriessearch"],
        adminOnly: false,
        execute: async ({ sender, message, chatId, args, bot, sock }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !series <series_name>" },
                    { quoted: message },
                );
            }

            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("collection deck");
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                const seriesName = args.join(" ");
                const collectionCards = player.collection || [];
                const deckCards = player.deck || [];

                // Tag location with index
                const allCards = [
                    ...collectionCards.map((c, i) => ({
                        ...c.toObject(),
                        location: `📦 Collection #${i + 1}`,
                    })),
                    ...deckCards
                        .map((c, i) =>
                            c
                                ? {
                                      ...c.toObject(),
                                      location: `📥 Deck #${i + 1}`,
                                  }
                                : null,
                        )
                        .filter((c) => c),
                ];

                const seriesCards = allCards.filter((card) =>
                    card.series
                        .toLowerCase()
                        .includes(seriesName.toLowerCase()),
                );

                if (seriesCards.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        { text: `📦 No cards found for series: ${seriesName}` },
                        { quoted: message },
                    );
                }

                const tierOrder = ["S", "6", "5", "4", "3", "2", "1"];
                const sortedCards = seriesCards.sort(
                    (a, b) =>
                        tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier),
                );

                let seriesMsg = `🎭 *${player.name}'s ${seriesName} Cards (${seriesCards.length})*\n\n`;
                sortedCards.forEach((card, index) => {
                    seriesMsg += `${index + 1}. ${card.name} (Tier ${card.tier})\n`;
                });

                await sock.sendMessage(
                    chatId,
                    { text: seriesMsg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Series error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error fetching series cards." },
                    { quoted: message },
                );
            }
        },
    },

    searchcard: {
        description: "Search for a card in your deck and collection",
        usage: "searchcard <card_name>",
        aliases: ["fc", "findcard"],
        adminOnly: false,
        execute: async ({ sender, message, chatId, args, bot, sock }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !searchcard <card_name>" },
                    { quoted: message },
                );
            }

            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("collection deck");
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                }

                const searchTerm = args.join(" ").toLowerCase();
                const collectionCards = player.collection || [];
                const deckCards = player.deck || [];

                // Tag location with index
                const allCards = [
                    ...collectionCards.map((c, i) => ({
                        ...c.toObject(),
                        location: `📦 Collection #${i + 1}`,
                    })),
                    ...deckCards
                        .map((c, i) =>
                            c
                                ? {
                                      ...c.toObject(),
                                      location: `📥 Deck #${i + 1}`,
                                  }
                                : null,
                        )
                        .filter((c) => c),
                ];

                const foundCards = allCards.filter((card) =>
                    card.name.toLowerCase().includes(searchTerm),
                );

                if (foundCards.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        { text: `🔍 No cards found matching: ${searchTerm}` },
                        { quoted: message },
                    );
                }

                let searchMsg = `🔍 *Search Results for "${searchTerm}" (${foundCards.length})*\n\n`;
                foundCards.slice(0, 10).forEach((card, index) => {
                    searchMsg += `*${index + 1}. ${card.name}* (Tier ${card.tier})\n    Location: ${card.location}\n`;
                });

                if (foundCards.length > 10) {
                    searchMsg += `\n... and ${foundCards.length - 10} more matches`;
                }

                await sock.sendMessage(
                    chatId,
                    { text: searchMsg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Search card error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error searching cards." },
                    { quoted: message },
                );
            }
        },
    },

    givecard: {
        description: "Give card(s) from your collection to another player",
        usage: "givecard <collection_numbers> <@user>",
        aliases: ["gc", "trade", "sendcard"],
        adminOnly: false,
        execute: async ({ sender, chatId, message, args, sock, bot }) => {
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
                    { text: "❌ Reply to a user to send them Card!" },
                    { quoted: message },
                );
            }

            try {
                const giver = await Player.findOne({ userId: sender }).populate(
                    "collection",
                );
                const receiver = await Player.findOne({
                    userId: targetUser,
                }).populate("collection");

                if (!giver)
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please register first!" },
                        { quoted: message },
                    );
                if (!receiver)
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ The mentioned user is not registered!" },
                        { quoted: message },
                    );

                // Convert args → indices (0-based) and sort descending
                const cardNumbers = args
                    .map((arg) => parseInt(arg) - 1)
                    .filter((num) => !isNaN(num))
                    .sort((a, b) => b - a); // descending

                let transferred = [];

                for (const cardIndex of cardNumbers) {
                    if (cardIndex < 0 || cardIndex >= giver.collection.length)
                        continue;

                    const card = giver.collection[cardIndex];
                    if (!card) continue;

                    // Remove from giver
                    giver.collection.splice(cardIndex, 1);

                    // Add to receiver
                    receiver.collection.push(card._id || card);

                    transferred.push(`${card.name} [${card.tier}]`);
                }

                if (transferred.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ No valid cards selected for transfer!" },
                        { quoted: message },
                    );
                }

                await giver.save();
                await receiver.save();

                const transferMsg =
                    `🎁 *Card Transfer Successful!*\n\n` +
                    `👤 From: ${giver.name}\n` +
                    `👥 To: ${receiver.name}\n` +
                    `🎴 Cards: ${transferred.join(", ")}`;

                await sock.sendMessage(
                    chatId,
                    { text: transferMsg },
                    { quoted: message },
                );
            } catch (error) {
                console.error("Givecard error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error transferring card(s)." },
                    { quoted: message },
                );
            }
        },
    },

    deck: {
        description: "Show your deck as a 4x3 grid image or specific card",
        usage: "deck [deck_number]",
        aliases: ["d"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("deck");
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                // If user requested a specific slot
                if (args[0] && !isNaN(args[0])) {
                    const cardIndex = parseInt(args[0]) - 1;
                    if (cardIndex < 0 || cardIndex >= 12) {
                        return bot.sendMessage(
                            chatId,
                            "❌ Deck position must be 1-12!",
                        );
                    }

                    const card = player.deck[cardIndex];
                    if (!card) {
                        return bot.sendMessage(
                            chatId,
                            `❌ No card at deck position ${args[0]}!`,
                        );
                    }

                    const cardMsg =
                        `🎴 *Deck Position ${args[0]}*\n\n` +
                        `📜 *Name:* ${card.name}\n` +
                        `⭐ *Tier:* ${card.tier}\n` +
                        `🎭 *Series:* ${card.series}\n` +
                        `👨‍🎨 *Maker:* ${card.maker}`;

                    const imgBuffer = (
                        await axios.get(card.img, {
                            responseType: "arraybuffer",
                        })
                    ).data;
                    return bot.sendImage(chatId, imgBuffer, cardMsg);
                }

                // Show deck as 4x3 grid image
                const deckCards = player.deck.filter(
                    (card) => card !== null && card !== undefined,
                );

                if (deckCards.length === 0) {
                    return bot.sendMessage(chatId, "❌ Your deck is empty!");
                }

                // Generate 4x3 grid image using sharp (more reliable)
                const sharp = require("sharp");
                const axios = require("axios");

                try {
                    // Create base image (800x600) with white background
                    const cardWidth = 230;
                    const cardHeight = 300;
                    const padding = 3;
                    const startX = 2;
                    const startY = 2;

                    // Create white background
                    const background = await sharp({
                        create: {
                            width: 710,
                            height: 910,
                            channels: 4,
                            background: { r: 255, g: 255, b: 255, alpha: 1 },
                        },
                    }).png();

                    const composite = [];

                    // Process each card slot (12 total)
                    for (let i = 0; i < 12; i++) {
                        const row = Math.floor(i / 3);
                        const col = i % 3;
                        const x = Math.round(
                            startX + col * (cardWidth + padding),
                        );
                        const y = Math.round(
                            startY + row * (cardHeight + padding),
                        );

                        const card = player.deck[i];

                        if (card) {
                            try {
                                // Download and process card image
                                const cardImgResponse = await axios.get(
                                    card.img,
                                    {
                                        responseType: "arraybuffer",
                                        timeout: 10000,
                                    },
                                );

                                // Resize card image to fill entire slot
                                const resizedCard = await sharp(
                                    Buffer.from(cardImgResponse.data),
                                )
                                    .resize(cardWidth, cardHeight, {
                                        fit: "cover",
                                    })
                                    .png()
                                    .toBuffer();

                                // Add card to composite
                                composite.push({
                                    input: resizedCard,
                                    top: y,
                                    left: x,
                                });
                            } catch (cardError) {
                                console.error(
                                    `Error loading card image for ${card.name}:`,
                                    cardError,
                                );

                                // Create gray placeholder for error
                                const errorSvg = `
                                    <svg width="${cardWidth}" height="${cardHeight}">
                                        <rect width="100%" height="100%" fill="#cccccc"/>
                                    </svg>
                                `;

                                const errorPlaceholder = await sharp(
                                    Buffer.from(errorSvg),
                                )
                                    .png()
                                    .toBuffer();

                                composite.push({
                                    input: errorPlaceholder,
                                    top: y,
                                    left: x,
                                });
                            }
                        } else {
                            // Empty slot - just leave it empty (white background shows through)
                        }
                    }

                    // Composite all elements and create final image
                    const imageBuffer = await background
                        .composite(composite)
                        .png()
                        .toBuffer();
                    let deckMsg = `🃏 *${player.name}'s Deck*\n\n`;

                    for (let i = 0; i < 12; i++) {
                        const card = player.deck[i];
                        if (card) {
                            deckMsg += `🎴 *${i + 1}.* ${card.name} — Tier ${card.tier}\n`;
                        }
                    }

                    deckMsg += `\n💡 Use !deck <number> to see individual cards`;
                    const caption = `🃏 *${player.name}'s Deck*\n📊 ${deckCards.length}/12 slots filled\n💡 Use !deck <number> to see individual cards`;

                    return bot.sendImage(chatId, imageBuffer, deckMsg);
                } catch (sharpError) {
                    console.error("Sharp deck generation error:", sharpError);

                    // Fallback to text-based deck display
                    let deckMsg = `🃏 *${player.name}'s Deck (${player.deck.filter((c) => c).length}/12 cards)*\n\n`;

                    for (let i = 0; i < 12; i++) {
                        const card = player.deck[i];
                        if (card) {
                            deckMsg += `🎴 *${i + 1}.* ${card.name} — Tier ${card.tier}\n`;
                        }
                    }

                    deckMsg += `\n💡 Use !deck <number> to see individual cards`;
                    return bot.sendMessage(chatId, deckMsg);
                }
            } catch (error) {
                console.error("Deck error:", error);
                await bot.sendMessage(chatId, "❌ Error fetching deck.");
            }
        },
    },

    sellcard: {
        description: "Put a card from your collection on sale in this group",
        usage: "sellcard <collectionindex> <price>",
        aliases: ["sell"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, isGroup }) => {
            try {
                if (!isGroup) {
                    return bot.sendMessage(
                        chatId,
                        "❌ Card selling is only available in groups!",
                    );
                }

                if (args.length !== 2) {
                    return bot.sendMessage(
                        chatId,
                        "❌ Usage: !sellcard <collectionindex> <price>\nExample: !sellcard 5 100",
                    );
                }

                const collectionIndex = parseInt(args[0]) - 1;
                const price = parseInt(args[1]);

                if (isNaN(collectionIndex) || collectionIndex < 0) {
                    return bot.sendMessage(
                        chatId,
                        "❌ Invalid collection index! Use a positive number.",
                    );
                }

                if (isNaN(price) || price < 1) {
                    return bot.sendMessage(
                        chatId,
                        "❌ Invalid price! Use a positive number.",
                    );
                }

                const Player = require("../models/Player");
                const CardSale = require("../models/CardSale");

                const player = await Player.findOne({
                    userId: sender,
                }).populate("collection");
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                if (collectionIndex >= player.collection.length) {
                    return bot.sendMessage(
                        chatId,
                        `❌ You only have ${player.collection.length} cards in your collection!`,
                    );
                }

                const cardToSell = player.collection[collectionIndex];
                if (!cardToSell) {
                    return bot.sendMessage(
                        chatId,
                        "❌ No card found at that index!",
                    );
                }

                // Cleanup any expired sales first
                await CardSale.cleanupExpiredSales(chatId);

                // Check if seller already has an active sale in this group
                const existingSale = await CardSale.findOne({
                    sellerId: sender,
                    groupId: chatId,
                    status: "active",
                });

                if (existingSale) {
                    return bot.sendMessage(
                        chatId,
                        "❌ You already have an active sale in this group! Wait for it to expire or be purchased.",
                    );
                }

                // Remove card from seller's collection
                player.collection.splice(collectionIndex, 1);
                await player.save();

                // Generate sale captcha and create sale record
                const saleCaptcha = CardSale.generateCaptcha();
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

                const cardSale = new CardSale({
                    cardId: cardToSell._id,
                    sellerId: sender,
                    sellerName: player.name,
                    groupId: chatId,
                    price: price,
                    saleCaptcha: saleCaptcha,
                    expiresAt: expiresAt,
                });

                await cardSale.save();

                // Send card image with sale details (reliable approach)
                try {
                    // Send the original card image with sale information
                    const cardImgResponse = await axios.get(cardToSell.img, {
                        responseType: "arraybuffer",
                        timeout: 5000,
                    });

                    const saleMsg =
                        `🏪 *CARD FOR SALE* 🏪\n\n` +
                        `🎴 **${cardToSell.name}**\n` +
                        `⭐ Tier: ${cardToSell.tier}\n` +
                        `🎭 Series: ${cardToSell.series}\n` +
                        `👨‍🎨 Maker: ${cardToSell.maker}\n\n` +
                        `💰 **Price: ${price} Shards**\n` +
                        `🔑 **Buy Code: ${saleCaptcha}**\n\n` +
                        `👤 Seller: ${player.name}\n` +
                        `⏰ Expires in 10 minutes\n\n` +
                        `💡 Type *!buycard ${saleCaptcha}* to purchase`;

                    await bot.sendImage(chatId, cardImgResponse.data, saleMsg);

                    // Set timeout to auto-return card if not sold
                    setTimeout(
                        async () => {
                            try {
                                const sale = await CardSale.findById(
                                    cardSale._id,
                                );
                                if (sale && sale.status === "active") {
                                    const seller = await Player.findOne({
                                        userId: sale.sellerId,
                                    });
                                    if (seller) {
                                        seller.collection.push(sale.cardId);
                                        await seller.save();
                                        sale.status = "expired";
                                        await sale.save();

                                        await bot.sendMessage(
                                            chatId,
                                            `⏰ Sale expired! Card "${cardToSell.name}" has been returned to ${player.name}'s collection.`,
                                        );
                                    }
                                }
                            } catch (timeoutError) {
                                console.error(
                                    "Error in sale timeout:",
                                    timeoutError,
                                );
                            }
                        },
                        10 * 60 * 1000,
                    ); // 10 minutes
                } catch (imageError) {
                    console.error("Error creating sale image:", imageError);

                    // Fallback to text message
                    const saleMsg =
                        `🏪 *CARD FOR SALE* 🏪\n\n` +
                        `🎴 **${cardToSell.name}**\n` +
                        `⭐ Tier: ${cardToSell.tier}\n` +
                        `🎭 Series: ${cardToSell.series}\n` +
                        `👨‍🎨 Maker: ${cardToSell.maker}\n\n` +
                        `💰 **Price: ${price} Shards**\n` +
                        `🔑 **Buy Code: ${saleCaptcha}**\n\n` +
                        `👤 Seller: ${player.name}\n` +
                        `⏰ Expires in 10 minutes\n\n` +
                        `💡 Type *!buycard ${saleCaptcha}* to purchase`;

                    await bot.sendMessage(chatId, saleMsg);
                }
            } catch (error) {
                console.error("Sellcard error:", error);
                await bot.sendMessage(chatId, "❌ Error creating card sale.");
            }
        },
    },

    buycard: {
        description: "Buy a card that's for sale in this group",
        usage: "buycard <salecaptcha>",
        aliases: ["buy"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, isGroup }) => {
            try {
                if (!isGroup) {
                    return bot.sendMessage(
                        chatId,
                        "❌ Card buying is only available in groups!",
                    );
                }

                if (args.length !== 1) {
                    return bot.sendMessage(
                        chatId,
                        "❌ Usage: !buycard <salecaptcha>\nExample: !buycard ABC1",
                    );
                }

                const saleCaptcha = args[0].toUpperCase();

                const Player = require("../models/Player");
                const CardSale = require("../models/CardSale");

                const buyer = await Player.findOne({ userId: sender });
                if (!buyer) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                // Cleanup expired sales first
                await CardSale.cleanupExpiredSales(chatId);

                // Find the active sale in this group with this captcha
                const sale = await CardSale.findOne({
                    groupId: chatId,
                    saleCaptcha: saleCaptcha,
                    status: "active",
                }).populate("cardId");

                if (!sale) {
                    return bot.sendMessage(
                        chatId,
                        "❌ No active sale found with that code in this group!",
                    );
                }

                // Check if sale has expired
                if (sale.hasExpired()) {
                    // Cleanup this expired sale
                    await CardSale.cleanupExpiredSales(chatId);
                    return bot.sendMessage(chatId, "❌ That sale has expired!");
                }

                // Prevent self-purchase
                if (sale.sellerId === sender) {
                    return bot.sendMessage(
                        chatId,
                        "❌ You cannot buy your own card!",
                    );
                }

                // Check if buyer has enough shards
                if (buyer.shards < sale.price) {
                    return bot.sendMessage(
                        chatId,
                        `❌ You need ${sale.price} shards but only have ${buyer.shards}!`,
                    );
                }

                // Get seller
                const seller = await Player.findOne({ userId: sale.sellerId });
                if (!seller) {
                    return bot.sendMessage(chatId, "❌ Seller not found!");
                }

                // Perform the transaction atomically
                const mongoose = require("mongoose");
                const session = await mongoose.startSession();

                try {
                    await session.withTransaction(async () => {
                        // Deduct shards from buyer
                        buyer.shards -= sale.price;

                        // Add shards to seller
                        seller.shards += sale.price;

                        // Add card to buyer's collection
                        buyer.collection.push(sale.cardId._id);

                        // Mark sale as sold
                        sale.status = "sold";
                        sale.buyerId = sender;
                        sale.buyerName = buyer.name;
                        sale.soldAt = new Date();

                        // Save all changes
                        await buyer.save({ session });
                        await seller.save({ session });
                        await sale.save({ session });
                    });

                    const purchaseMsg =
                        `✅ *PURCHASE SUCCESSFUL!* ✅\n\n` +
                        `🎴 **${sale.cardId.name}** (Tier ${sale.cardId.tier})\n` +
                        `💰 Price: ${sale.price} shards\n\n` +
                        `👤 Buyer: ${buyer.name}\n` +
                        `👤 Seller: ${seller.name}\n\n` +
                        `💎 ${buyer.name}'s remaining shards: ${buyer.shards}\n` +
                        `💎 ${seller.name}'s new balance: ${seller.shards}`;

                    await bot.sendMessage(chatId, purchaseMsg);
                } catch (transactionError) {
                    await session.abortTransaction();
                    console.error("Transaction error:", transactionError);
                    await bot.sendMessage(
                        chatId,
                        "❌ Error processing purchase. Please try again.",
                    );
                } finally {
                    await session.endSession();
                }
            } catch (error) {
                console.error("Buycard error:", error);
                await bot.sendMessage(chatId, "❌ Error purchasing card.");
            }
        },
    },

    cancelsale: {
        description: "Cancel your current card sale in this group",
        usage: "cancelsale",
        aliases: ["cancell", "cancel"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, isGroup }) => {
            try {
                if (!isGroup) {
                    return bot.sendMessage(
                        chatId,
                        "❌ Card sales are only available in groups!",
                    );
                }

                const Player = require("../models/Player");
                const CardSale = require("../models/CardSale");

                const player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                // Cleanup any expired sales first
                await CardSale.cleanupExpiredSales(chatId);

                // Find the seller's active sale in this group
                const activeSale = await CardSale.findOne({
                    sellerId: sender,
                    groupId: chatId,
                    status: "active",
                }).populate("cardId");

                if (!activeSale) {
                    return bot.sendMessage(
                        chatId,
                        "❌ You don't have any active sales in this group!",
                    );
                }

                // Check if sale has expired (safety check)
                if (activeSale.hasExpired()) {
                    await CardSale.cleanupExpiredSales(chatId);
                    return bot.sendMessage(
                        chatId,
                        "❌ Your sale has already expired!",
                    );
                }

                // Perform the cancellation atomically
                const mongoose = require("mongoose");
                const session = await mongoose.startSession();

                try {
                    await session.withTransaction(async () => {
                        // Return card to seller's collection
                        player.collection.push(activeSale.cardId._id);

                        // Mark sale as expired/cancelled
                        activeSale.status = "expired";

                        // Save changes
                        await player.save({ session });
                        await activeSale.save({ session });
                    });

                    const cancelMsg =
                        `❌ *SALE CANCELLED* ❌\n\n` +
                        `🎴 **${activeSale.cardId.name}** (Tier ${activeSale.cardId.tier})\n` +
                        `💰 Was priced at: ${activeSale.price} shards\n\n` +
                        `✅ Card has been returned to your collection.\n` +
                        `👤 Cancelled by: ${player.name}`;

                    await bot.sendMessage(chatId, cancelMsg);
                } catch (transactionError) {
                    await session.abortTransaction();
                    console.error(
                        "Transaction error during cancellation:",
                        transactionError,
                    );
                    await bot.sendMessage(
                        chatId,
                        "❌ Error cancelling sale. Please try again.",
                    );
                } finally {
                    await session.endSession();
                }
            } catch (error) {
                console.error("Cancelsale error:", error);
                await bot.sendMessage(chatId, "❌ Error cancelling card sale.");
            }
        },
    },
};

module.exports = cardCommands;
