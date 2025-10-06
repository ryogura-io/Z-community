const Group = require("./models/Group");
const Pokemon = require("./models/Pokemon");

const activeSpawns = new Map();

async function getRandomPokemon() {
    try {
        const count = await Pokemon.countDocuments();
        if (count === 0) {
            console.error("No Pokemon in database!");
            return null;
        }
        
        const randomIndex = Math.floor(Math.random() * count);
        const pokemon = await Pokemon.findOne().skip(randomIndex);
        
        return pokemon;
    } catch (error) {
        console.error("Error getting random Pokemon:", error);
        return null;
    }
}

function formatPokemonInstance(pokemonDoc) {
    return {
        pokemonId: pokemonDoc.id,
        name: pokemonDoc.name.english.toLowerCase(),
        displayName: pokemonDoc.name.english,
        level: 1,
        exp: 0,
        types: pokemonDoc.type,
        hires: pokemonDoc.image.hires,
        sprite: pokemonDoc.image.sprite,
        species: pokemonDoc.species,
        baseStats: {
            hp: pokemonDoc.base.HP,
            attack: pokemonDoc.base.Attack,
            defense: pokemonDoc.base.Defense,
            spAttack: pokemonDoc.base["Sp. Attack"],
            spDefense: pokemonDoc.base["Sp. Defense"],
            speed: pokemonDoc.base.Speed
        },
        evolutionData: {
            prev: pokemonDoc.evolution?.prev || [],
            next: pokemonDoc.evolution?.next || []
        }
    };
}

async function canSpawnInGroup(sock, groupId) {
    try {
        if (!groupId.endsWith("@g.us")) return false;

        const group = await Group.findOne({ groupId });
        if (!group || group.pokespawn !== "enabled") return false;

        return true;
    } catch (error) {
        console.error("Error checking group spawn requirements:", error);
        return false;
    }
}

async function spawnPokemon(sock, msgQueue, groupId) {
    try {
        if (!(await canSpawnInGroup(sock, groupId))) return false;

        const pokemonDoc = await getRandomPokemon();
        if (!pokemonDoc) return false;

        const pokemonData = formatPokemonInstance(pokemonDoc);

        activeSpawns.set(groupId, {
            pokemonData,
            pokemonDoc,
            spawnTime: Date.now(),
            groupId,
        });

        await Group.findOneAndUpdate(
            { groupId },
            {
                activePokemonSpawn: {
                    pokemonName: pokemonData.name,
                    pokemonData: pokemonData,
                },
            }
        );

        const abilities = pokemonDoc.profile.ability
            .slice(0, 2)
            .map(a => a[0])
            .join(', ');

        const spawnMessage =
            `┌──「 *POKEMON SPAWN* 」\n\n` +
            `🐾 *Name:* ${pokemonData.displayName}\n` +
            `🔢 *Pokedex #:* ${pokemonDoc.id}\n` +
            `🏷️ *Type:* ${pokemonData.types.join(', ')}\n` +
            `📏 *Height:* ${pokemonDoc.profile.height}\n` +
            `⚖️ *Weight:* ${pokemonDoc.profile.weight}\n` +
            `⚡ *Abilities:* ${abilities}\n` +
            `🎯 *Species:* ${pokemonData.species}\n\n` +
            `> *Use:* *!catch ${pokemonData.name}* to catch this Pokemon!`;

        await msgQueue.sendMessage(groupId, {
            image: { url: pokemonData.hires },
            caption: spawnMessage,
        });

        console.log(
            `✅ Pokemon spawned in ${groupId}: ${pokemonData.displayName}`
        );
        return true;
    } catch (error) {
        console.error("Error spawning Pokemon:", error);
        return false;
    }
}

function getActiveSpawn(groupId) {
    return activeSpawns.get(groupId) || null;
}

function clearSpawn(groupId) {
    activeSpawns.delete(groupId);
    Group.findOneAndUpdate(
        { groupId },
        { activePokemonSpawn: { pokemonName: null, pokemonData: null } }
    ).catch(err => console.error('Error clearing spawn from DB:', err));
}

async function schedulePokemonSpawns(sock, msgQueue) {
    const MIN_INTERVAL = 30 * 60 * 1000;
    const MAX_INTERVAL = 60 * 60 * 1000;

    async function scheduleNext() {
        const interval = Math.floor(Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)) + MIN_INTERVAL;
        console.log(`⏰ Next Pokemon spawn in ${Math.floor(interval / 60000)} minutes`);

        setTimeout(async () => {
            try {
                const groups = await Group.find({ 
                    status: "enabled",
                    pokespawn: "enabled" 
                });

                for (const group of groups) {
                    try {
                        await spawnPokemon(sock, msgQueue, group.groupId);
                    } catch (err) {
                        console.error(`Error spawning in group ${group.groupId}:`, err);
                    }
                }
            } catch (error) {
                console.error("Error in Pokemon spawn scheduler:", error);
            }

            scheduleNext();
        }, interval);
    }

    scheduleNext();
}

module.exports = {
    spawnPokemon,
    getActiveSpawn,
    clearSpawn,
    schedulePokemonSpawns,
};
