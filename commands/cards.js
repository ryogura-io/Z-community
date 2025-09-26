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
                // 🎲 Probability-based shard reward
                const rewardChance = 0.1; // 25% chance to get 2000 shards
                let rewardShards = 0;
                if (Math.random() <= rewardChance) {
                    rewardShards = 2000;
                    player.shards += rewardShards;
                    const bonusMsg = `💰 Congratulations, you successfully won 2000 bonus shards`;
                    await sock.sendMessage(
                        chatId,
                        { text: bonusMsg },
                        { quoted: message },
                    );
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

                    // Generate collection text
                    let collectionMsg = `🎴 *${player.name}'s Collection (${totalCards} cards)*\n\n`;
                    player.collection.forEach((card, index) => {
                        collectionMsg += `*${index + 1}. ${card.name}* [${card.tier}]\n    Series: ${card.series}\n`;
                    });

                    // Use the first card's image as the message image
                    const firstCard = player.collection[0];
                    const imgBuffer = (
                        await axios.get(firstCard.img, {
                            responseType: "arraybuffer",
                        })
                    ).data;

                    await sock.sendMessage(
                        chatId,
                        {
                            image: imgBuffer,
                            caption: collectionMsg,
                        },
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
        execute: async ({ sender, chatId, message, sock, args }) => {
            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("deck");
                if (!player) {
                    return sock.sendMessage(
                        chatId,
                        { text: `❌ Please register first!` },
                        { quoted: message },
                    );
                }

                // If user requested a specific slot
                if (args[0] && !isNaN(args[0])) {
                    const cardIndex = parseInt(args[0]) - 1;
                    if (cardIndex < 0 || cardIndex >= 12) {
                        return sock.sendMessage(
                            chatId,
                            { text: "❌ Deck position must be 1-12!" },
                            { quoted: message },
                        );
                    }

                    const card = player.deck[cardIndex];
                    if (!card) {
                        return sock.sendMessage(
                            chatId,
                            { text: `❌ No card at deck position ${args[0]}!` },
                            { quoted: message },
                        );
                    }
                    const axios = require("axios");
                    const cardMsg =
                        `┌──「 *CARD DETAILS* 」\n\n` +
                        `📜 *Name:* ${card.name}\n` +
                        `⭐ *Tier:* ${card.tier}\n` +
                        `🎭 *Series:* ${card.series}\n` +
                        `👨‍🎨 *Maker:* ${card.maker}`;

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
                    // Show deck as 4x3 grid image
                    const deckCards = player.deck.filter(
                        (card) => card !== null && card !== undefined,
                    );

                    if (deckCards.length === 0) {
                        return sock.sendMessage(
                            chatId,
                            { text: `❌ Your deck is empty!` },
                            { quoted: message },
                        );
                    }

                    // --- dynamic grid (3 columns, auto rows) ---
                    const sharp = require("sharp");
                    const axios = require("axios");

                    // const deckCards = player.deck.filter(c => c !== null && c !== undefined); // already defined above
                    const columns = 3; // keep 3 columns, change if you want
                    const rows = Math.max(
                        1,
                        Math.ceil(deckCards.length / columns),
                    );

                    const cardWidth = 230;
                    const cardHeight = 300;
                    const padding = 10; // space between cards and around edges

                    const canvasWidth =
                        columns * cardWidth + (columns + 1) * padding;
                    const canvasHeight =
                        rows * cardHeight + (rows + 1) * padding;

                    // create background sized to fit all cards
                    const background = await sharp({
                        create: {
                            width: canvasWidth,
                            height: canvasHeight,
                            channels: 4,
                            background: { r: 255, g: 255, b: 255, alpha: 1 },
                        },
                    }).png();

                    const composite = [];

                    for (let i = 0; i < deckCards.length; i++) {
                        const row = Math.floor(i / columns);
                        const col = i % columns;

                        const x = Math.round(
                            padding + col * (cardWidth + padding),
                        );
                        const y = Math.round(
                            padding + row * (cardHeight + padding),
                        );

                        const card = deckCards[i];

                        try {
                            const cardImgResponse = await axios.get(card.img, {
                                responseType: "arraybuffer",
                                timeout: 10000,
                            });

                            const resizedCard = await sharp(
                                Buffer.from(cardImgResponse.data),
                            )
                                .resize(cardWidth, cardHeight, { fit: "cover" })
                                .png()
                                .toBuffer();

                            composite.push({
                                input: resizedCard,
                                left: x,
                                top: y,
                            });
                        } catch (cardError) {
                            console.error(
                                `Error loading card image for ${card.name}:`,
                                cardError,
                            );

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
                                left: x,
                                top: y,
                            });
                        }
                    }

                    // composite and send
                    const imageBuffer = await background
                        .composite(composite)
                        .png()
                        .toBuffer();
                    const readMore = String.fromCharCode(8206).repeat(4001);
                    let deckMsg = `🃏 *${player.name}'s Deck*\n\n${readMore}`;

                    for (let i = 0; i < 12; i++) {
                        const card = player.deck[i];
                        if (card) {
                            deckMsg +=
                                `🎴 *${i + 1}.* *${card.name}* — Tier ${card.tier}` +
                                `\n        Series: ${card.series}\n\n`;
                        }
                    }

                    deckMsg += `\n💡 Use \`!deck <number>\` to see individual cards`;

                    await sock.sendMessage(
                        chatId,
                        { image: imageBuffer, caption: deckMsg },
                        { quoted: message },
                    );
                }
            } catch (error) {
                console.error("Deck error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: `❌ Error fetching deck.` },
                    { quoted: message },
                );
            }
        },
    },
};

module.exports = cardCommands;
