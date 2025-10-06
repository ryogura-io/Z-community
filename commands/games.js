// Simple game storage (in-memory)
const gameStates = new Map();
const axios = require("axios");
const Player = require("../models/Player");
const scrambleWord = (word) => {
    return word
        .split("")
        .sort(() => 0.5 - Math.random())
        .join("");
};

function isGameActive(chatId, sock, message) {
    if (gameStates.has(chatId)) {
        sock.sendMessage(
            chatId,
            {
                text: "❌ A game is already running here! Finish it before starting another.",
            },
            { quoted: message },
        );
        return true;
    }
    return false;
}

async function checkStreak(player, sock, chatId, message) {
    player.gameWins++;
    if (player.lastGameResult === "win") {
        player.gameStreak += 1;
    } else {
        player.gameStreak = 1;
    }

    const milestones = {
        5: 500,
        10: 1000,
        20: 1500,
        40: 3000,
        80: 6000,
        160: 12000,
    };

    if (milestones[player.gameStreak]) {
        let reward = milestones[player.gameStreak];
        player.shards += reward;
        await sock.sendMessage(
            chatId,
            {
                text: `🔥 *Streak Bonus!* ${player.gameStreak} wins in a row!\n💰 You earned +${reward} shards!`,
            },
            { quoted: message },
        );
    }
}

async function startRound(game, chatId, sock, message) {
    // Safety: if currentTurn is invalid, reset to 0
    if (game.currentTurn >= game.players.length) game.currentTurn = 0;
    if (game.players.length === 0) {
        gameStates.delete(chatId);
        return;
    }

    const currentPlayer = game.players[game.currentTurn];
    if (!currentPlayer) {
        console.error("No current player found:", game);
        return;
    }

    const playerTag = `@${currentPlayer.split("@")[0]}`;

    await sock.sendMessage(
        chatId,
        {
            text: `🌀 *Round Start!*\n\n👉 ${playerTag}'s turn!\nEnter a *${game.wordLength}-letter word* starting with *${game.currentLetter.toUpperCase()}*\n\nUse: !a <word>`,
            mentions: [currentPlayer],
        },
        { quoted: message },
    );

    // Timeout for the round
    game.roundTimer = setTimeout(async () => {
        const current = gameStates.get(chatId);

        // If game was deleted or replaced by another game, stop this timer
        if (!current || current.id !== game.id) {
            console.log(`[TIMER] Skipped expired timer for game ${game.id}`);
            return;
        }

        await sock.sendMessage(
            chatId,
            {
                text: `⏰ ${playerTag} took too long and has been removed!`,
                mentions: [currentPlayer],
            },
            { quoted: message },
        );

        // Remove timed-out player
        current.players.splice(current.currentTurn, 1);

        // End game if only one remains
        if (current.players.length === 1) {
            await sock.sendMessage(
                chatId,
                {
                    text: `🏆 Winner: @${current.players[0].split("@")[0]}!`,
                    mentions: [current.players[0]],
                },
                { quoted: message },
            );
            gameStates.delete(chatId);
            return;
        }

        // Adjust currentTurn if needed
        if (current.currentTurn >= current.players.length)
            current.currentTurn = 0;

        await nextTurn(current, chatId, sock, message);
    }, game.timeLimit * 1000);
}

async function nextTurn(game, chatId, sock, message) {
    clearTimeout(game.roundTimer);

    if (game.players.length === 0) {
        gameStates.delete(chatId);
        return;
    }

    game.currentTurn = (game.currentTurn + 1) % game.players.length;

    // After each full rotation
    if (game.currentTurn === 0) {
        game.wordLength++;
        game.timeLimit = Math.max(20, game.timeLimit - 5);
        await sock.sendMessage(chatId, {
            text: `🔄 *New Round!*\nWord length increased to ${game.wordLength} letters.\nTime reduced to ${game.timeLimit}s.`,
        });
    }

    game.currentLetter = String.fromCharCode(
        97 + Math.floor(Math.random() * 26),
    );
    await startRound(game, chatId, sock, message);
}


