const config = require('../config');
const fs = require('fs');
const fetch = require('node-fetch'); // ✅ needed for profile command
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const categoryMap = {
    basic: {
        title: "🏓 Basic",
        commands: ['help', 'ping', 'main',]
    },
    utility: {
        title: "🛠️ Utility",
        commands: ['tts', 'owner', 'joke', 'fact', 'quote', 'weather', 'define', 'lyrics', 'movie', 'anime', 'url', 'tiny']
    },
    card: {
        title: "🃏 Card",
        commands: ['claim', 'collection', 'deck', 'cards', 'mtd', 'mtc', 'collector', 'seriessearch', 'searchcard']
    },
    core: {
        title: "♟ Core",
        commands: ['register', 'afk', 'exp', 'rank', 'inventory', 'leaderboard', 'mods', 'profile']
    },
    economy: {
        title: "💲 Economy",
        commands: ['bonus', 'buy', 'daily', 'give', 'rob', 'shop', 'slot', 'shards', 'vault', 'withdraw']
    },
    familia: {
        title: "👨‍👩‍👧‍👦 Familia",
        commands: ['familialist', 'add', 'remove', 'createfamilia', 'setdescription', 'joinfamilia', 'leavefamilia', 'familia']
    },
    media: {
        title: "🎨 Media",
        commands: ['sticker', 'toimg', 'vv', 'tomp3', 'take']
    },
    games: {
        title: "🎮 Games",
        commands: ['hangman', 'tictactoe', 'trivia', 'truth', 'dare', 'poke', 'scramble']
    },
    downloads: {
        title: "⬇️ Downloads",
        commands: ['play', 'facebook', 'instagram', 'tiktok', 'youtube', 'spotify', 'image', 'waifu']
    },
    group: {
        title: "👥 Group",
        commands: ['promote', 'demote', 'kick', 'add', 'close', 'open', 'tag', 'tagall', 'admins', 'resetlink', 'groupinfo', 'link']
    }
};

function buildCategoryCommand(categoryKey) {
    return {
        description: `Show ${categoryMap[categoryKey].title} commands`,
        usage: categoryKey,
        aliases: [],
        adminOnly: false,
        execute: async ({ chatId, bot }) => {
            try {
                const commands = require("./index");
                const prefix = config.get("prefix");

                let helpText = `*${categoryMap[categoryKey].title} Commands*\n\n`;

                categoryMap[categoryKey].commands.forEach(cmdName => {
                    if (commands[cmdName]) {
                        helpText += `• ${prefix}${cmdName}\n`;
                    }
                });

                const fileBuffer = fs.readFileSync("assets/bot_image.jpeg");
                await bot.sendImage(chatId, fileBuffer, helpText);
            } catch (err) {
                await bot.sendMessage(chatId, `❌ Failed to load ${categoryKey} commands.`);
            }
        }
    };
}

