const mongoose = require('mongoose');
const Card = require('./models/Card');
const Group = require("./models/Group")

// Store active spawns per group
const activeSpawns = new Map();

// Generate random 5-letter captcha
function generateCaptcha() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let captcha = '';
    for (let i = 0; i < 5; i++) {
        captcha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return captcha;
}

// Tier spawn rates and prices
const tierConfig = {
    '1': { weight: 45, price: 100 },
    '2': { weight: 25, price: 250 },
    '3': { weight: 15, price: 500 },
    '4': { weight: 8, price: 1000 },
    '5': { weight: 4, price: 2000 },
    '6': { weight: 2, price: 5000 },
    'S': { weight: 1, price: 10000 }
};

// Get weighted random card based on tier spawn rates
async function getRandomCard() {
    try {
        // Get total weight
        const totalWeight = Object.values(tierConfig).reduce((sum, config) => sum + config.weight, 0);
        let random = Math.random() * totalWeight;

        // Select tier based on weight
        let selectedTier = '1';
        for (const [tier, config] of Object.entries(tierConfig)) {
            random -= config.weight;
            if (random <= 0) {
                selectedTier = tier;
                break;
            }
        }

        // Count cards in selected tier
        const count = await Card.countDocuments({ tier: selectedTier });
        if (count === 0) {
            // Fallback: pick a completely random card
            const totalCards = await Card.countDocuments();
            const randomIndex = Math.floor(Math.random() * totalCards);
            return await Card.findOne().skip(randomIndex);
        }

        // Pick random card from selected tier
        const randomIndex = Math.floor(Math.random() * count);
        return await Card.findOne({ tier: selectedTier }).skip(randomIndex);
    } catch (error) {
        console.error('Error getting random card:', error);
        return null;
    }
}

// Check if group meets spawn requirements
async function canSpawnInGroup(sock, groupId) {
    try {
        if (!groupId.endsWith('@g.us')) return false;

        const groupMeta = await sock.groupMetadata(groupId);

        // Example requirement: 20+ members
        // if (groupMeta.participants.length < 20) return false;

        return true;
    } catch (error) {
        console.error('Error checking group spawn requirements:', error);
        return false;
    }
}

// Spawn a card in a group
async function spawnCard(sock, msgQueue, groupId) {
    try {
        if (!await canSpawnInGroup(sock, groupId)) return false;

        const card = await getRandomCard();
        if (!card) return false;

        const captcha = generateCaptcha();

        activeSpawns.set(groupId, {
            card,
            captcha,
            spawnTime: Date.now(),
            groupId
        });

        const cardPrice = tierConfig[card.tier]?.price || 100;

        const spawnMessage = `┌──「 *CARD SPAWN* 」\n\n` +
            `📜 *Name:* ${card.name}\n` +
            `⭐ *Tier:* ${card.tier}\n` +
            `🎭 *Series:* ${card.series}\n` +
            `👨‍🎨 *Maker:* ${card.maker}\n` +
            `💰 *Value:* ${cardPrice} shards\n\n` +
            `> *Use:* !claim *${captcha}* to claim`;

        if (card.tier === '6' || card.tier === 'S') {
            // send as video (webm/mp4)
            await msgQueue.sendMessage(groupId, {
                video: { url: card.img },
                caption: spawnMessage,
                mimetype: 'video/mp4',
                gifPlayback: true
            });
        } else {
            // send as image
            await msgQueue.sendMessage(groupId, {
                image: { url: card.img },
                caption: spawnMessage
            });
        }

        console.log(`✅ Card spawned in ${groupId}: ${card.name} [Captcha: ${captcha}]`);
        return true;
    } catch (error) {
        console.error('Error spawning card:', error);
        return false;
    }
}

