const PokePlayer = require("../models/PokePlayer");
const Pokemon = require("../models/Pokemon");
const Group = require("../models/Group");
const { createCardGrid } = require("../utils/deckHelper");

const pokeSpawnManager = require("../pokeSpawn");

function calculateExpForLevel(level) {
    return Math.floor(level * level * 10);
}

async function checkAndEvolve(pokePlayer, pokemonInstance, sock, chatId, message) {
    if (!pokemonInstance.evolutionData.next || pokemonInstance.evolutionData.next.length === 0) {
        return null;
    }

    const nextEvolution = pokemonInstance.evolutionData.next[0];
    const [nextId, evolutionMethod] = nextEvolution;
    
    const levelMatch = evolutionMethod.match(/Level (\d+)/);
    if (!levelMatch) return null;
    
    const requiredLevel = parseInt(levelMatch[1]);
    
    if (pokemonInstance.level >= requiredLevel) {
        const evolvedPokemon = await Pokemon.findOne({ id: parseInt(nextId) });
        if (!evolvedPokemon) return null;

        const evolutionMsg = 
            `🌟 *EVOLUTION TIME!*\n\n` +
            `${pokemonInstance.displayName} is evolving into ${evolvedPokemon.name.english}!\n\n` +
            `React with ✅ to evolve or ❌ to cancel evolution.\n` +
            `(Auto-evolves in 30 seconds)`;

        const evolutionPrompt = await sock.sendMessage(
            chatId,
            { text: evolutionMsg },
            { quoted: message }
        );

        return new Promise((resolve) => {
            let evolved = false;
            
            const evolveToFinal = async () => {
                pokemonInstance.pokemonId = evolvedPokemon.id;
                pokemonInstance.name = evolvedPokemon.name.english.toLowerCase();
                pokemonInstance.displayName = evolvedPokemon.name.english;
                pokemonInstance.types = evolvedPokemon.type;
                pokemonInstance.hires = evolvedPokemon.image.hires;
                pokemonInstance.sprite = evolvedPokemon.image.sprite;
                pokemonInstance.species = evolvedPokemon.species;
                pokemonInstance.baseStats = {
                    hp: evolvedPokemon.base.HP,
                    attack: evolvedPokemon.base.Attack,
                    defense: evolvedPokemon.base.Defense,
                    spAttack: evolvedPokemon.base["Sp. Attack"],
                    spDefense: evolvedPokemon.base["Sp. Defense"],
                    speed: evolvedPokemon.base.Speed
                };
                pokemonInstance.evolutionData = {
                    prev: evolvedPokemon.evolution?.prev || [],
                    next: evolvedPokemon.evolution?.next || []
                };
                
                await pokePlayer.save();
                
                await sock.sendMessage(
                    chatId,
                    { text: `🎉 ${pokemonInstance.displayName} evolved successfully!` }
                );
            };
            
            const timeout = setTimeout(async () => {
                if (!evolved) {
                    evolved = true;
                    sock.ev.off('messages.upsert', messageHandler);
                    await evolveToFinal();
                    resolve(true);
                }
            }, 30000);

            const messageHandler = async (m) => {
                const msg = m.messages[0];
                if (!msg.message) return;
                
                const reaction = msg.message.reactionMessage;
                if (!reaction) return;
                if (reaction.key.id !== evolutionPrompt.key.id) return;
                
                if (reaction.text === '❌' && !evolved) {
                    evolved = true;
                    clearTimeout(timeout);
                    sock.ev.off('messages.upsert', messageHandler);
                    await sock.sendMessage(
                        chatId,
                        { text: `⛔ Evolution cancelled.` }
                    );
                    resolve(false);
                } else if (reaction.text === '✅' && !evolved) {
                    evolved = true;
                    clearTimeout(timeout);
                    sock.ev.off('messages.upsert', messageHandler);
                    await evolveToFinal();
                    resolve(true);
                }
            };
            
            sock.ev.on('messages.upsert', messageHandler);
        });
    }
    
    return null;
}