const helpCommand = {
    help: {
        description: 'Show available commands',
        usage: 'help [command]',
        aliases: ['h', 'commands', 'menu'],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot } = context;
            const prefix = config.get('prefix');
            
            if (args.length > 0) {
                // Show help for specific command
                const commandName = args[0].toLowerCase();
                const commands = require('./index');
                
                if (commands[commandName]) {
                    const cmd = commands[commandName];
                    const helpText = `📚 *${commandName.toUpperCase()} Command Help*\n\n` +
                        `*Description:* ${cmd.description}\n` +
                        `*Usage:* ${prefix}${cmd.usage}\n` +
                        `*Aliases:* ${cmd.aliases ? cmd.aliases.join(', ') : 'None'}\n` +
                        `*Admin Only:* ${cmd.adminOnly ? 'Yes' : 'No'}`;
                    
                    await bot.sendMessage(chatId, helpText);
                } else {
                    await bot.sendMessage(chatId, `❌ Command '${commandName}' not found.`);
                }
            } else {
                // Show all commands organized by category
                try {
                    const commands = require('./index');
                    let helpText = `✨ *ZEN Bot Commands (${Object.keys(commands).length} total)*\n`;
                    helpText += `*Bot Prefix ~> [ ${config.get('prefix')} ]*\n\n`;
                    
                    Object.keys(categoryMap).forEach(key => {
                        const category = categoryMap[key];
                        const available = category.commands.filter(cmd => commands[cmd]);
                        if (available.length > 0) {
                            helpText += `*${category.title}* :\n`;
                            available.forEach(cmd => helpText += `${cmd}, `);
                            helpText += '\n\n';
                        }
                    });

                    helpText += `💡 Use ${prefix}help <command> for detailed help\n`;
                    helpText += `> ZEN by ryou.`;

                    const fileBuffer = fs.readFileSync("assets/violeto.mp4");
                    await bot.sendVideo(chatId, fileBuffer, helpText, true);
                } catch (error) {
                    const fallbackHelp = `💎 *ZEN*\n\n` +
                        `Basic Commands:\n` +
                        `• ${prefix}ping - Check bot status\n` +
                        `• ${prefix}help - Show commands\n\n` +
                        `Use ${prefix}help <command> for more details.`;
                    
                    await bot.sendMessage(chatId, fallbackHelp);
                }
            }
        }
    },

    ping: {
        description: 'Check Bot Status',
        usage: 'ping',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot } = context;
            const startTime = Date.now();

            const currentMode = config.get('settings').mode;
            const seconds = Math.floor(process.uptime());
            const d = Math.floor(seconds / (3600 * 24));
            const h = Math.floor((seconds % (3600 * 24)) / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);

            const uptimeStr =
                (d > 0 ? `${d}d ` : '') +
                (h > 0 ? `${h}h ` : '') +
                (m > 0 ? `${m}m ` : '') +
                `${s}s`;

            const message = await bot.sendMessage(chatId, "⏱️ Pinging...");
            const responseTime = Date.now() - startTime;

            await bot.sendMessage(chatId,
                `*Zen-MD is Active!*\n` +
                `⏱️ Response time: ${responseTime}ms\n` +
                `🔹 Mode: *${currentMode}*\n` +
                `⌚ Uptime: *${uptimeStr}*`,
                { quoted: message });
        }
    },

    locked: {
        description: 'List of admin-only set of commands',
        usage: 'locked',
        aliases: ['sudomenu', 'adminmenu'],
        adminOnly: true,
        execute: async (context) => {
            const { chatId, bot } = context;
            const adminMenu = `*🔅Admin Commands Menu* \n📊 *Sudo* \n• addsudo \n• delsudo \n• settings \n• set
            \n👑 *Owner* \n• mode \n• setpp`
            
            const fileBuffer = fs.readFileSync("assets/coffee-morning.mp4");
            await bot.sendVideo(chatId, fileBuffer, adminMenu, true);
        }
    },

    main: {
        description: 'Send invite link to main group chat',
        usage: 'main',
        aliases: ['maingc'],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot } = context;
            const mainMsg = `Uhm`
            await bot.sendMessage(chatId, mainMsg);
        }
    },

    pp: {
        description: 'Send profile ID of user',
        usage: 'pp',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, message } = context;
            try {
                let target;

                if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                    target = message.message.extendedTextMessage.contextInfo.participant;
                } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    target = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                } else {
                    target = message.key.participant || message.key.remoteJid;
                }

                console.log(`[PROFILE CMD] target resolved: ${target}`);

                const contact = await sock.onWhatsApp(target);
                const pushName = contact?.[0]?.notify || target.split('@')[0];

                let pfpUrl;
                try {
                    pfpUrl = await sock.profilePictureUrl(target, "image");
                } catch {
                    pfpUrl = "https://i.ibb.co/1m1dFHS/default-pfp.png";
                }

                const res = await fetch(pfpUrl);
                const buffer = Buffer.from(await res.arrayBuffer());

                await sock.sendMessage(chatId, {
                    image: buffer,
                    caption: `${pushName}`
                }, { quoted: message });

            } catch (err) {
                console.error("❌ Error in profile command:", err);
                await sock.sendMessage(chatId, { text: "❌ Failed to fetch profile picture." }, { quoted: message });
            }
        }
    }
};

// ✅ add category-specific commands to exports
Object.keys(categoryMap).forEach(key => {
    helpCommand[key] = buildCategoryCommand(key);
});

module.exports = helpCommand;
