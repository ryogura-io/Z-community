const mongoose = require('mongoose');
const Card = require('./models/Card');

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
    'Tier 1': { weight: 45, price: 100 },
    'Tier 2': { weight: 25, price: 250 },
    'Tier 3': { weight: 15, price: 500 },
    'Tier 4': { weight: 8, price: 1000 },
    'Tier 5': { weight: 4, price: 2000 },
    'Tier 6': { weight: 2, price: 5000 },
    'Tier S': { weight: 1, price: 10000 }
};

// Get weighted random card based on tier spawn rates
async function getRandomCard() {
    try {
        // Get total weight
        const totalWeight = Object.values(tierConfig).reduce((sum, config) => sum + config.weight, 0);
        let random = Math.random() * totalWeight;
        
        // Select tier based on weight
        let selectedTier = 'Tier 1';
        for (const [tier, config] of Object.entries(tierConfig)) {
            random -= config.weight;
            if (random <= 0) {
                selectedTier = tier;
                break;
            }
        }
        
        // Get random card from selected tier
        const tierCards = await Card.find({ tier: selectedTier });
        if (tierCards.length === 0) {
            // Fallback to any card if no cards in tier
            const totalCards = await Card.countDocuments();
            const randomIndex = Math.floor(Math.random() * totalCards);
            return await Card.findOne().skip(randomIndex);
        }
        
        const randomIndex = Math.floor(Math.random() * tierCards.length);
        return tierCards[randomIndex];
    } catch (error) {
        console.error('Error getting random card:', error);
        return null;
    }
}

// Check if group meets spawn requirements
async function canSpawnInGroup(sock, groupId) {
    try {
        // Check if it's a group
        if (!groupId.endsWith('@g.us')) return false;

        // Get group metadata
        const groupMeta = await sock.groupMetadata(groupId);
        
        // Check if group has at least 20 members
        // if (groupMeta.participants.length < 20) return false;

        // TODO: Add check for group enabled status from database
        // For now, assume all groups are enabled
        
        return true;
    } catch (error) {
        console.error('Error checking group spawn requirements:', error);
        return false;
    }
}

// Spawn a card in a group
async function spawnCard(sock, msgQueue, groupId) {
    try {
        // Check if group can have spawns
        if (!await canSpawnInGroup(sock, groupId)) return false;

        // Get random card
        const card = await getRandomCard();
        if (!card) return false;

        // Generate captcha
        const captcha = generateCaptcha();
        
        // Store active spawn
        activeSpawns.set(groupId, {
            card: card,
            captcha: captcha,
            spawnTime: Date.now(),
            groupId: groupId
        });

        // Get card price based on tier
        const cardPrice = tierConfig[card.tier]?.price || 100;
        
        // Create spawn message
        const spawnMessage = `🎴 *CARD SPAWNED!* 🎴\n\n` +
            `📜 *Name:* ${card.name}\n` +
            `⭐ *Tier:* ${card.tier}\n` +
            `🎭 *Series:* ${card.series}\n` +
            `👨‍🎨 *Maker:* ${card.maker}\n` +
            `💰 *Value:* ${cardPrice} shards\n\n` +
            `🔤 *Use:* !claim ${captcha}\n` +
            `⏰ *Expires in 1 hour*`;

        // Send spawn message with card image
        await msgQueue.sendMessage(groupId, {
            image: { url: card.img },
            caption: spawnMessage
        });

        console.log(`✅ Card spawned in ${groupId}: ${card.name} with captcha ${captcha}`);
        return true;

    } catch (error) {
        console.error('Error spawning card:', error);
        return false;
    }
}

// Get active spawn for a group
function getActiveSpawn(groupId) {
    return activeSpawns.get(groupId) || null;
}

// Remove active spawn (when claimed or expired)
function removeActiveSpawn(groupId) {
    return activeSpawns.delete(groupId);
}

// Cleanup expired spawns (call periodically)
function cleanupExpiredSpawns() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

    for (const [groupId, spawn] of activeSpawns.entries()) {
        if (now - spawn.spawnTime > oneHour) {
            activeSpawns.delete(groupId);
            console.log(`🗑️ Expired spawn removed from ${groupId}`);
        }
    }
}

// Schedule hourly card spawns
function scheduleCardSpawns(sock, msgQueue, enabledGroups) {
    // Clean up expired spawns every 10 minutes
    setInterval(cleanupExpiredSpawns, 10 * 60 * 1000);

    // Schedule spawns at the top of every hour
    const now = new Date();
    const msUntilNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000;

    setTimeout(() => {
        // Spawn cards at the top of the hour
        spawnCards(sock, msgQueue, enabledGroups);

        // Then schedule hourly spawns
        setInterval(() => {
            spawnCards(sock, msgQueue, enabledGroups);
        }, 60 * 60 * 1000); // Every hour

    }, msUntilNextHour);

    console.log(`⏰ Card spawning scheduled. Next spawn in ${Math.ceil(msUntilNextHour / 1000 / 60)} minutes`);
}

// Spawn cards in all eligible groups
async function spawnCards(sock, msgQueue, enabledGroups = []) {
    try {
        // Get all groups the bot is in
        const groups = await sock.groupFetchAllParticipating();
        
        for (const groupId of Object.keys(groups)) {
            // Skip if group spawning is disabled
            if (enabledGroups.length > 0 && !enabledGroups.includes(groupId)) continue;

            // Remove any existing spawn before creating new one
            if (activeSpawns.has(groupId)) {
                activeSpawns.delete(groupId);
            }

            // Spawn card in group
            await spawnCard(sock, msgQueue, groupId);
            
            // Add small delay between spawns to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`🎴 Spawning cycle completed at ${new Date().toLocaleTimeString()}`);
        
    } catch (error) {
        console.error('Error in spawnCards:', error);
    }
}

module.exports = {
    spawnCard,
    spawnCards,
    getActiveSpawn,
    removeActiveSpawn,
    generateCaptcha,
    getRandomCard,
    canSpawnInGroup,
    scheduleCardSpawns,
    cleanupExpiredSpawns,
    tierConfig
};