async function forceSpawnCard(sock, msgQueue, groupId, arg = null) {
    try {
        if (!await canSpawnInGroup(sock, groupId)) return false;

        let card;

        if (!arg) {
            // No args → random card
            card = await getRandomCard();
        } else if (arg.startsWith("http")) {
            // URL given → find by url
            card = await Card.findOne({ url: arg });
        } else {
            // Otherwise → treat as name (case-insensitive)
            card = await Card.findOne({ name: new RegExp(arg, "i") });
        }

        if (!card) return false;

        const captcha = generateCaptcha();

        activeSpawns.set(groupId, {
            card,
            captcha,
            spawnTime: Date.now(),
            groupId
        });

        const cardPrice = tierConfig[card.tier]?.price || 100;

        const spawnMessage = `┌──「 *CARD SUMMONS*  」\n\n` +
            `📜 *Name:* ${card.name}\n` +
            `⭐ *Tier:* ${card.tier}\n` +
            `🎭 *Series:* ${card.series}\n` +
            `👨‍🎨 *Maker:* ${card.maker}\n` +
            `💰 *Value:* ${cardPrice} shards\n\n` +
            `> *Use:* !claim *${captcha}* to claim`;

        if (card.tier === '6' || card.tier === 'S') {
            await msgQueue.sendMessage(groupId, {
                video: { url: card.img },
                caption: spawnMessage,
                mimetype: 'video/mp4',
                gifPlayback: true
            });
        } else {
            await msgQueue.sendMessage(groupId, {
                image: { url: card.img },
                caption: spawnMessage
            });
        }

        console.log(`✅ Forced spawn in ${groupId}: ${card.name} [Captcha: ${captcha}]`);
        return true;
    } catch (error) {
        console.error("Error forcing spawn:", error);
        return false;
    }
}


function getActiveSpawn(groupId) {
    return activeSpawns.get(groupId) || null;
}

function removeActiveSpawn(groupId) {
    return activeSpawns.delete(groupId);
}

function cleanupExpiredSpawns() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [groupId, spawn] of activeSpawns.entries()) {
        if (now - spawn.spawnTime > oneHour) {
            activeSpawns.delete(groupId);
            console.log(`🗑️ Expired spawn removed from ${groupId}`);
        }
    }
}

// Flexible spawn times array (minutes in each hour)
const spawnTimes = [0, 30, 45, 50]; // default: every hour at :00 and :30

function scheduleCardSpawns(sock, msgQueue) {
    setInterval(cleanupExpiredSpawns, 10 * 60 * 1000);

    function getMsUntilNextSpawn() {
        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();

        let nextMinute = null;
        for (const t of spawnTimes) {
            if (minutes < t) {
                nextMinute = t;
                break;
            }
        }

        if (nextMinute === null) {
            nextMinute = spawnTimes[0];
            now.setHours(now.getHours() + 1);
        }

        const target = new Date(now);
        target.setMinutes(nextMinute, 0, 0);

        return target.getTime() - Date.now();
    }

    async function scheduleNext() {
        const delay = getMsUntilNextSpawn();
        console.log(`⏰ Next spawn in ${Math.ceil(delay / 60000)} minutes`);

        setTimeout(async () => {
            console.log("🚀 Spawn cycle triggered");
            await spawnCards(sock, msgQueue);
            scheduleNext();
        }, delay);
    }

    scheduleNext();
}

async function spawnCards(sock, msgQueue) {
    try {
        // ✅ Fetch groups that are enabled for spawns
        const enabledGroups = await Group.find({
            status: "enabled",
            spawn: "enabled"
        }).lean();

        if (enabledGroups.length === 0) {
            console.log("⚠️ No enabled groups found, skipping spawn cycle");
            return;
        }

        for (const g of enabledGroups) {
            const groupId = g.groupId;

            if (activeSpawns.has(groupId)) {
                activeSpawns.delete(groupId); // cleanup previous
            }

            await spawnCard(sock, msgQueue, groupId);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`🎴 Spawning cycle completed at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
        console.error("Error in spawnCards:", error);
    }
}

module.exports = {
    spawnCard,
    spawnCards,
    getActiveSpawn,
    removeActiveSpawn,
    generateCaptcha,
    getRandomCard,
    forceSpawnCard,
    canSpawnInGroup,
    scheduleCardSpawns,
    cleanupExpiredSpawns,
    tierConfig
};
