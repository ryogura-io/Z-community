const Player = require("../models/Player");
const Card = require("../models/Card");
const axios = require("axios");
const spawnManager = require('../spawnManager');

const cardCommands = {
    claim: {
        description: "Claim the currently spawned card using captcha",
        usage: "claim <captcha>",
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
                    player.collection.slice(0, 20).forEach((card, index) => {
                        collectionMsg += `${index + 1}. ${card.name} (${card.tier})\n`;
                    });
                    
                    if (totalCards > 20) {
                        collectionMsg += `\n... and ${totalCards - 20} more cards`;
                    }
                    
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
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender }).populate('deck');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }
                
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
                    
                    await bot.sendImage(chatId, await (await axios.get(card.img, { responseType: "arraybuffer" })).data, cardMsg);
                } else {
                    let deckMsg = `🃏 *${player.name}'s Primary Deck*\n\n`;
                    
                    for (let i = 0; i < 12; i++) {
                        const card = player.deck[i];
                        const position = i + 1;
                        
                        if (card && card !== null) {
                            deckMsg += `${position}. ${card.name} (${card.tier})\n`;
                        } else {
                            deckMsg += `${position}. [Empty Slot]\n`;
                        }
                    }
                    
                    await bot.sendMessage(chatId, deckMsg);
                }
            } catch (error) {
                console.error('Deck error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching deck.");
            }
        }
    },

    cards: {
        description: "Display user collection with sorting options",
        usage: "cards [tier]",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            try {
                const player = await Player.findOne({ userId: sender }).populate('collection');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }
                
                let cards = player.collection;
                
                if (args[0] === 'tier') {
                    const tierOrder = { 'Tier 1': 1, 'Tier 2': 2, 'Tier 3': 3, 'Tier 4': 4, 'Tier 5': 5 };
                    cards = cards.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);
                }
                
                if (cards.length === 0) {
                    return bot.sendMessage(chatId, "📦 Your collection is empty!");
                }
                
                let cardsMsg = `🎴 *${player.name}'s Cards (${cards.length})*\n\n`;
                cards.slice(0, 15).forEach((card, index) => {
                    cardsMsg += `${index + 1}. ${card.name} (${card.tier}) - ${card.series}\n`;
                });
                
                if (cards.length > 15) {
                    cardsMsg += `\n... and ${cards.length - 15} more cards`;
                }
                
                await bot.sendMessage(chatId, cardsMsg);
            } catch (error) {
                console.error('Cards error:', error);
                await bot.sendMessage(chatId, "❌ Error fetching cards.");
            }
        }
    },

    mtd: {
        description: "Move cards from collection to deck",
        usage: "mtd <collection_numbers>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, bot }) => {
            if (!args[0]) {
                return bot.sendMessage(chatId, "❌ Usage: !mtd <collection_numbers> (e.g., !mtd 1 5 12)");
            }
            
            try {
                const player = await Player.findOne({ userId: sender }).populate('collection deck');
                if (!player) {
                    return bot.sendMessage(chatId, "❌ Please register first!");
                }
                
                const cardNumbers = args.map(arg => parseInt(arg) - 1).filter(num => !isNaN(num));
                let moved = 0;
                
                for (const cardIndex of cardNumbers) {
                    if (cardIndex < 0 || cardIndex >= player.collection.length) continue;
                    
                    const emptySlot = player.deck.findIndex(slot => slot === null || slot === undefined);
                    if (emptySlot === -1) {
                        await bot.sendMessage(chatId, "⚠️ Deck is full! Some cards couldn't be moved.");
                        break;
                    }
                    
                    const card = player.collection[cardIndex];
                    player.deck[emptySlot] = card._id;
                    player.collection.splice(cardIndex, 1);
                    moved++;
                }
                
                await player.save();
                await bot.sendMessage(chatId, `✅ Moved ${moved} card(s) to deck!`);
            } catch (error) {
                console.error('MTD error:', error);
                await bot.sendMessage(chatId, "❌ Error moving cards.");
            }
        }
    },

    mtc: {
        description: "Move cards from deck to collection",
        usage: "mtc <deck_numbers> or mtc all",
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
                    for (let i = 0; i < 12; i++) {
                        if (player.deck[i] && player.deck[i] !== null) {
                            player.collection.push(player.deck[i]);
                            player.deck[i] = null;
                            moved++;
                        }
                    }
                } else {
                    const deckNumbers = args.map(arg => parseInt(arg) - 1).filter(num => !isNaN(num));
                    
                    for (const deckIndex of deckNumbers) {
                        if (deckIndex < 0 || deckIndex >= 12) continue;
                        
                        if (player.deck[deckIndex] && player.deck[deckIndex] !== null) {
                            player.collection.push(player.deck[deckIndex]);
                            player.deck[deckIndex] = null;
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
                const allCards = [...player.collection, ...player.deck.filter(card => card && card !== null)];
                const seriesCards = allCards.filter(card => 
                    card.series.toLowerCase().includes(seriesName.toLowerCase())
                );
                
                if (seriesCards.length === 0) {
                    return bot.sendMessage(chatId, `📦 No cards found for series: ${seriesName}`);
                }
                
                const tierOrder = ['Tier S', 'Tier 6', 'Tier 5', 'Tier 4', 'Tier 3', 'Tier 2', 'Tier 1'];
                const sortedCards = seriesCards.sort((a, b) => 
                    tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)
                );
                
                let seriesMsg = `🎭 *${player.name}'s ${seriesName} Cards (${seriesCards.length})*\n\n`;
                sortedCards.forEach((card, index) => {
                    seriesMsg += `${index + 1}. ${card.name} (${card.tier})\n`;
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
                const allCards = [...player.collection, ...player.deck.filter(card => card && card !== null)];
                const foundCards = allCards.filter(card => 
                    card.name.toLowerCase().includes(searchTerm)
                );
                
                if (foundCards.length === 0) {
                    return bot.sendMessage(chatId, `🔍 No cards found matching: ${searchTerm}`);
                }
                
                let searchMsg = `🔍 *Search Results for "${searchTerm}" (${foundCards.length})*\n\n`;
                foundCards.slice(0, 10).forEach((card, index) => {
                    searchMsg += `${index + 1}. ${card.name} (${card.tier}) - ${card.series}\n`;
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
    }
};

module.exports = cardCommands;
