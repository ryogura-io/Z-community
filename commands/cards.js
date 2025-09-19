const Player = require("../models/Player");
const Card = require("../models/Card");
const axios = require("axios");
const spawnManager = require('../spawnManager');

const cardCommands = {
    claim: {
        description: "Claim the currently spawned card using captcha",
        usage: "claim <captcha>",
        aliases: ['c'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot, sock, msgQueue }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !claim <captcha>");
            }
            
            try {
                const activeSpawn = spawnManager.getActiveSpawn(chatId);
                if (!activeSpawn) {
                    return bot.sendMessage(chatId, "❌ No active card spawn in this group!");
                }
                
                if (args[0].toUpperCase() !== activeSpawn.captcha.toUpperCase()) {
                    return bot.sendMessage(chatId, "❌ Incorrect captcha!");
                }
                
                let player = await Player.findOne({ userId: sender });
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first using !register <name>");
                }
                
                // Find empty deck slot or add to collection
                const emptySlot = player.deck.findIndex(slot => slot === null);
                
                if (emptySlot !== -1) {
                    player.deck[emptySlot] = activeSpawn.card._id;
                } else {
                    player.collection.push(activeSpawn.card._id);
                }
                
                player.exp += 50;
                await player.save();
                
                spawnManager.removeActiveSpawn(chatId);
                
                const claimMsg = `🎉 *Card Claimed!*\n\n` +
                    `👤 *${player.name}*\n` +
                    `🎴 *${activeSpawn.card.name}*\n` +
                    `⭐ *${activeSpawn.card.tier}*\n` +
                    `🎭 *${activeSpawn.card.series}*\n` +
                    `🎯 *Added to:* ${emptySlot !== -1 ? `Deck slot ${emptySlot + 1}` : 'Collection'}\n` +
                    `💫 *+50 EXP*`;
                
                await bot.sendMessage(chatId, claimMsg);
            } catch (error) {
                console.error('Claim error:', error);
                await bot.sendMessage(chatId, "❌ Error claiming card.");
            }
        }
    },

    collection: {
        description: "Display user cards collection in numerical order",
        usage: "collection [number]",
        aliases: ['coll'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender }).populate('collection');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                if (args[0] && !isNaN(args[0])) {
                    const cardIndex = parseInt(args[0]) - 1;
                    if (cardIndex < 0 || cardIndex >= player.collection.length) {
                        return bot.sendMessage(chatId, "❌ Invalid card number!");
                    }
                    
                    
                    const card = player.collection[cardIndex];
                    const cardMsg = `🎴 *Card #${args[0]}*\n\n` +
                    `📜 *Name:* ${card.name}\n` +
                    `⭐ *Tier:* ${card.tier}\n` +
                    `🎭 *Series:* ${card.series}\n` +
                    `👨‍🎨 *Maker:* ${card.maker}`;
                    
                    await bot.sendImage(chatId, await (await axios.get(card.img, { responseType: "arraybuffer" })).data, cardMsg);
                } else {
                    const totalCards = player.collection.length;
                    if (totalCards === 0) {
                        return bot.sendMessage(chatId, "📦 Your collection is empty!");
                    }
                    
                    let collectionMsg = `🎴 *${player.name}'s Collection (${totalCards} cards)*\n\n`;
                    player.collection.forEach((card, index) => {
                        collectionMsg += `*${index + 1}. ${card.name}* [${card.tier}]\n    Series: ${card.series}\n`;
                    });
                    
                    await bot.sendMessage(chatId, collectionMsg);
                }
            } catch (error) {
                console.error('Collection error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching collection.");
            }
        }
    },

    deck: {
        description: "Show your deck or specific card",
        usage: "deck [deck_number]",
        aliases: ['d'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender }).populate('deck');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                // If user requested a specific slot
                if (args[0] && !isNaN(args[0])) {
                    const cardIndex = parseInt(args[0]) - 1;
                    if (cardIndex < 0 || cardIndex >= 12) {
                        return bot.sendMessage(chatId, "❌ Deck position must be 1-12!");
                    }

                    const card = player.deck[cardIndex];
                    if (!card) {
                        return bot.sendMessage(chatId, `❌ No card at deck position ${args[0]}!`);
                    }

                    const cardMsg = `🎴 *Deck Position ${args[0]}*\n\n` +
                        `📜 *Name:* ${card.name}\n` +
                        `⭐ *Tier:* ${card.tier}\n` +
                        `🎭 *Series:* ${card.series}\n` +
                        `👨‍🎨 *Maker:* ${card.maker}`;

                    const imgBuffer = (await axios.get(card.img, { responseType: "arraybuffer" })).data;
                    return bot.sendImage(chatId, imgBuffer, cardMsg);
                }

                // Otherwise show the whole deck (only filled slots)
                const filledSlots = player.deck
                    .map((c, i) => ({ card: c, pos: i + 1 }))
                    .filter(entry => entry.card !== null && entry.card !== undefined);

                if (filledSlots.length === 0) {
                    return bot.sendMessage(chatId, "❌ Your deck is empty!");
                }

                let deckMsg = `🃏 *${player.name}'s Primary Deck*\n\n`;

                for (const { card, pos } of filledSlots) {
                    deckMsg += `🎴 *${pos}.* ${card.name}  —  ${card.tier}\n`;
                }

                await bot.sendMessage(chatId, deckMsg);

            } catch (error) {
                console.error('Deck error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching deck.");
            }
        }
    },

    cards: {
        description: "Display user cards sorted by tier",
        usage: "cards",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender })
                .populate('collection')
                .populate('deck');

                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                // Merge collection + deck into one array
                let allCards = [...player.collection, ...player.deck];

                if (allCards.length === 0) {
                    return bot.sendMessage(chatId, "📦 Your collection is empty!");
                }

                // Define tier display order (higher first)
                const tierOrder = ['S', '6', '5', '4', '3', '2', '1'];

                // Group cards by tier
                const grouped = {};
                for (const t of tierOrder) grouped[t] = [];
                allCards.forEach(card => {
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

                await bot.sendMessage(chatId, cardsMsg.trim());
            } catch (error) {
                console.error('Cards error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching cards.");
            }
        }
    },

    mtd: {
        description: "Move cards from collection to deck",
        usage: "mtd <collection_numbers>",
        aliases: ['movetodeck'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !mtd <collection_numbers> (e.g., !mtd 1 5 12)");
            }

            try {
                // Only populate collection, keep deck raw with nulls
                const player = await Player.findOne({ userId: sender }).populate('collection');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                const cardNumbers = args
                    .map(arg => parseInt(arg) - 1)
                    .filter(num => !isNaN(num));

                let moved = 0;
                cardNumbers.sort((a, b) => b - a);

                for (const cardIndex of cardNumbers) {
                    if (cardIndex < 0 || cardIndex >= player.collection.length) continue;

                    // find the first null slot in the deck
                    const emptySlot = player.deck.findIndex(slot => slot === null);
                    if (emptySlot === -1) {
                        await bot.sendMessage(chatId, "⚠️ Deck is full! Some cards couldn't be moved.");
                        break;
                    }

                    const card = player.collection[cardIndex];
                    if (!card) continue;

                    player.deck[emptySlot] = card._id; // store only the ObjectId
                    player.collection.splice(cardIndex, 1);
                    moved++;
                }

                await player.save();
                await bot.sendMessage(chatId, `✅ Moved ${moved} card(s) to deck!`);
            } catch (error) {
                console.error("MTD error:", error);
                await bot.sendMessage(chatId, "❌ Error moving cards.");
            }
        }
    },

    mtc: {
        description: "Move cards from deck to collection",
        usage: "mtc <deck_numbers> or mtc all",
        aliases: ['movetocoll'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !mtc <deck_numbers> or !mtc all");
            }

            try {
                const player = await Player.findOne({ userId: sender }).populate('deck');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                let moved = 0;

                if (args[0].toLowerCase() === 'all') {
                    // Move all non-empty cards
                    const cardsToMove = player.deck.filter(card => card !== null);
                    moved = cardsToMove.length;

                    player.collection.push(...cardsToMove);
                    player.deck = Array(12).fill(null); // reset deck back to 12 empty slots
                } else {
                    const deckNumbers = args
                        .map(arg => parseInt(arg) - 1)
                        .filter(num => !isNaN(num) && num >= 0 && num < 12);

                    for (const deckIndex of deckNumbers) {
                        if (player.deck[deckIndex]) {
                            player.collection.push(player.deck[deckIndex]);
                            player.deck[deckIndex] = null; // remove from deck properly
                            moved++;
                        }
                    }
                }

                await player.save();
                await bot.sendMessage(chatId, `✅ Moved ${moved} card(s) to collection!`);
            } catch (error) {
                console.error('MTC error:', error);
                await bot.sendMessage(chatId, "❌ Error moving cards.");
            }
        }
    },

    collector: {
        description: "Display top 3 players with most cards in a series",
        usage: "collector <series_name>",
        aliases: ['cltr'],
        adminOnly: false,
        execute: async ({ chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !collector <series_name>");
            }
            
            try {
                const seriesName = args.join(' ');
                const players = await Player.find({}).populate('collection');
                
                const collectors = players.map(player => {
                    const seriesCards = player.collection.filter(card => 
                        card.series.toLowerCase().includes(seriesName.toLowerCase())
                    );
                    return {
                        name: player.name,
                        count: seriesCards.length
                    };
                }).filter(collector => collector.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 3);
                
                if (collectors.length === 0) {
                    return bot.sendMessage(chatId, `📦 No collectors found for series: ${seriesName}`);
                }
                
                let collectorMsg = `🏆 *Top ${seriesName} Collectors*\n\n`;
                collectors.forEach((collector, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                    collectorMsg += `${medal} *${collector.name}* - ${collector.count} cards\n`;
                });
                
                await bot.sendMessage(chatId, collectorMsg);
            } catch (error) {
                console.error('Collector error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching collectors.");
            }
        }
    },

    series: {
        description: "Show all possessed cards in a series by tier",
        usage: "series <series_name>",
        aliases: ['ss', 'seriessearch'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !series <series_name>");
            }

            try {
                const player = await Player.findOne({ userId: sender }).populate('collection deck');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                const seriesName = args.join(' ');
                const collectionCards = player.collection || [];
                const deckCards = player.deck || [];

                // Tag location with index
                const allCards = [
                    ...collectionCards.map((c, i) => ({ ...c.toObject(), location: `📦 Collection #${i + 1}` })),
                    ...deckCards
                        .map((c, i) => (c ? { ...c.toObject(), location: `📥 Deck #${i + 1}` } : null))
                        .filter(c => c)
                ];

                const seriesCards = allCards.filter(card =>
                    card.series.toLowerCase().includes(seriesName.toLowerCase())
                );

                if (seriesCards.length === 0) {
                    return bot.sendMessage(chatId, `📦 No cards found for series: ${seriesName}`);
                }

                const tierOrder = ['S', '6', '5', '4', '3', '2', '1'];
                const sortedCards = seriesCards.sort((a, b) =>
                    tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)
                );

                let seriesMsg = `🎭 *${player.name}'s ${seriesName} Cards (${seriesCards.length})*\n\n`;
                sortedCards.forEach((card, index) => {
                    seriesMsg += `${index + 1}. ${card.name} (Tier ${card.tier})`;
                });

                await bot.sendMessage(chatId, seriesMsg);
            } catch (error) {
                console.error('Series error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching series cards.");
            }
        }
    },

    searchcard: {
        description: "Search for a card in your deck and collection",
        usage: "searchcard <card_name>",
        aliases: ['fc', 'findcard'],
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !searchcard <card_name>");
            }

            try {
                const player = await Player.findOne({ userId: sender }).populate('collection deck');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }

                const searchTerm = args.join(' ').toLowerCase();
                const collectionCards = player.collection || [];
                const deckCards = player.deck || [];

                // Tag location with index
                const allCards = [
                    ...collectionCards.map((c, i) => ({ ...c.toObject(), location: `📦 Collection #${i + 1}` })),
                    ...deckCards
                        .map((c, i) => (c ? { ...c.toObject(), location: `📥 Deck #${i + 1}` } : null))
                        .filter(c => c)
                ];

                const foundCards = allCards.filter(card =>
                    card.name.toLowerCase().includes(searchTerm)
                );

                if (foundCards.length === 0) {
                    return bot.sendMessage(chatId, `🔍 No cards found matching: ${searchTerm}`);
                }

                let searchMsg = `🔍 *Search Results for "${searchTerm}" (${foundCards.length})*\n\n`;
                foundCards.slice(0, 10).forEach((card, index) => {
                    searchMsg += `*${index + 1}. ${card.name}* (Tier ${card.tier})\n    Location: ${card.location}\n`;
                });

                if (foundCards.length > 10) {
                    searchMsg += `\n... and ${foundCards.length - 10} more matches`;
                }

                await bot.sendMessage(chatId, searchMsg);
            } catch (error) {
                console.error('Search card error:', error);
                await bot.sendMessage(chatId, "❌ Error searching cards.");
            }
        }
    },

    givecard: {
        description: "Give card(s) from your collection to another player",
        usage: "givecard <collection_numbers> <@user>",
        aliases: ['gc', 'trade', 'sendcard'],
        adminOnly: false,
        execute: async ({ sender, chatId, message, args, bot }) => {
            let targetUser;
            
            if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                targetUser = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else {
                return bot.sendMessage(chatId, "❌ Reply to a user to send them Card!");
            }

            try {
                const giver = await Player.findOne({ userId: sender }).populate('collection');
                const receiver = await Player.findOne({ userId: targetUser }).populate('collection');

                if (!giver) return bot.sendMessage(chatId, "❌ Please register first!");
                if (!receiver) return bot.sendMessage(chatId, "❌ The mentioned user is not registered!");

                // Convert args → indices (0-based) and sort descending
                const cardNumbers = args
                    .map(arg => parseInt(arg) - 1)
                    .filter(num => !isNaN(num))
                    .sort((a, b) => b - a); // descending

                let transferred = [];

                for (const cardIndex of cardNumbers) {
                    if (cardIndex < 0 || cardIndex >= giver.collection.length) continue;

                    const card = giver.collection[cardIndex];
                    if (!card) continue;

                    // Remove from giver
                    giver.collection.splice(cardIndex, 1);

                    // Add to receiver
                    receiver.collection.push(card._id || card);

                    transferred.push(card.name);
                }

                if (transferred.length === 0) {
                    return bot.sendMessage(chatId, "❌ No valid cards selected for transfer!");
                }

                await giver.save();
                await receiver.save();

                const transferMsg = `🎁 *Card Transfer Successful!*\n\n` +
                    `👤 From: ${giver.name}\n` +
                    `👥 To: ${receiver.name}\n` +
                    `🎴 Cards: ${transferred.join(", ")}`;

                await bot.sendMessage(chatId, transferMsg);
            } catch (error) {
                console.error("Givecard error:", error);
                await bot.sendMessage(chatId, "❌ Error transferring card(s).");
            }
        }
    }

};

module.exports = cardCommands;