async function addExpToParty(pokePlayer, expAmount, sock, chatId, message) {
    const levelUpMessages = [];

    for (let pokemon of pokePlayer.party) {
        if (pokemon.level >= 100) continue;

        pokemon.exp += expAmount;

        while (pokemon.exp >= calculateExpForLevel(pokemon.level + 1) && pokemon.level < 100) {
            const requiredExp = calculateExpForLevel(pokemon.level + 1);
            pokemon.level += 1;
            pokemon.exp -= requiredExp;
            levelUpMessages.push(`${pokemon.displayName} leveled up to ${pokemon.level}!`);

            if (pokemon.evolutionData.next && pokemon.evolutionData.next.length > 0) {
                const nextEvolution = pokemon.evolutionData.next[0];
                const [nextId, evolutionMethod] = nextEvolution;
                const levelMatch = evolutionMethod.match(/Level (\d+)/);
                
                if (levelMatch) {
                    const requiredLevel = parseInt(levelMatch[1]);
                    if (pokemon.level >= requiredLevel) {
                        await checkAndEvolve(pokePlayer, pokemon, sock, chatId, message);
                    }
                }
            }
        }
    }

    await pokePlayer.save();
    return levelUpMessages;
}

const pokemonCommands = {
    begin: {
        description: "Start your Pokemon journey",
        usage: "begin <trainer_name>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !begin <trainer_name>" },
                    { quoted: message }
                );
            }

            try {
                let pokePlayer = await PokePlayer.findOne({ userId: sender });
                if (pokePlayer) {
                    return sock.sendMessage(
                        chatId,
                        { text: "✅ You've already started your Pokemon journey!" },
                        { quoted: message }
                    );
                }

                const trainerName = args.join(" ");
                pokePlayer = new PokePlayer({
                    userId: sender,
                    name: trainerName,
                    party: [],
                    pokedex: []
                });

                await pokePlayer.save();

                const welcomeMsg =
                    `🎉 *Welcome to the Pokemon World!*\n\n` +
                    `👤 *Trainer:* ${trainerName}\n` +
                    `📚 *Pokedex:* 0 Pokemon\n` +
                    `🎒 *Party:* Empty\n\n` +
                    `Wait for Pokemon spawns and use !catch to capture them!\n` +
                    `Use !party to view your active Pokemon!`;

                await sock.sendMessage(
                    chatId,
                    { text: welcomeMsg },
                    { quoted: message }
                );
            } catch (error) {
                console.error("Begin error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error starting Pokemon journey." },
                    { quoted: message }
                );
            }
        }
    },

    catch: {
        description: "Catch a spawned Pokemon by name",
        usage: "catch <pokemon_name>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !catch <pokemon_name>" },
                    { quoted: message }
                );
            }

            try {
                const activeSpawn = pokeSpawnManager.getActiveSpawn(chatId);
                if (!activeSpawn) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ No active Pokemon spawn in this group!" },
                        { quoted: message }
                    );
                }

                const pokemonName = args.join(" ").toLowerCase();
                if (pokemonName !== activeSpawn.pokemonData.name.toLowerCase()) {
                    return sock.sendMessage(
                        chatId,
                        { text: `❌ Wrong Pokemon! The spawned Pokemon is ${activeSpawn.pokemonData.displayName}!` },
                        { quoted: message }
                    );
                }

                let pokePlayer = await PokePlayer.findOne({ userId: sender });
                if (!pokePlayer) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please start your journey first using !begin <trainer_name>" },
                        { quoted: message }
                    );
                }

                const caughtPokemon = {
                    ...activeSpawn.pokemonData,
                    level: 1,
                    exp: 0,
                    capturedAt: new Date()
                };

                if (pokePlayer.party.length < 5) {
                    pokePlayer.party.push(caughtPokemon);
                } else {
                    pokePlayer.pokedex.push(caughtPokemon);
                }

                await pokePlayer.save();

                pokeSpawnManager.clearSpawn(chatId);

                const levelUpMsgs = await addExpToParty(pokePlayer, 5, sock, chatId, message);

                let successMsg =
                    `🎉 *POKEMON CAUGHT!*\n\n` +
                    `👤 *Trainer:* ${pokePlayer.name}\n` +
                    `🐾 *Pokemon:* ${caughtPokemon.displayName}\n` +
                    `📊 *Level:* ${caughtPokemon.level}\n` +
                    `🎒 *Added to:* ${pokePlayer.party.length <= 5 ? 'Party' : 'Pokedex'}\n`;

                if (levelUpMsgs.length > 0) {
                    successMsg += `\n📈 *Level Updates:*\n${levelUpMsgs.join('\n')}`;
                }

                await sock.sendMessage(
                    chatId,
                    { text: successMsg },
                    { quoted: message }
                );
            } catch (error) {
                console.error("Catch error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error catching Pokemon." },
                    { quoted: message }
                );
            }
        }
    },

    party: {
        description: "View your active Pokemon party",
        usage: "party",
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            try {
                const pokePlayer = await PokePlayer.findOne({ userId: sender });
                if (!pokePlayer) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please start your journey first using !begin <trainer_name>" },
                        { quoted: message }
                    );
                }

                if (pokePlayer.party.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Your party is empty! Catch some Pokemon first!" },
                        { quoted: message }
                    );
                }

                const partyPokemons = pokePlayer.party.map(p => ({
                    img: p.hires,
                    name: p.displayName
                }));

                const gridBuffer = await createCardGrid(partyPokemons, 3, 200, 200, 10);

                let caption = `🎒 *${pokePlayer.name}'s Party*\n\n`;
                pokePlayer.party.forEach((p, idx) => {
                    caption += `${idx + 1}. ${p.displayName} - Lv.${p.level} (${p.types.join('/')})\n`;
                });

                await sock.sendMessage(
                    chatId,
                    {
                        image: gridBuffer,
                        caption
                    },
                    { quoted: message }
                );
            } catch (error) {
                console.error("Party error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error displaying party." },
                    { quoted: message }
                );
            }
        }
    },

    swap: {
        description: "Swap positions of Pokemon in your party",
        usage: "swap <position1> <position2>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0] || !args[1]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !swap <position1> <position2>" },
                    { quoted: message }
                );
            }

            try {
                const pokePlayer = await PokePlayer.findOne({ userId: sender });
                if (!pokePlayer) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please start your journey first!" },
                        { quoted: message }
                    );
                }

                const pos1 = parseInt(args[0]) - 1;
                const pos2 = parseInt(args[1]) - 1;

                if (pos1 < 0 || pos1 >= pokePlayer.party.length || pos2 < 0 || pos2 >= pokePlayer.party.length) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Invalid party positions!" },
                        { quoted: message }
                    );
                }

                const temp = pokePlayer.party[pos1];
                pokePlayer.party[pos1] = pokePlayer.party[pos2];
                pokePlayer.party[pos2] = temp;

                await pokePlayer.save();

                await sock.sendMessage(
                    chatId,
                    { text: `✅ Swapped ${pokePlayer.party[pos2].displayName} with ${pokePlayer.party[pos1].displayName}!` },
                    { quoted: message }
                );
            } catch (error) {
                console.error("Swap error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error swapping Pokemon." },
                    { quoted: message }
                );
            }
        }
    },

    pokedex: {
        description: "View all owned Pokemon alphabetically",
        usage: "pokedex",
        adminOnly: false,
        execute: async ({ sender, chatId, sock, message }) => {
            try {
                const pokePlayer = await PokePlayer.findOne({ userId: sender });
                if (!pokePlayer) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please start your journey first!" },
                        { quoted: message }
                    );
                }

                const allPokemon = [...pokePlayer.party, ...pokePlayer.pokedex].sort((a, b) => 
                    a.displayName.localeCompare(b.displayName)
                );

                if (allPokemon.length === 0) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Your Pokedex is empty! Catch some Pokemon first!" },
                        { quoted: message }
                    );
                }

                let message_text = `📚 *${pokePlayer.name}'s Pokedex* (${allPokemon.length} Pokemon)\n\n`;
                
                allPokemon.forEach((p, idx) => {
                    message_text += `${idx + 1}. ${p.displayName} (#${p.pokemonId}) - Lv.${p.level}\n`;
                });

                await sock.sendMessage(
                    chatId,
                    { text: message_text },
                    { quoted: message }
                );
            } catch (error) {
                console.error("Pokedex error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error displaying Pokedex." },
                    { quoted: message }
                );
            }
        }
    },

    pokesearch: {
        description: "Search for a Pokemon and show details",
        usage: "pokesearch <pokemon_name>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !pokesearch <pokemon_name>" },
                    { quoted: message }
                );
            }

            try {
                const pokemonName = args.join(" ");
                const pokemon = await Pokemon.findOne({ 
                    "name.english": new RegExp(`^${pokemonName}$`, 'i') 
                });

                if (!pokemon) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Pokemon not found!" },
                        { quoted: message }
                    );
                }

                const pokePlayer = await PokePlayer.findOne({ userId: sender });
                let ownedIndices = [];

                if (pokePlayer) {
                    const allPokemon = [...pokePlayer.party, ...pokePlayer.pokedex];
                    ownedIndices = allPokemon
                        .map((p, idx) => p.pokemonId === pokemon.id ? idx + 1 : null)
                        .filter(idx => idx !== null);
                }

                const abilities = pokemon.profile.ability.map(a => a[0]).join(', ');

                let infoMsg =
                    `🔍 *Pokemon Information*\n\n` +
                    `📛 *Name:* ${pokemon.name.english}\n` +
                    `🔢 *Pokedex #:* ${pokemon.id}\n` +
                    `🏷️ *Type:* ${pokemon.type.join(', ')}\n` +
                    `📏 *Height:* ${pokemon.profile.height}\n` +
                    `⚖️ *Weight:* ${pokemon.profile.weight}\n` +
                    `🎯 *Species:* ${pokemon.species}\n` +
                    `⚡ *Abilities:* ${abilities}\n\n` +
                    `📊 *Base Stats:*\n` +
                    `❤️ HP: ${pokemon.base.HP}\n` +
                    `⚔️ Attack: ${pokemon.base.Attack}\n` +
                    `🛡️ Defense: ${pokemon.base.Defense}\n` +
                    `💫 Sp. Atk: ${pokemon.base["Sp. Attack"]}\n` +
                    `💎 Sp. Def: ${pokemon.base["Sp. Defense"]}\n` +
                    `⚡ Speed: ${pokemon.base.Speed}\n`;

                if (pokemon.evolution?.next && pokemon.evolution.next.length > 0) {
                    const nextEvolution = pokemon.evolution.next[0];
                    const [nextId, method] = nextEvolution;
                    const nextPokemon = await Pokemon.findOne({ id: parseInt(nextId) });
                    if (nextPokemon) {
                        infoMsg += `\n🔄 *Evolution:* Evolves to ${nextPokemon.name.english} (${method})\n`;
                    }
                }

                if (ownedIndices.length > 0) {
                    infoMsg += `\n🎒 *Owned:* Pokedex indices: ${ownedIndices.join(', ')}`;
                }

                await sock.sendMessage(
                    chatId,
                    {
                        image: { url: pokemon.image.hires },
                        caption: infoMsg
                    },
                    { quoted: message }
                );
            } catch (error) {
                console.error("Pokesearch error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error searching Pokemon." },
                    { quoted: message }
                );
            }
        }
    },

    givepokemon: {
        description: "Give a Pokemon from your party to another trainer",
        usage: "givepokemon <party_position> @mention",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0] || !message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !givepokemon <party_position> @mention" },
                    { quoted: message }
                );
            }

            try {
                const position = parseInt(args[0]) - 1;
                const recipient = message.message.extendedTextMessage.contextInfo.mentionedJid[0];

                const senderPlayer = await PokePlayer.findOne({ userId: sender });
                if (!senderPlayer) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ You haven't started your journey yet!" },
                        { quoted: message }
                    );
                }

                if (position < 0 || position >= senderPlayer.party.length) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Invalid party position!" },
                        { quoted: message }
                    );
                }

                const recipientPlayer = await PokePlayer.findOne({ userId: recipient });
                if (!recipientPlayer) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Recipient hasn't started their journey yet!" },
                        { quoted: message }
                    );
                }

                const pokemon = senderPlayer.party.splice(position, 1)[0];

                if (recipientPlayer.party.length < 5) {
                    recipientPlayer.party.push(pokemon);
                } else {
                    recipientPlayer.pokedex.push(pokemon);
                }

                await senderPlayer.save();
                await recipientPlayer.save();

                await sock.sendMessage(
                    chatId,
                    {
                        text: `✅ ${senderPlayer.name} gave ${pokemon.displayName} (Lv.${pokemon.level}) to ${recipientPlayer.name}!`,
                        mentions: [sender, recipient]
                    },
                    { quoted: message }
                );
            } catch (error) {
                console.error("Givepokemon error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error transferring Pokemon." },
                    { quoted: message }
                );
            }
        }
    },

    mtp: {
        description: "Move Pokemon from Pokedex to Party",
        usage: "mtp <pokedex_index>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !mtp <pokedex_index>" },
                    { quoted: message }
                );
            }

            try {
                const pokePlayer = await PokePlayer.findOne({ userId: sender });
                if (!pokePlayer) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please start your journey first!" },
                        { quoted: message }
                    );
                }

                if (pokePlayer.party.length >= 5) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Your party is full! (Max 5 Pokemon)" },
                        { quoted: message }
                    );
                }

                const allPokemon = [...pokePlayer.party, ...pokePlayer.pokedex];
                const index = parseInt(args[0]) - 1;

                if (index < 0 || index >= allPokemon.length) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Invalid Pokedex index!" },
                        { quoted: message }
                    );
                }

                if (index < pokePlayer.party.length) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ This Pokemon is already in your party!" },
                        { quoted: message }
                    );
                }

                const dexIndex = index - pokePlayer.party.length;
                const movedPokemon = pokePlayer.pokedex.splice(dexIndex, 1)[0];
                pokePlayer.party.push(movedPokemon);

                await pokePlayer.save();

                await sock.sendMessage(
                    chatId,
                    { text: `✅ Moved ${movedPokemon.displayName} to party!` },
                    { quoted: message }
                );
            } catch (error) {
                console.error("MTP error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error moving Pokemon." },
                    { quoted: message }
                );
            }
        }
    },

    mtx: {
        description: "Move Pokemon from Party to Pokedex",
        usage: "mtx <party_position>",
        adminOnly: false,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0]) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !mtx <party_position>" },
                    { quoted: message }
                );
            }

            try {
                const pokePlayer = await PokePlayer.findOne({ userId: sender });
                if (!pokePlayer) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Please start your journey first!" },
                        { quoted: message }
                    );
                }

                const position = parseInt(args[0]) - 1;

                if (position < 0 || position >= pokePlayer.party.length) {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Invalid party position!" },
                        { quoted: message }
                    );
                }

                const movedPokemon = pokePlayer.party.splice(position, 1)[0];
                pokePlayer.pokedex.push(movedPokemon);

                await pokePlayer.save();

                await sock.sendMessage(
                    chatId,
                    { text: `✅ Moved ${movedPokemon.displayName} to Pokedex!` },
                    { quoted: message }
                );
            } catch (error) {
                console.error("MTX error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error moving Pokemon." },
                    { quoted: message }
                );
            }
        }
    },

    sumpoke: {
        description: "Summon a Pokemon spawn immediately (Admin only)",
        usage: "sumpoke",
        adminOnly: true,
        execute: async ({ sender, chatId, sock, msgQueue, message }) => {
            try {
                const group = await Group.findOne({ groupId: chatId });
                if (!group || group.pokespawn !== "enabled") {
                    return sock.sendMessage(
                        chatId,
                        { text: "❌ Pokemon spawns are disabled in this group!" },
                        { quoted: message }
                    );
                }

                await pokeSpawnManager.spawnPokemon(sock, msgQueue, chatId);
                
                await sock.sendMessage(
                    chatId,
                    { text: "✅ Pokemon spawn summoned!" },
                    { quoted: message }
                );
            } catch (error) {
                console.error("Sumpoke error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error summoning Pokemon spawn." },
                    { quoted: message }
                );
            }
        }
    },

    pokespawn: {
        description: "Enable or disable Pokemon spawns in the group (Admin only)",
        usage: "pokespawn <enable|disable>",
        adminOnly: true,
        execute: async ({ sender, chatId, args, sock, message }) => {
            if (!args[0] || !['enable', 'disable'].includes(args[0].toLowerCase())) {
                return sock.sendMessage(
                    chatId,
                    { text: "❌ Usage: !pokespawn <enable|disable>" },
                    { quoted: message }
                );
            }

            try {
                const action = args[0].toLowerCase();
                let group = await Group.findOne({ groupId: chatId });

                if (!group) {
                    group = new Group({
                        groupId: chatId,
                        pokespawn: action === 'enable' ? 'enabled' : 'disabled'
                    });
                } else {
                    group.pokespawn = action === 'enable' ? 'enabled' : 'disabled';
                }

                await group.save();

                await sock.sendMessage(
                    chatId,
                    { text: `✅ Pokemon spawns ${action}d in this group!` },
                    { quoted: message }
                );
            } catch (error) {
                console.error("Pokespawn error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error changing Pokemon spawn settings." },
                    { quoted: message }
                );
            }
        }
    }
};

module.exports = pokemonCommands;
