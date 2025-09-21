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
        execute: async ({ sender, chatId, args, bot, sock, msgQueue, message }) => {
            if (!args[0]) {
                return sock.sendMessage(chatId, { text: "❌ Usage: !claim <captcha>" }, { quoted: message });
            }

            try {
                const activeSpawn = spawnManager.getActiveSpawn(chatId);
                if (!activeSpawn) {
                    return sock.sendMessage(chatId, { text: "❌ No active card spawn in this group!" }, { quoted: message });
                }

                if (
                    args[0].toUpperCase() !== activeSpawn.captcha.toUpperCase()
                ) {
                    return sock.sendMessage(chatId, { text: "❌ Incorrect captcha!" }, { quoted: message });
                }

                let player = await Player.findOne({ userId: sender });
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first using !register <name>" }, { quoted: message });
                }

                // ✅ Check shards
                const cardPrice =
                    spawnManager.tierConfig[activeSpawn.card.tier]?.price ||
                    100;
                if (player.shards < cardPrice) {
                    return sock.sendMessage(chatId, { text: `❌ You need *${cardPrice} shards* to claim this card!\n💰 Your shards: ${player.shards}` }, { quoted: message });
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
                    `🎉 *Card Claimed! by ${player.name}*\n\n` +
                    `🎴 Card: *${activeSpawn.card.name}* [Tier ${activeSpawn.card.tier}] \n` +
                    `🎯 Added to: ${emptySlot !== -1 ? `Deck slot ${emptySlot + 1}` : "Collection"}\n`;

                await sock.sendMessage(chatId, { text: claimMsg }, { quoted: message });
            } catch (error) {
                console.error("Claim error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error claiming card." }, { quoted: message });
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
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                }

                if (args[0] && !isNaN(args[0])) {
                    const cardIndex = parseInt(args[0]) - 1;
                    if (
                        cardIndex < 0 ||
                        cardIndex >= player.collection.length
                    ) {
                        return sock.sendMessage(chatId, { text: "❌ Invalid card number!" }, { quoted: message });
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

                            await sock.sendMessage(chatId, {
                                video: videoBuffer,
                                caption: cardMsg,
                                mimetype: 'video/mp4',
                                gifPlayback: true
                            }, { quoted: message });
                        } catch (conversionError) {
                            console.error(
                                "Video conversion error:",
                                conversionError,
                            );
                            // Fallback to sending as image
                            const imgBuffer = (await axios.get(card.img, {
                                responseType: "arraybuffer",
                            })).data;
                            await sock.sendMessage(chatId, {
                                image: imgBuffer,
                                caption: cardMsg
                            }, { quoted: message });
                        }
                    } else {
                        const imgBuffer = (await axios.get(card.img, {
                            responseType: "arraybuffer",
                        })).data;
                        await sock.sendMessage(chatId, {
                            image: imgBuffer,
                            caption: cardMsg
                        }, { quoted: message });
                    }
                } else {
                    const totalCards = player.collection.length;
                    if (totalCards === 0) {
                        return sock.sendMessage(chatId, { text: "📦 Your collection is empty!" }, { quoted: message });
                    }

                    let collectionMsg = `🎴 *${player.name}'s Collection (${totalCards} cards)*\n\n`;
                    player.collection.forEach((card, index) => {
                        collectionMsg += `*${index + 1}. ${card.name}* [${card.tier}]\n    Series: ${card.series}\n`;
                    });

                    await sock.sendMessage(chatId, { text: collectionMsg }, { quoted: message });
                }
            } catch (error) {
                console.error("Collection error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching collection." }, { quoted: message });
            }
        },
    },

    deck: {
        description: "Show your deck or specific card",
        usage: "deck [deck_number]",
        aliases: ["d"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("deck");
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                }

                // If user requested a specific slot
                if (args[0] && !isNaN(args[0])) {
                    const cardIndex = parseInt(args[0]) - 1;
                    if (cardIndex < 0 || cardIndex >= 12) {
                        return sock.sendMessage(chatId, { text: "❌ Deck position must be 1-12!" }, { quoted: message });
                    }

                    const card = player.deck[cardIndex];
                    if (!card) {
                        return sock.sendMessage(chatId, { text: `❌ No card at deck position ${args[0]}!` }, { quoted: message });
                    }

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

                            return sock.sendMessage(chatId, {
                                video: videoBuffer,
                                caption: cardMsg,
                                mimetype: 'video/mp4',
                                gifPlayback: true
                            }, { quoted: message });
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
                            return sock.sendMessage(chatId, {
                                image: imgBuffer,
                                caption: cardMsg
                            }, { quoted: message });
                        }
                    } else {
                        const imgBuffer = (
                            await axios.get(card.img, {
                                responseType: "arraybuffer",
                            })
                        ).data;
                        return sock.sendMessage(chatId, {
                            image: imgBuffer,
                            caption: cardMsg
                        }, { quoted: message });
                    }
                }

                // Otherwise show the whole deck as 4x3 grid
                const deckCards = player.deck; // All 12 slots (including nulls)
                
                // Check if deck is completely empty
                const hasAnyCards = deckCards.some(card => card !== null);
                if (!hasAnyCards) {
                    return sock.sendMessage(chatId, { text: "❌ Your deck is empty!" }, { quoted: message });
                }

                try {
                    // Create 4x3 grid image
                    const cardWidth = 200;
                    const cardHeight = 280;
                    const gridWidth = cardWidth * 4;
                    const gridHeight = cardHeight * 3;

                    // Create base canvas
                    const canvas = sharp({
                        create: {
                            width: gridWidth,
                            height: gridHeight,
                            channels: 3,
                            background: { r: 40, g: 40, b: 40 }
                        }
                    });

                    const compositeArray = [];

                    // Process each deck slot (12 total)
                    for (let i = 0; i < 12; i++) {
                        const row = Math.floor(i / 4);
                        const col = i % 4;
                        const left = col * cardWidth;
                        const top = row * cardHeight;

                        if (deckCards[i]) {
                            // Card exists - fetch and resize image
                            try {
                                const cardImgBuffer = (await axios.get(deckCards[i].img, {
                                    responseType: "arraybuffer",
                                })).data;
                                
                                const resizedCardBuffer = await sharp(Buffer.from(cardImgBuffer))
                                    .resize(cardWidth - 4, cardHeight - 4, { fit: 'cover' })
                                    .jpeg()
                                    .toBuffer();

                                compositeArray.push({
                                    input: resizedCardBuffer,
                                    left: left + 2,
                                    top: top + 2
                                });
                            } catch (imgError) {
                                console.error(`Error loading card image for slot ${i+1}:`, imgError);
                                // Add placeholder for failed image
                                const placeholder = await sharp({
                                    create: {
                                        width: cardWidth - 4,
                                        height: cardHeight - 4,
                                        channels: 3,
                                        background: { r: 100, g: 100, b: 100 }
                                    }
                                }).jpeg().toBuffer();
                                
                                compositeArray.push({
                                    input: placeholder,
                                    left: left + 2,
                                    top: top + 2
                                });
                            }
                        } else {
                            // Empty slot - add placeholder
                            const placeholder = await sharp({
                                create: {
                                    width: cardWidth - 4,
                                    height: cardHeight - 4,
                                    channels: 3,
                                    background: { r: 60, g: 60, b: 60 }
                                }
                            }).jpeg().toBuffer();
                            
                            compositeArray.push({
                                input: placeholder,
                                left: left + 2,
                                top: top + 2
                            });
                        }
                    }

                    // Composite all images into the grid
                    const gridBuffer = await canvas
                        .composite(compositeArray)
                        .jpeg()
                        .toBuffer();

                    // Create deck message caption
                    let deckMsg = `🃏 *${player.name}'s Deck*\n\n`;
                    const filledSlots = deckCards.filter(card => card !== null);
                    deckMsg += `📊 Cards: ${filledSlots.length}/12\n`;
                    
                    if (filledSlots.length > 0) {
                        deckMsg += `🎴 Cards in deck:\n`;
                        filledSlots.forEach((card, index) => {
                            deckMsg += `• ${card.name} [${card.tier}]\n`;
                        });
                    }

                    await sock.sendMessage(chatId, {
                        image: gridBuffer,
                        caption: deckMsg
                    }, { quoted: message });

                } catch (gridError) {
                    console.error("Error creating deck grid:", gridError);
                    // Fallback to text display
                    let deckMsg = `🃏 *${player.name}'s Deck*\n\n`;
                    const filledSlots = deckCards.filter(card => card !== null);
                    for (let i = 0; i < deckCards.length; i++) {
                        if (deckCards[i]) {
                            deckMsg += `🎴 *${i + 1}.* *${deckCards[i].name}*\n⭐ Tier: ${deckCards[i].tier}\n\n`;
                        }
                    }
                    await sock.sendMessage(chatId, { text: deckMsg }, { quoted: message });
                }
            } catch (error) {
                console.error("Deck error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching deck." }, { quoted: message });
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
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                }

                // Merge collection + deck into one array
                let allCards = [...player.collection, ...player.deck];

                if (allCards.length === 0) {
                    return sock.sendMessage(chatId, { text: "📦 Your collection is empty!" }, { quoted: message });
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

                await sock.sendMessage(chatId, { text: cardsMsg.trim() }, { quoted: message });
            } catch (error) {
                console.error("Cards error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching cards." }, { quoted: message });
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
                return sock.sendMessage(chatId, { text: "❌ Usage: !mtd <collection_numbers> (e.g., !mtd 1 5 12)" }, { quoted: message });
            }

            try {
                // Only populate collection, keep deck raw with nulls
                const player = await Player.findOne({
                    userId: sender,
                }).populate("collection");
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
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
                        await sock.sendMessage(chatId, { text: "⚠️ Deck is full! Some cards couldn't be moved." }, { quoted: message });
                        break;
                    }

                    const card = player.collection[cardIndex];
                    if (!card) continue;

                    player.deck[emptySlot] = card._id; // store only the ObjectId
                    player.collection.splice(cardIndex, 1);
                    moved++;
                }

                await player.save();
                await sock.sendMessage(chatId, { text: `✅ Moved ${moved} card(s) to deck!` }, { quoted: message });
            } catch (error) {
                console.error("MTD error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error moving cards." }, { quoted: message });
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
                return sock.sendMessage(chatId, { text: "❌ Usage: !mtc <deck_numbers> or !mtc all" }, { quoted: message });
            }

            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("deck");
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
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

                    for (const deckIndex of deckNumbers) {
                        if (player.deck[deckIndex]) {
                            player.collection.push(player.deck[deckIndex]);
                            player.deck[deckIndex] = null; // remove from deck properly
                            moved++;
                        }
                    }
                }

                await player.save();
                await sock.sendMessage(chatId, { text: `✅ Moved ${moved} card(s) to collection!` }, { quoted: message });
            } catch (error) {
                console.error("MTC error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error moving cards." }, { quoted: message });
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
                return sock.sendMessage(chatId, { text: "❌ Usage: !collector <series_name>" }, { quoted: message });
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
                    return sock.sendMessage(chatId, { text: `📦 No collectors found for series: ${seriesName}` }, { quoted: message });
                }

                let collectorMsg = `🏆 *Top ${seriesName} Collectors*\n\n`;
                collectors.forEach((collector, index) => {
                    const medal =
                        index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
                    collectorMsg += `${medal} *${collector.name}* - ${collector.count} cards\n`;
                });

                await sock.sendMessage(chatId, { text: collectorMsg }, { quoted: message });
            } catch (error) {
                console.error("Collector error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching collectors." }, { quoted: message });
            }
        },
    },

    series: {
        description: "Show all possessed cards in a series by tier",
        usage: "series <series_name>",
        aliases: ["ss", "seriessearch"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(chatId, { text: "❌ Usage: !series <series_name>" }, { quoted: message });
            }

            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("collection deck");
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
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
                    return sock.sendMessage(chatId, { text: `📦 No cards found for series: ${seriesName}` }, { quoted: message });
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

                await sock.sendMessage(chatId, { text: seriesMsg }, { quoted: message });
            } catch (error) {
                console.error("Series error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error fetching series cards." }, { quoted: message });
            }
        },
    },

    searchcard: {
        description: "Search for a card in your deck and collection",
        usage: "searchcard <card_name>",
        aliases: ["fc", "findcard"],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(chatId, { text: "❌ Usage: !searchcard <card_name>" }, { quoted: message });
            }

            try {
                const player = await Player.findOne({
                    userId: sender,
                }).populate("collection deck");
                if (!player) {
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
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
                        `🔍 No cards found matching: ${searchTerm}`,
                    );
                }

                let searchMsg = `🔍 *Search Results for "${searchTerm}" (${foundCards.length})*\n\n`;
                foundCards.slice(0, 10).forEach((card, index) => {
                    searchMsg += `*${index + 1}. ${card.name}* (Tier ${card.tier})\n    Location: ${card.location}\n`;
                });

                if (foundCards.length > 10) {
                    searchMsg += `\n... and ${foundCards.length - 10} more matches`;
                }

                await sock.sendMessage(chatId, searchMsg);
            } catch (error) {
                console.error("Search card error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error searching cards." }, { quoted: message });
            }
        },
    },

    givecard: {
        description: "Give card(s) from your collection to another player",
        usage: "givecard <collection_numbers> <@user>",
        aliases: ["gc", "trade", "sendcard"],
        adminOnly: false,
        execute: async ({ sender, chatId, message, args, bot }) => {
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
                return sock.sendMessage(chatId, { text: "❌ Reply to a user to send them Card!" }, { quoted: message });
            }

            try {
                const giver = await Player.findOne({ userId: sender }).populate(
                    "collection",
                );
                const receiver = await Player.findOne({
                    userId: targetUser,
                }).populate("collection");

                if (!giver)
                    return sock.sendMessage(chatId, { text: "❌ Please register first!" }, { quoted: message });
                if (!receiver)
                    return sock.sendMessage(chatId, { text: "❌ The mentioned user is not registered!" }, { quoted: message });

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
                    return sock.sendMessage(chatId, { text: "❌ No valid cards selected for transfer!" }, { quoted: message });
                }

                await giver.save();
                await receiver.save();

                const transferMsg =
                    `🎁 *Card Transfer Successful!*\n\n` +
                    `👤 From: ${giver.name}\n` +
                    `👥 To: ${receiver.name}\n` +
                    `🎴 Cards: ${transferred.join(", ")}`;

                await sock.sendMessage(chatId, { text: transferMsg }, { quoted: message });
            } catch (error) {
                console.error("Givecard error:", error);
                await sock.sendMessage(chatId, { text: "❌ Error transferring card(s)." }, { quoted: message });
            }
        }
    },

    deck: {
        description: "Show your current deck as a 4x3 grid image",
        usage: "deck",
        aliases: ["d"],
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            try {
                const Player = require("../models/Player");
                const player = await Player.findOne({ userId: sender }).populate('deck');
                
                if (!player || !player.deck || player.deck.length === 0) {
                    return sock.sendMessage(chatId, { text: "❌ You don't have any cards in your deck!" }, {quoted: message});
                }

                // Create 4x3 grid with placeholder images for empty slots
                const sharp = require('sharp');
                const axios = require('axios');
                
                const gridWidth = 4;
                const gridHeight = 3;
                const totalSlots = 12;
                const cardWidth = 200;
                const cardHeight = 280;
                
                const gridImage = sharp({
                    create: {
                        width: cardWidth * gridWidth,
                        height: cardHeight * gridHeight,
                        channels: 3,
                        background: { r: 30, g: 30, b: 30 }
                    }
                });

                const images = [];
                
                for (let i = 0; i < totalSlots; i++) {
                    const card = player.deck[i];
                    const x = (i % gridWidth) * cardWidth;
                    const y = Math.floor(i / gridWidth) * cardHeight;
                    
                    if (card && card.img) {
                        try {
                            // Check if image is webm or gif - skip these formats
                            const imageUrl = card.img.toLowerCase();
                            if (imageUrl.includes('.webm') || imageUrl.includes('.gif') || imageUrl.includes('.mov') || imageUrl.includes('.mp4')) {
                                // Use text placeholder for unsupported formats
                                const textPlaceholder = await sharp({
                                    create: {
                                        width: cardWidth,
                                        height: cardHeight,
                                        channels: 3,
                                        background: { r: 50, g: 80, b: 120 }
                                    }
                                })
                                .composite([{
                                    input: Buffer.from(`
                                    <svg width="${cardWidth}" height="${cardHeight}">
                                        <rect width="100%" height="100%" fill="rgb(50,80,120)"/>
                                        <text x="50%" y="40%" text-anchor="middle" fill="white" font-size="14" font-family="Arial">
                                            ${(card.name || 'Card').substring(0, 15)}
                                        </text>
                                        <text x="50%" y="60%" text-anchor="middle" fill="white" font-size="12" font-family="Arial">
                                            ${card.tier || 'N/A'}
                                        </text>
                                        <text x="50%" y="80%" text-anchor="middle" fill="white" font-size="10" font-family="Arial">
                                            (Video/GIF)
                                        </text>
                                    </svg>`),
                                    top: 0,
                                    left: 0
                                }])
                                .jpeg()
                                .toBuffer();
                                
                                images.push({
                                    input: textPlaceholder,
                                    top: y,
                                    left: x
                                });
                            } else {
                                // Process supported image formats (png, jpg, jpeg)
                                const response = await axios.get(card.img, { 
                                    responseType: 'arraybuffer',
                                    timeout: 5000 
                                });
                                
                                let cardImage;
                                try {
                                    cardImage = await sharp(response.data)
                                        .resize(cardWidth, cardHeight, { fit: 'cover' })
                                        .jpeg()
                                        .toBuffer();
                                } catch (sharpErr) {
                                    console.error('Sharp processing error:', sharpErr);
                                    throw sharpErr;
                                }
                                
                                images.push({
                                    input: cardImage,
                                    top: y,
                                    left: x
                                });
                            }
                        } catch (err) {
                            console.error('Error loading card image:', card.name, card.img, err.message);
                            // Use placeholder for failed image loads
                            const placeholder = await sharp({
                                create: {
                                    width: cardWidth,
                                    height: cardHeight,
                                    channels: 3,
                                    background: { r: 80, g: 50, b: 50 }
                                }
                            })
                            .composite([{
                                input: Buffer.from(`
                                <svg width="${cardWidth}" height="${cardHeight}">
                                    <rect width="100%" height="100%" fill="rgb(80,50,50)"/>
                                    <text x="50%" y="45%" text-anchor="middle" fill="white" font-size="16" font-family="Arial">
                                        ${(card.name || 'Card').substring(0, 12)}
                                    </text>
                                    <text x="50%" y="65%" text-anchor="middle" fill="white" font-size="12" font-family="Arial">
                                        (Load Error)
                                    </text>
                                </svg>`),
                                top: 0,
                                left: 0
                            }])
                            .jpeg()
                            .toBuffer();
                            
                            images.push({
                                input: placeholder,
                                top: y,
                                left: x
                            });
                        }
                    } else {
                        // Empty slot placeholder
                        const placeholder = await sharp({
                            create: {
                                width: cardWidth,
                                height: cardHeight,
                                channels: 3,
                                background: { r: 45, g: 45, b: 45 }
                            }
                        }).toBuffer();
                        
                        images.push({
                            input: placeholder,
                            top: y,
                            left: x
                        });
                    }
                }

                const finalImage = await gridImage.composite(images).jpeg().toBuffer();
                
                const deckText = `🎴 **${player.name}'s Deck**\n\n` +
                    `📊 Cards: ${player.deck.filter(card => card).length}/${totalSlots}\n` +
                    `⭐ Level: ${player.level} | 💎 Shards: ${player.shards}`;

                await sock.sendMessage(chatId, {
                    image: finalImage,
                    caption: deckText
                }, {quoted: message});

            } catch (error) {
                console.error('Deck command error:', error);
                await sock.sendMessage(chatId, { text: "❌ Error generating deck image." }, {quoted: message});
            }
        }
    }

};

module.exports = cardCommands;