const gameCommands = {
    hangman: {
        description: "Start a hangman game",
        usage: "hangman",
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, message, sender } = context;
            if (isGameActive(chatId, sock, message)) return;

            async function getRandomWord() {
                try {
                    const res = await fetch(
                        "https://random-word-api.herokuapp.com/word?number=1",
                    );
                    const data = await res.json();
                    return data[0]; // API returns an array of words
                } catch (error) {
                    console.error(
                        "Random word API failed, falling back:",
                        error.message,
                    );
                    const fallbackWords = [
                        "javascript",
                        "whatsapp",
                        "computer",
                        "programming",
                        "android",
                        "technology",
                        "artificial",
                        "intelligence",
                    ];
                    return fallbackWords[
                        Math.floor(Math.random() * fallbackWords.length)
                    ];
                }
            }

            try {
                const word = (await getRandomWord()).toLowerCase();

                const gameState = {
                    word,
                    guessed: Array(word.length).fill("_"),
                    wrongGuesses: [],
                    maxWrong: 7,
                    gameType: "hangman",
                };

                gameStates.set(chatId, gameState);

                const gameText =
                    `🎮 *Hangman Game Started!*\n\n` +
                    `Word: ${gameState.guessed.join(" ")}\n` +
                    `Wrong guesses: ${gameState.wrongGuesses.length}/${gameState.maxWrong}\n\n` +
                    `Use !a <letter> to guess a letter!`;

                await sock.sendMessage(
                    chatId,
                    { text: gameText },
                    { quoted: message },
                );
            } catch (err) {
                console.error("Hangman command error:", err);
                await sock.sendMessage(
                    chatId,
                    {
                        text: "⚠️ Could not start a new hangman game. Please try again.",
                    },
                    { quoted: message },
                );
            }
        },
    },

    trivia: {
        description: "Start a trivia game",
        usage: "trivia",
        aliases: ["quiz"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, message, sender } = context;
            if (isGameActive(chatId, sock, message)) return;

            try {
                // ✅ Fetch 1 trivia question
                const res = await axios.get(
                    "https://opentdb.com/api.php?amount=1&type=multiple",
                );
                const data = res.data.results[0];

                // Decode HTML entities (sometimes OpenTDB returns `&quot;`)
                const he = require("he");
                const question = he.decode(data.question);
                const correct = he.decode(data.correct_answer);
                const options = [
                    ...data.incorrect_answers.map((o) => he.decode(o)),
                    correct,
                ];

                // Shuffle options
                options.sort(() => Math.random() - 0.5);

                // ✅ Store game state
                const gameState = {
                    question,
                    answer: correct.toLowerCase(),
                    options,
                    gameType: "trivia",
                };
                gameStates.set(chatId, gameState);

                // ✅ Send question
                const gameText =
                    `🧠 *Trivia Question*\n\n${question}\n\n` +
                    options.map((o, i) => `${i + 1}. ${o}`).join("\n") +
                    `\n\nUse !a <answer> to reply! (you can type the full answer or the number)`;

                await sock.sendMessage(
                    chatId,
                    { text: gameText },
                    { quoted: message },
                );

                // Auto delete after 15s
                setTimeout(async () => {
                    const game = gameStates.get(chatId);

                    if (game && game.answer === correct.toLowerCase()) {
                        gameStates.delete(chatId);

                        await sock.sendMessage(
                            chatId,
                            {
                                text: `⏰ Time's up! The answer wasn't guessed in 15s.\nThe answer was *${game.answer}*`,
                                mentions: [sender],
                            },
                            { quoted: message },
                        );

                        console.log(`⌛ Trivia game expired in ${chatId}`);
                    }
                }, 15 * 1000);
            } catch (err) {
                console.error("Trivia error:", err.message);
                await sock.sendMessage(
                    chatId,
                    {
                        text: "⚠️ Couldn't fetch a trivia question, try again later.",
                    },
                    { quoted: message },
                );
            }
        },
    },

    tictactoe: {
        description: "Play TicTacToe with another user",
        usage: "tictactoe",
        aliases: ["ttt"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sender, sock, message } = context;
            const TicTacToe = require("../utils/tictactoe");

            // Check if game already exists
            if (
                gameStates.has(chatId) &&
                gameStates.get(chatId).gameType === "tictactoe"
            ) {
                await sock.sendMessage(
                    chatId,
                    {
                        text: "❌ A TicTacToe game is already running here! Use !a <move> to play.",
                    },
                    { quoted: message },
                );
                return;
            }

            // Ensure a second player (must mention or reply)
            let opponent;
            if (
                message?.message?.extendedTextMessage?.contextInfo?.mentionedJid
                    ?.length > 0
            ) {
                opponent =
                    message.message.extendedTextMessage.contextInfo
                        .mentionedJid[0];
            } else if (
                message?.message?.extendedTextMessage?.contextInfo?.participant
            ) {
                opponent =
                    message.message.extendedTextMessage.contextInfo.participant;
            }

            if (!opponent) {
                await sock.sendMessage(
                    chatId,
                    {
                        text: "❌ Please mention or reply to someone to challenge them.",
                    },
                    { quoted: message },
                );
                return;
            }

            if (opponent === sender) {
                await sock.sendMessage(
                    chatId,
                    { text: "❌ You cannot play against yourself." },
                    { quoted: message },
                );
                return;
            }

            // Create new game
            const game = new TicTacToe(sender, opponent);
            const state = {
                game,
                gameType: "tictactoe",
            };
            gameStates.set(chatId, state);

            const board = game.render().map(
                (v) =>
                    ({
                        X: "❎",
                        O: "⭕",
                        1: "1️⃣",
                        2: "2️⃣",
                        3: "3️⃣",
                        4: "4️⃣",
                        5: "5️⃣",
                        6: "6️⃣",
                        7: "7️⃣",
                        8: "8️⃣",
                        9: "9️⃣",
                    })[v],
            );

            const msg = `
🎮 *TicTacToe Started!*
Player ❎: @${sender.split("@")[0]}
Player ⭕: @${opponent.split("@")[0]}

${board.slice(0, 3).join("")}
${board.slice(3, 6).join("")}
${board.slice(6).join("")}

Turn: @${game.currentTurn.split("@")[0]} (❎)

Use !a <1-9> to make a move, or type !a surrender to give up.
`;

            await sock.sendMessage(chatId, {
                text: msg,
                mentions: [sender, opponent],
            });
        },
    },

    poke: {
        description: 'Play "Who’s That Pokémon?"',
        usage: "poke",
        aliases: ["pokem"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, sender, message } = context;
            if (isGameActive(chatId, sock, message)) return;

            try {
                // pick random Pokémon ID (1 – 898)
                const id = Math.floor(Math.random() * 898) + 1;
                const res = await axios.get(
                    `https://pokeapi.co/api/v2/pokemon/${id}`,
                );
                const pokemon = res.data;

                // mask the Pokémon name
                const hiddenName = pokemon.name.replace(/[a-zA-Z]/g, "_");

                // pick official artwork or fallback sprite
                const imageUrl =
                    pokemon.sprites?.other?.["official-artwork"]
                        ?.front_default || pokemon.sprites?.front_default;

                // store game state so we can check answers later
                gameStates.set(chatId, {
                    gameType: "poke",
                    answer: pokemon.name.toLowerCase(),
                    attempts: 0, // wrong attempts so far
                    maxAttempts: 2, // limit (3 chances)
                });

                const caption =
                    `🎮 *Who's That Pokémon?*\n\n` +
                    `Name: ${hiddenName}\n\n` +
                    `Reply with !a <your guess>`;

                if (imageUrl) {
                    // fetch Pokémon image → Buffer
                    const imgRes = await axios.get(imageUrl, {
                        responseType: "arraybuffer",
                    });
                    const imgBuffer = Buffer.from(imgRes.data);

                    // use the dedicated wrapper
                    // await sock.sendMessage(chatId, { img :imgBuffer, caption);
                    await sock.sendMessage(
                        chatId,
                        { image: imgBuffer, caption: caption },
                        { quoted: message },
                    );
                    // Auto delete after 10s
                    setTimeout(async () => {
                        const game = gameStates.get(chatId);

                        if (
                            game &&
                            game.answer === pokemon.name.toLowerCase()
                        ) {
                            gameStates.delete(chatId);

                            await sock.sendMessage(
                                chatId,
                                {
                                    text: `⏰ Time's up! The Pokémon wasn't guessed in 15s.\nThe answer was *${game.answer}*`,
                                    mentions: [sender],
                                },
                                { quoted: message },
                            );

                            console.log(`⌛ Pokémon game expired in ${chatId}`);
                        }
                    }, 15 * 1000);
                } else {
                    // fallback: no image, just send caption
                    await sock.sendMessage(
                        chatId,
                        { text: caption },
                        { quoted: message },
                    );
                }
            } catch (err) {
                console.error("PokéAPI error:", err?.message ?? err);
                await sock.sendMessage(
                    chatId,
                    { text: "⚠️ Could not fetch a Pokémon, try again!" },
                    { quoted: message },
                );
            }
        },
    },

    scramble: {
        description: "Start a word scramble game",
        usage: "scramble",
        adminOnly: false,
        execute: async ({ chatId, sock, message, sender }) => {
            try {
                // Fetch a random word
                const res = await axios.get(
                    "https://random-word-api.herokuapp.com/word?number=1",
                );
                const word = res.data[0].toLowerCase();

                const scrambled = scrambleWord(word);
                if (scrambled === word) {
                    // Reshuffle if scramble came out identical
                    return gameCommands.scramble.execute({ chatId, sock });
                }

                // Save state
                gameStates.set(chatId, {
                    gameType: "scramble",
                    answer: word,
                    scrambled,
                    attempts: 0,
                    maxAttempts: 3,
                });

                const msg = `🔀 *Word Scramble!*\n\nRearrange the letters to form a word:\n\n👉 ${scrambled}\n\nUse !a <word> to guess. You have 3 chances!`;

                await sock.sendMessage(
                    chatId,
                    { text: msg },
                    { quoted: message },
                );

                // Auto delete after 10s
                setTimeout(async () => {
                    const game = gameStates.get(chatId);

                    if (game && game.answer === word) {
                        gameStates.delete(chatId);

                        await sock.sendMessage(
                            chatId,
                            {
                                text: `⏰ Time's up! The word wasn't guessed right after 45 seconds.\nThe answer was *${game.answer}*`,
                                mentions: [sender],
                            },
                            { quoted: message },
                        );

                        console.log(`⌛ Scramble game expired in ${chatId}`);
                    }
                }, 45 * 1000);
            } catch (error) {
                console.error("Scramble error:", error);
                await sock.sendMessage(
                    chatId,
                    {
                        text: "⚠️ Couldn't start scramble game, try again later.",
                    },
                    { quoted: message },
                );
            }
        },
    },

    truth: {
        description: "Get a truth question",
        usage: "truth",
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, message } = context;

            try {
                const response = await axios.get(
                    "https://api.truthordarebot.xyz/v1/truth",
                );

                if (response.data && response.data.question) {
                    const truth = response.data.question;
                    await sock.sendMessage(
                        chatId,
                        { text: `💭 *Truth Question*\n\n${truth}` },
                        { quoted: message },
                    );
                } else {
                    await sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Couldn't fetch a truth question, try again later!",
                        },
                        { quoted: message },
                    );
                }
            } catch (error) {
                console.error("Error fetching truth:", error.message);
                await sock.sendMessage(
                    chatId,
                    {
                        text: "⚠️ Failed to fetch truth. Please try again later.",
                    },
                    { quoted: message },
                );
            }
        },
    },

    dare: {
        description: "Get a dare challenge",
        usage: "dare",
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, message } = context;

            try {
                const response = await axios.get(
                    "https://api.truthordarebot.xyz/v1/dare",
                );

                if (response.data && response.data.question) {
                    const dare = response.data.question;
                    await sock.sendMessage(
                        chatId,
                        { text: `🎯 *Dare Challenge*\n\n${dare}` },
                        { quoted: message },
                    );
                } else {
                    await sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Couldn't fetch a dare challenge, try again later!",
                        },
                        { quoted: message },
                    );
                }
            } catch (error) {
                console.error("Error fetching dare:", error.message);
                await sock.sendMessage(
                    chatId,
                    {
                        text: "⚠️ Failed to fetch dare. Please try again later.",
                    },
                    { quoted: message },
                );
            }
        },
    },

    word: {
        description: "Start or join a word challenge game",
        usage: "word",
        adminOnly: false,
        execute: async ({ chatId, sender, sock, message }) => {
            const axios = require("axios");

            // Check if game active
            if (
                gameStates.has(chatId) &&
                gameStates.get(chatId).gameType === "word"
            ) {
                const game = gameStates.get(chatId);
                if (!game.players.includes(sender)) {
                    game.players.push(sender);
                    await sock.sendMessage(
                        chatId,
                        {
                            text: `✅ @${sender.split("@")[0]} joined the game!`,
                            mentions: [sender],
                        },
                        { quoted: message },
                    );
                } else {
                    await sock.sendMessage(
                        chatId,
                        {
                            text: `❌ You're already in the game!`,
                            mentions: [sender],
                        },
                        { quoted: message },
                    );
                }
                return;
            }

            // Initialize game
            const game = {
                gameType: "word",
                id: Date.now().toString(),
                host: sender,
                players: [sender],
                started: false,
                currentTurn: 0,
                currentLetter: null,
                wordLength: 3,
                timeLimit: 50,
                roundTimer: null,
            };

            gameStates.set(chatId, game);

            await sock.sendMessage(chatId, {
                text: `🎮 *Word Game Started!*\n\n@${sender.split("@")[0]} created a new lobby!\nOthers can join by typing *!word*.\n\n⏳ Game starts in 30 seconds...`,
                mentions: [sender],
            });

            setTimeout(async () => {
                const g = gameStates.get(chatId);
                if (!g || g.players.length < 2) {
                    await sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Not enough players joined. Game canceled.",
                        },
                        { quoted: message },
                    );
                    gameStates.delete(chatId);
                    return;
                }

                g.started = true;
                g.currentLetter = String.fromCharCode(
                    97 + Math.floor(Math.random() * 26),
                );
                await startRound(g, chatId, sock, message);
            }, 30 * 1000);
        },
    },


    a: {
        description: "Answer/reply in games",
        usage: "a <answer>",
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, sock, message, sender } = context;

            if (args.length === 0) {
                await sock.sendMessage(
                    chatId,
                    {
                        text: "❌ Please provide an answer.\nUsage: !a <your answer>",
                    },
                    { quoted: message },
                );
                return;
            }

            const gameState = gameStates.get(chatId);
            if (!gameState) {
                await sock.sendMessage(
                    chatId,
                    { text: "❌ No active game. Start a game first!" },
                    { quoted: message },
                );
                return;
            }

            const answer = args.join(" ").toLowerCase();

            switch (gameState.gameType) {
                case "hangman":
                    await handleHangmanGuess(
                        gameState,
                        answer,
                        chatId,
                        sock,
                        message,
                        sender,
                    );
                    break;

                case "trivia":
                    await handleTriviaAnswer(
                        gameState,
                        answer,
                        chatId,
                        sock,
                        message,
                        sender,
                    );
                    break;

                case "tictactoe":
                    await handleTicTacToeMove(
                        gameState,
                        answer,
                        chatId,
                        sock,
                        message,
                        context.sender,
                    );
                    break;

                case "poke": {
                    if (answer === gameState.answer) {
                        const player = await Player.findOne({ userId: sender });
                        player.lastGameResult = "win";
                        player.gameWins++;
                        if (player.lastGameResult === "win") {
                            player.gameStreak += 1;
                        } else {
                            player.gameStreak = 1;
                        }

                        const milestones = {
                            20: 1000,
                            40: 2000,
                            80: 4000,
                            100: 5000,
                            160: 8000,
                            320: 16000,
                        };

                        if (milestones[player.gameStreak]) {
                            let reward = milestones[player.gameStreak];
                            player.shards += reward;
                            await sock.sendMessage(
                                chatId,
                                {
                                    text: `🔥 *Streak Bonus!* ${player.gameStreak} wins in a row!\n💰 You earned +${reward} shards!`,
                                },
                                { quoted: message },
                            );
                        }
                        await player.save();
                        await sock.sendMessage(
                            chatId,
                            {
                                text: `✅ Correct! It was *${gameState.answer}*!`,
                            },
                            { quoted: message },
                        );
                        gameStates.delete(chatId);
                    } else {
                        gameState.attempts++;
                        if (gameState.attempts >= gameState.maxAttempts) {
                            const player = await Player.findOne({
                                userId: sender,
                            });
                            player.lastGameResult = "loss";
                            player.gameStreak = 0;
                            await player.save();
                            await sock.sendMessage(
                                chatId,
                                {
                                    text: `❌ Out of chances! The Pokémon was *${gameState.answer}*`,
                                },
                                { quoted: message },
                            );
                            gameStates.delete(chatId);
                        } else {
                            const player = await Player.findOne({
                                userId: sender,
                            });
                            player.lastGameResult = "loss";
                            player.gameStreak = 0;
                            await player.save();
                            await sock.sendMessage(
                                chatId,
                                {
                                    text: `❌ Wrong! You have ${gameState.maxAttempts - gameState.attempts} tries left.`,
                                },
                                { quoted: message },
                            );
                        }
                    }
                    break;
                }

                case "scramble": {
                    if (answer === gameState.answer) {
                        const player = await Player.findOne({ userId: sender });
                        player.lastGameResult = "win";
                        await checkStreak(player, sock, chatId, message);
                        await player.save();
                        await sock.sendMessage(
                            chatId,
                            {
                                text: `✅ Correct! The word was *${gameState.answer}*`,
                            },
                            { quoted: message },
                        );
                        gameStates.delete(chatId);
                    } else {
                        gameState.attempts++;
                        if (gameState.attempts >= gameState.maxAttempts) {
                            const player = await Player.findOne({
                                userId: sender,
                            });
                            player.lastGameResult = "loss";
                            player.gameStreak = 0;
                            await player.save();
                            await sock.sendMessage(
                                chatId,
                                {
                                    text: `❌ Out of chances! The word was *${gameState.answer}*`,
                                },
                                { quoted: message },
                            );
                            gameStates.delete(chatId);
                        } else {
                            await sock.sendMessage(
                                chatId,
                                {
                                    text: `❌ Wrong! You have ${gameState.maxAttempts - gameState.attempts} tries left.\nScrambled: ${gameState.scrambled}`,
                                },
                                { quoted: message },
                            );
                        }
                    }
                    break;
                }

                    case "word": {
                    const game = gameStates.get(chatId);
                    if (!game.started) return;

                    const currentPlayer = game.players[game.currentTurn];
                    if (sender !== currentPlayer) {
                        await sock.sendMessage(
                            chatId,
                            {
                                text: `❌ Not your turn! It's @${currentPlayer.split("@")[0]}'s turn.`,
                                mentions: [currentPlayer],
                            },
                            { quoted: message },
                        );
                        return;
                    }

                    const word = answer.trim().toLowerCase();
                    if (!word.startsWith(game.currentLetter)) {
                        await sock.sendMessage(
                            chatId,
                            {
                                text: `❌ Word must start with *${game.currentLetter.toUpperCase()}*!`,
                            },
                            { quoted: message },
                        );
                        return;
                    }

                    if (word.length !== game.wordLength) {
                        await sock.sendMessage(
                            chatId,
                            {
                                text: `❌ Word must be ${game.wordLength} letters long!`,
                            },
                            { quoted: message },
                        );
                        return;
                    }

                    try {
                        const res = await axios.get(
                            `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
                        );
                        if (res.data && Array.isArray(res.data)) {
                            await sock.sendMessage(chatId, {
                                text: `✅ Valid word: *${word}*`,
                            });
                            await nextTurn(game, chatId, sock, message);
                        } else {
                            throw new Error("Invalid");
                        }
                    } catch {
                        await sock.sendMessage(
                            chatId,
                            {
                                text: `❌ Invalid word: *${word}*`,
                            },
                            { quoted: message },
                        );
                        game.players.splice(game.currentTurn, 1);
                        if (game.players.length === 1) {
                            await sock.sendMessage(
                                chatId,
                                {
                                    text: `🏆 Winner: @${game.players[0].split("@")[0]}!`,
                                    mentions: [game.players[0]],
                                },
                                { quoted: message },
                            );
                            gameStates.delete(chatId);
                            return;
                        }
                        if (game.currentTurn >= game.players.length)
                            game.currentTurn = 0;
                        await nextTurn(game, chatId, sock, message);
                    }
                    break;
                }


                default:
                    await sock.sendMessage(
                        chatId,
                        { text: "❌ Unknown game type." },
                        { quoted: message },
                    );
            }
        },
    },
};

async function handleHangmanGuess(
    gameState,
    guess,
    chatId,
    sock,
    message,
    sender,
) {
    if (guess.length !== 1) {
        await sock.sendMessage(
            chatId,
            { text: "❌ Please guess only one letter at a time." },
            { quoted: message },
        );
        return;
    }

    const letter = guess[0];

    if (gameState.word.includes(letter)) {
        // Correct guess
        for (let i = 0; i < gameState.word.length; i++) {
            if (gameState.word[i] === letter) {
                gameState.guessed[i] = letter;
            }
        }

        if (!gameState.guessed.includes("_")) {
            gameStates.delete(chatId);
            const player = await Player.findOne({ userId: sender });
            player.lastGameResult = "win";
            await checkStreak(player, sock, chatId, message);
            await player.save();
            await sock.sendMessage(
                chatId,
                { text: `🎉 *You won!*\n\nThe word was: *${gameState.word}*` },
                { quoted: message },
            );
            return;
        }

        const gameText =
            `✅ Correct!\n\nWord: ${gameState.guessed.join(" ")}\n` +
            `Wrong guesses: ${gameState.wrongGuesses.length}/${gameState.maxWrong}`;
        await sock.sendMessage(chatId, { text: gameText }, { quoted: message });
    } else {
        // Wrong guess
        gameState.wrongGuesses.push(letter);

        if (gameState.wrongGuesses.length >= gameState.maxWrong) {
            gameStates.delete(chatId);
            const player = await Player.findOne({
                userId: sender,
            });
            player.lastGameResult = "loss";
            player.gameStreak = 0;
            await player.save();
            await sock.sendMessage(
                chatId,
                {
                    text: `💀 *Game Over!*\n\nThe word was: *${gameState.word}*`,
                },
                { quoted: message },
            );
            return;
        }

        const gameText =
            `❌ Wrong letter!\n\nWord: ${gameState.guessed.join(" ")}\n` +
            `Wrong guesses: ${gameState.wrongGuesses.join(", ")} (${gameState.wrongGuesses.length}/${gameState.maxWrong})`;
        await sock.sendMessage(chatId, { text: gameText }, { quoted: message });
    }
}

async function handleTriviaAnswer(
    gameState,
    answer,
    chatId,
    sock,
    message,
    sender,
) {
    let userAnswer = answer;

    // If user typed a number (e.g. "2"), map it to option
    if (!isNaN(userAnswer)) {
        const index = parseInt(userAnswer, 10) - 1;
        if (gameState.options[index]) {
            userAnswer = gameState.options[index].toLowerCase();
        }
    }

    if (userAnswer === gameState.answer.toLowerCase()) {
        gameStates.delete(chatId);
        const player = await Player.findOne({ userId: sender });
        if (!player) {
            await sock.sendMessage(
                chatId,
                {
                    text: "⚠️ You need to register before playing games. Use !register <name>",
                },
                { quoted: message },
            );
            return;
        }
        player.lastGameResult = "win";
        await checkStreak(player, sock, chatId, message);
        await player.save();
        await sock.sendMessage(
            chatId,
            { text: `🎉 *Correct!*\n\nThe answer was: *${gameState.answer}*` },
            { quoted: message },
        );
    } else {
        gameStates.delete(chatId);
        const player = await Player.findOne({
            userId: sender,
        });
        if (!player) {
            await sock.sendMessage(
                chatId,
                {
                    text: "⚠️ You need to register before playing games. Use !register <name>",
                },
                { quoted: message },
            );
            return;
        }
        player.gameStreak = 0;
        await player.save();
        await sock.sendMessage(
            chatId,
            {
                text: `❌ *Wrong!*\n\nThe correct answer was: *${gameState.answer}*`,
            },
            { quoted: message },
        );
    }
}

async function handleTicTacToeMove(
    gameState,
    input,
    chatId,
    sock,
    message,
    sender,
) {
    const game = gameState.game;
    const surrender = /^(surrender|give up)$/i.test(input);

    if (!surrender && !/^[1-9]$/.test(input)) return;

    if (!surrender && sender !== game.currentTurn) {
        await sock.sendMessage(
            chatId,
            { text: "❌ Not your turn!", mentions: [sender] },
            { quoted: message },
        );
        return;
    }

    let moveOk = surrender
        ? true
        : game.turn(sender === game.playerO, parseInt(input) - 1);

    if (!moveOk) {
        await sock.sendMessage(
            chatId,
            { text: "❌ Invalid move!" },
            { quoted: message },
        );
        return;
    }

    let winner = game.winner;
    let isTie = game.turns >= 9 && !winner;

    if (surrender) {
        winner = sender === game.playerX ? game.playerO : game.playerX;
    }

    const board = game.render().map(
        (v) =>
            ({
                X: "❎",
                O: "⭕",
                1: "1️⃣",
                2: "2️⃣",
                3: "3️⃣",
                4: "4️⃣",
                5: "5️⃣",
                6: "6️⃣",
                7: "7️⃣",
                8: "8️⃣",
                9: "9️⃣",
            })[v],
    );

    let status;
    if (winner) {
        status = `🎉 @${winner.split("@")[0]} wins the game!`;
        const player = await Player.findOne({ userId: winner });
        player.gameWins++;
        if (player.lastGameResult === "win") {
            player.gameStreak += 1;
        } else {
            player.gameStreak = 1;
        }

        const milestones = {
            5: 1000,
            10: 2000,
            20: 4000,
            40: 8000,
            80: 16000,
            160: 20000,
        };

        if (milestones[player.gameStreak]) {
            let reward = milestones[player.gameStreak];
            player.shards += reward;
            await sock.sendMessage(
                chatId,
                {
                    text: `🔥 *Streak Bonus!* ${player.gameStreak} wins in a row!\n💰 You earned +${reward} shards!`,
                },
                { quoted: message },
            );
        }
    } else if (isTie) {
        status = `🤝 It's a draw!`;
    } else {
        status = `🎲 Turn: @${game.currentTurn.split("@")[0]}`;
    }

    const msg = `
🎮 *TicTacToe Game*

${status}

${board.slice(0, 3).join("")}
${board.slice(3, 6).join("")}
${board.slice(6).join("")}

Player ❎: @${game.playerX.split("@")[0]}
Player ⭕: @${game.playerO.split("@")[0]}
`;

    await sock.sendMessage(
        chatId,
        { text: msg, mentions: [game.playerX, game.playerO] },
        { quoted: message },
    );

    if (winner || isTie) {
        gameStates.delete(chatId);
    }
}

module.exports = gameCommands;
