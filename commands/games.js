// Simple game storage (in-memory)
const gameStates = new Map();
const axios = require("axios");
const scrambleWord = (word) => {
    return word.split('').sort(() => 0.5 - Math.random()).join('');
};

const gameCommands = {
    hangman: {
        description: 'Start a hangman game',
        usage: 'hangman',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock } = context;

            async function getRandomWord() {
                try {
                    const res = await fetch('https://random-word-api.herokuapp.com/word?number=1');
                    const data = await res.json();
                    return data[0]; // API returns an array of words
                } catch (error) {
                    console.error('Random word API failed, falling back:', error.message);
                    const fallbackWords = ['javascript', 'whatsapp', 'computer', 'programming', 'android', 'technology', 'artificial', 'intelligence'];
                    return fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
                }
            }

            try {
                const word = (await getRandomWord()).toLowerCase();

                const gameState = {
                    word,
                    guessed: Array(word.length).fill('_'),
                    wrongGuesses: [],
                    maxWrong: 6,
                    gameType: 'hangman'
                };

                gameStates.set(chatId, gameState);

                const gameText = `🎮 *Hangman Game Started!*\n\n` +
                    `Word: ${gameState.guessed.join(' ')}\n` +
                    `Wrong guesses: ${gameState.wrongGuesses.length}/${gameState.maxWrong}\n\n` +
                    `Use !a <letter> to guess a letter!`;

                await bot.sendMessage(chatId, gameText);
            } catch (err) {
                console.error('Hangman command error:', err);
                await bot.sendMessage(chatId, '⚠️ Could not start a new hangman game. Please try again.');
            }
        }
    },

    trivia: {
        description: 'Start a trivia game',
        usage: 'trivia',
        aliases: ["quiz"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock } = context;

            try {
                // ✅ Fetch 1 trivia question
                const res = await axios.get("https://opentdb.com/api.php?amount=1&type=multiple");
                const data = res.data.results[0];

                // Decode HTML entities (sometimes OpenTDB returns `&quot;`)
                const he = require("he");
                const question = he.decode(data.question);
                const correct = he.decode(data.correct_answer);
                const options = [...data.incorrect_answers.map(o => he.decode(o)), correct];

                // Shuffle options
                options.sort(() => Math.random() - 0.5);

                // ✅ Store game state
                const gameState = {
                    question,
                    answer: correct.toLowerCase(),
                    options,
                    gameType: 'trivia'
                };
                gameStates.set(chatId, gameState);

                // ✅ Send question
                const gameText = `🧠 *Trivia Question*\n\n${question}\n\n` +
                    options.map((o, i) => `${i + 1}. ${o}`).join("\n") +
                    `\n\nUse !a <answer> to reply! (you can type the full answer or the number)`;

                await bot.sendMessage(chatId, gameText);

            } catch (err) {
                console.error("Trivia error:", err.message);
                await bot.sendMessage(chatId, "⚠️ Couldn't fetch a trivia question, try again later.");
            }
        }
    },

    tictactoe: {
        description: 'Play TicTacToe with another user',
        usage: 'tictactoe',
        aliases: ['ttt'],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sender, message } = context;
            const TicTacToe = require('../utils/tictactoe');

            // Check if game already exists
            if (gameStates.has(chatId) && gameStates.get(chatId).gameType === 'tictactoe') {
                await bot.sendMessage(chatId, '❌ A TicTacToe game is already running here! Use !a <move> to play.');
                return;
            }

            // Ensure a second player (must mention or reply)
            let opponent;
            if (message?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                opponent = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else if (message?.message?.extendedTextMessage?.contextInfo?.participant) {
                opponent = message.message.extendedTextMessage.contextInfo.participant;
            }

            if (!opponent) {
                await bot.sendMessage(chatId, '❌ Please mention or reply to someone to challenge them.');
                return;
            }

            if (opponent === sender) {
                await bot.sendMessage(chatId, '❌ You cannot play against yourself.');
                return;
            }

            // Create new game
            const game = new TicTacToe(sender, opponent);
            const state = {
                game,
                gameType: 'tictactoe'
            };
            gameStates.set(chatId, state);

            const board = game.render().map(v => ({
                'X': '❎',
                'O': '⭕',
                '1': '1️⃣',
                '2': '2️⃣',
                '3': '3️⃣',
                '4': '4️⃣',
                '5': '5️⃣',
                '6': '6️⃣',
                '7': '7️⃣',
                '8': '8️⃣',
                '9': '9️⃣',
            }[v]));

            const msg = `
🎮 *TicTacToe Started!*
Player ❎: @${sender.split('@')[0]}
Player ⭕: @${opponent.split('@')[0]}

${board.slice(0, 3).join('')}
${board.slice(3, 6).join('')}
${board.slice(6).join('')}

Turn: @${game.currentTurn.split('@')[0]} (❎)

Use !a <1-9> to make a move, or type !a surrender to give up.
`;

            await bot.sendMessage(chatId, msg, { mentions: [sender, opponent] });
        }
    },

    poke: {
        description: 'Play "Who’s That Pokémon?"',
        usage: 'poke',
        aliases: ["pokemon"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot } = context;

            try {
                // pick random Pokémon ID (1 – 898)
                const id = Math.floor(Math.random() * 898) + 1;
                const res = await axios.get(`https://pokeapi.co/api/v2/pokemon/${id}`);
                const pokemon = res.data;

                // mask the Pokémon name
                const hiddenName = pokemon.name.replace(/[a-zA-Z]/g, "_");

                // pick official artwork or fallback sprite
                const imageUrl = pokemon.sprites?.other?.['official-artwork']?.front_default
                    || pokemon.sprites?.front_default;

                // store game state so we can check answers later
                gameStates.set(chatId, {
                    gameType: 'poke',
                    answer: pokemon.name.toLowerCase(),
                    attempts: 0,         // wrong attempts so far
                    maxAttempts: 3       // limit (3 chances)
                });


                const caption =
                    `🎮 *Who's That Pokémon?*\n\n` +
                    `Name: ${hiddenName}\n\n` +
                    `Reply with !a <your guess>`;

                if (imageUrl) {
                    // fetch Pokémon image → Buffer
                    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                    const imgBuffer = Buffer.from(imgRes.data);

                    // use the dedicated wrapper
                    await bot.sendImage(chatId, imgBuffer, caption);
                } else {
                    // fallback: no image, just send caption
                    await bot.sendMessage(chatId, caption);
                }
            } catch (err) {
                console.error('PokéAPI error:', err?.message ?? err);
                await bot.sendMessage(chatId, '⚠️ Could not fetch a Pokémon, try again!');
            }
        }
    },

    scramble: {
        description: 'Start a word scramble game',
        usage: 'scramble',
        adminOnly: false,
        execute: async ({ chatId, bot }) => {
            try {
                // Fetch a random word
                const res = await axios.get('https://random-word-api.herokuapp.com/word?number=1');
                const word = res.data[0].toLowerCase();

                const scrambled = scrambleWord(word);
                if (scrambled === word) {
                    // Reshuffle if scramble came out identical
                    return gameCommands.scramble.execute({ chatId, bot });
                }

                // Save state
                gameStates.set(chatId, {
                    gameType: 'scramble',
                    answer: word,
                    scrambled,
                    attempts: 0,
                    maxAttempts: 3
                });

                const msg = `🔀 *Word Scramble!*\n\nRearrange the letters to form a word:\n\n👉 ${scrambled}\n\nUse !a <word> to guess. You have 3 chances!`;

                await bot.sendMessage(chatId, msg);
            } catch (error) {
                console.error("Scramble error:", error);
                await bot.sendMessage(chatId, "⚠️ Couldn't start scramble game, try again later.");
            }
        }
    },

    truth: {
        description: 'Get a truth question',
        usage: 'truth',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock } = context;

            try {
                const response = await axios.get("https://api.truthordarebot.xyz/v1/truth");

                if (response.data && response.data.question) {
                    const truth = response.data.question;
                    await bot.sendMessage(chatId, `💭 *Truth Question*\n\n${truth}`);
                } else {
                    await bot.sendMessage(chatId, "❌ Couldn't fetch a truth question, try again later!");
                }
            } catch (error) {
                console.error("Error fetching truth:", error.message);
                await bot.sendMessage(chatId, "⚠️ Failed to fetch truth. Please try again later.");
            }
        }
    },

    dare: {
        description: 'Get a dare challenge',
        usage: 'dare',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock } = context;

            try {
                const response = await axios.get("https://api.truthordarebot.xyz/v1/dare");

                if (response.data && response.data.question) {
                    const dare = response.data.question;
                    await bot.sendMessage(chatId, `🎯 *Dare Challenge*\n\n${dare}`);
                } else {
                    await bot.sendMessage(chatId, "❌ Couldn't fetch a dare challenge, try again later!");
                }
            } catch (error) {
                console.error("Error fetching dare:", error.message);
                await bot.sendMessage(chatId, "⚠️ Failed to fetch dare. Please try again later.");
            }
        }
    },

    a: {
        description: 'Answer/reply in games',
        usage: 'a <answer>',
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot } = context;

            if (args.length === 0) {
                await bot.sendMessage(chatId, '❌ Please provide an answer.\nUsage: !a <your answer>');
                return;
            }

            const gameState = gameStates.get(chatId);
            if (!gameState) {
                await bot.sendMessage(chatId, '❌ No active game. Start a game first!');
                return;
            }

            const answer = args.join(' ').toLowerCase();

            switch (gameState.gameType) {
                case 'hangman':
                    await handleHangmanGuess(gameState, answer, chatId, bot);
                    break;

                case 'trivia':
                    await handleTriviaAnswer(gameState, answer, chatId, bot);
                    break;

                case 'tictactoe':
                    await handleTicTacToeMove(gameState, answer, chatId, bot, context.sender);
                    break;

                case 'poke': {
                    if (answer === gameState.answer) {
                        await bot.sendMessage(chatId, `✅ Correct! It was *${gameState.answer}*!`);
                        gameStates.delete(chatId);
                    } else {
                        gameState.attempts++;
                        if (gameState.attempts >= gameState.maxAttempts) {
                            await bot.sendMessage(chatId, `❌ Out of chances! The Pokémon was *${gameState.answer}*`);
                            gameStates.delete(chatId);
                        } else {
                            await bot.sendMessage(chatId, `❌ Wrong! You have ${gameState.maxAttempts - gameState.attempts} tries left.`);
                        }
                    }
                    break;
                }

                case 'scramble': {
                    if (answer === gameState.answer) {
                        await bot.sendMessage(chatId, `✅ Correct! The word was *${gameState.answer}*`);
                        gameStates.delete(chatId);
                    } else {
                        gameState.attempts++;
                        if (gameState.attempts >= gameState.maxAttempts) {
                            await bot.sendMessage(chatId, `❌ Out of chances! The word was *${gameState.answer}*`);
                            gameStates.delete(chatId);
                        } else {
                            // Add clue on last attempt
                            let clue = '';
                            if (gameState.attempts === gameState.maxAttempts - 1) {
                                // simple emoji hint system
                                const emojiHints = {
                                    car: '🚗',
                                    apple: '🍎',
                                    dog: '🐶',
                                    cat: '🐱',
                                    love: '❤️',
                                    star: '⭐',
                                    sun: '☀️',
                                    moon: '🌙',
                                    fire: '🔥',
                                    book: '📖',
                                };
                                clue = emojiHints[gameState.answer] ? `\n💡 Hint: ${emojiHints[gameState.answer]}` : '';
                            }

                            await bot.sendMessage(
                                chatId,
                                `❌ Wrong! You have ${gameState.maxAttempts - gameState.attempts} tries left.\nScrambled: ${gameState.scrambled}${clue}`
                            );
                        }
                    }
                    break;
                }

                default:
                    await bot.sendMessage(chatId, '❌ Unknown game type.');
            }
        }
    },

    answer: {
        description: 'Answer/reply in games (alias)',
        usage: 'answer <answer>',
        adminOnly: false,
        execute: async (context) => {
            return gameCommands.a.execute(context);
        }
    }
};

async function handleHangmanGuess(gameState, guess, chatId, bot) {
    if (guess.length !== 1) {
        await bot.sendMessage(chatId, '❌ Please guess only one letter at a time.');
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

        if (!gameState.guessed.includes('_')) {
            gameStates.delete(chatId);
            await bot.sendMessage(chatId, `🎉 *You won!*\n\nThe word was: *${gameState.word}*`);
            return;
        }

        const gameText = `✅ Correct!\n\nWord: ${gameState.guessed.join(' ')}\n` +
            `Wrong guesses: ${gameState.wrongGuesses.length}/${gameState.maxWrong}`;
        await bot.sendMessage(chatId, gameText);
    } else {
        // Wrong guess
        gameState.wrongGuesses.push(letter);

        if (gameState.wrongGuesses.length >= gameState.maxWrong) {
            gameStates.delete(chatId);
            await bot.sendMessage(chatId, `💀 *Game Over!*\n\nThe word was: *${gameState.word}*`);
            return;
        }

        const gameText = `❌ Wrong letter!\n\nWord: ${gameState.guessed.join(' ')}\n` +
            `Wrong guesses: ${gameState.wrongGuesses.join(', ')} (${gameState.wrongGuesses.length}/${gameState.maxWrong})`;
        await bot.sendMessage(chatId, gameText);
    }
}

async function handleTriviaAnswer(gameState, answer, chatId, bot) {
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
        await bot.sendMessage(chatId, `🎉 *Correct!*\n\nThe answer was: *${gameState.answer}*`);
    } else {
        gameStates.delete(chatId);
        await bot.sendMessage(chatId, `❌ *Wrong!*\n\nThe correct answer was: *${gameState.answer}*`);
    }
}

async function handleTicTacToeMove(gameState, input, chatId, bot, sender) {
    const game = gameState.game;
    const surrender = /^(surrender|give up)$/i.test(input);

    if (!surrender && !/^[1-9]$/.test(input)) return;

    if (!surrender && sender !== game.currentTurn) {
        await bot.sendMessage(chatId, '❌ Not your turn!', { mentions: [sender] });
        return;
    }

    let moveOk = surrender ? true : game.turn(sender === game.playerO, parseInt(input) - 1);

    if (!moveOk) {
        await bot.sendMessage(chatId, '❌ Invalid move!');
        return;
    }

    let winner = game.winner;
    let isTie = game.turns >= 9 && !winner;

    if (surrender) {
        winner = sender === game.playerX ? game.playerO : game.playerX;
    }

    const board = game.render().map(v => ({
        'X': '❎',
        'O': '⭕',
        '1': '1️⃣',
        '2': '2️⃣',
        '3': '3️⃣',
        '4': '4️⃣',
        '5': '5️⃣',
        '6': '6️⃣',
        '7': '7️⃣',
        '8': '8️⃣',
        '9': '9️⃣',
    }[v]));

    let status;
    if (winner) {
        status = `🎉 @${winner.split('@')[0]} wins the game!`;
    } else if (isTie) {
        status = `🤝 It's a draw!`;
    } else {
        status = `🎲 Turn: @${game.currentTurn.split('@')[0]}`;
    }

    const msg = `
🎮 *TicTacToe Game*

${status}

${board.slice(0, 3).join('')}
${board.slice(3, 6).join('')}
${board.slice(6).join('')}

Player ❎: @${game.playerX.split('@')[0]}
Player ⭕: @${game.playerO.split('@')[0]}
`;

    await bot.sendMessage(chatId, msg, { mentions: [game.playerX, game.playerO] });

    if (winner || isTie) {
        gameStates.delete(chatId);
    }
}

async function handlePokeAnswer(gameState, answer, chatId, bot) {
    if (answer === gameState.answer) {
        gameStates.delete(chatId);
        await bot.sendMessage(chatId, `🎉 Correct! It's *${gameState.answer}*`);
    } else if (/^(give ?up|surrender)$/i.test(answer)) {
        gameStates.delete(chatId);
        await bot.sendMessage(chatId, `💀 Game Over! The Pokémon was *${gameState.answer}*`);
    } else {
        await bot.sendMessage(chatId, `❌ Wrong guess! Try again...`);
    }
}

module.exports = gameCommands;
