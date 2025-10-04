const config = require("../config");
const fs = require("fs");
const fetch = require("node-fetch"); // ✅ needed for profile command
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

const categoryMap = {
    basic: {
        title: "🏓 Basic",
        commands: ["help", "ping", "main", "locked"],
    },
    utility: {
        title: "🛠️ Utility",
        commands: [
            "tts",
            "owner",
            "joke",
            "fact",
            "quote",
            "weather",
            "define",
            "lyrics",
            "movie",
            "anime",
            "url",
            "tiny",
        ],
    },
    card: {
        title: "🃏 Card",
        commands: [
            "claim",
            "collection",
            "deck",
            "cards",
            "mtd",
            "mtc",
            "collector",
            "seriessearch",
            "searchcard",
            "maker",
            "cardshop", 
            "marketcard", 
            "purchase", 
            "sellcard", 
            "buycard",
            "cancelsale",
        ],
    },
    core: {
        title: "♟ Core",
        commands: [
            "register",
            "afk",
            "exp",
            "rank",
            "setpp",
            "setbio",
            "inventory",
            "use",
            "leaderboard",
            "mods",
            "profile",
        ],
    },
    event: {
        title: "🎃 Event",
        commands: [
            "edeck",
            "epull",
            "events",
        ],
    },
    economy: {
        title: "💲 Economy",
        commands: [
            "bonus",
            "buy",
            "daily",
            "weekly",
            "give",
            "rob",
            "shop",
            "buy",
            "slot",
            "shards",
            "vault",
            "withdraw",
        ],
    },
    reaction: {
        title: "🙂 Reaction",
        commands: [
            "bully",
    "cuddle",
    "cry",
    "hug",
    "kiss",
    "pat",
    "bonk",
    "blush",
    "bite",
    "slap",
    "kill",
    "kick",
    "dance",
        ],
    },
    familia: {
        title: "👨‍👩‍👧‍👦 Familia",
        commands: [
            "familialist",
            "add",
            "remove",
            "createfamilia",
            "setdescription",
            "joinfamilia",
            "leavefamilia",
            "familia",
        ],
    },
    media: {
        title: "🎨 Media",
        commands: ["sticker", "toimg", "vv", "tomp3", "take"],
    },
    games: {
        title: "🎮 Games",
        commands: [
            "hangman",
            "tictactoe",
            "trivia",
            "truth",
            "dare",
            "poke",
            "scramble",
        ],
    },
    downloads: {
        title: "⬇️ Downloads",
        commands: [
            "play",
            "facebook",
            "instagram",
            "tiktok",
            "youtube",
            "spotify",
            "image",
            "waifu",
        ],
    },
    group: {
        title: "👥 Group",
        commands: [
            "promote",
            "demote",
            "kick",
            "add",
            "close",
            "open",
            "delete",
            "tag",
            "tagall",
            "admins",
            "resetlink",
            "groupinfo",
            "link",
        ],
    },
};

function buildCategoryCommand(categoryKey) {
    return {
        description: `Show ${categoryMap[categoryKey].title} commands`,
        usage: categoryKey,
        aliases: [],
        adminOnly: false,
        execute: async ({ chatId, sock, message }) => {
            try {
                const commands = require("./index");
                const prefix = config.get("prefix");

                let helpText = `*${categoryMap[categoryKey].title} Commands*\n\n`;

                categoryMap[categoryKey].commands.forEach((cmdName) => {
                    if (commands[cmdName]) {
                        helpText += `• ${prefix}${cmdName}\n`;
                    }
                });

                const fileBuffer = fs.readFileSync("assets/bot_image.jpeg");
                await sock.sendMessage(chatId, { image: fileBuffer, caption: helpText }, {quoted: message});
            } catch (err) {
                await sock.sendMessage(chatId, { text: `❌ Failed to load ${categoryKey} commands.` }, {quoted: message});
            }
        },
    };
}

const helpCommand = {
    help: {
        description: "Show available commands",
        usage: "help [command]",
        aliases: ["h", "commands", "menu"],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, sock, message } = context;
            const prefix = config.get("prefix");

            if (args.length > 0) {
                // Show help for specific command
                const commandName = args[0].toLowerCase();
                const commands = require("./index");

                if (commands[commandName]) {
                    const cmd = commands[commandName];
                    const helpText =
                        `📚 *${commandName.toUpperCase()} Command Help*\n\n` +
                        `*Description:* ${cmd.description}\n` +
                        `*Usage:* ${prefix}${cmd.usage}\n` +
                        `*Aliases:* ${cmd.aliases ? cmd.aliases.join(", ") : "None"}\n` +
                        `*Admin Only:* ${cmd.adminOnly ? "Yes" : "No"}`;

                    await sock.sendMessage(chatId, { text: helpText }, {quoted: message});
                } else {
                    await sock.sendMessage(chatId, { text: `❌ Command '${commandName}' not found.` }, {quoted: message});
                }
            } else {
                // Show all commands organized by category
                try {
                    const commands = require("./index");
                    let helpText = `✨ *ZEN Bot Commands (${Object.keys(commands).length} total)*\n`;
                    helpText += `*Bot Prefix ~> [ ${config.get("prefix")} ]*\n\n`;

                    Object.keys(categoryMap).forEach((key) => {
                        const category = categoryMap[key];
                        const available = category.commands.filter(
                            (cmd) => commands[cmd],
                        );
                        if (available.length > 0) {
                            helpText += `*${category.title}* :\n`;
                            available.forEach(
                                (cmd) => (helpText += `${cmd}, `),
                            );
                            helpText += "\n\n";
                        }
                    });

                    helpText += `💡 Use ${prefix}help <command> for detailed help\n`;
                    helpText += `> ZEN by ryou.`;

                    const fileBuffer = fs.readFileSync("assets/violeto.mp4");
                    await sock.sendMessage(chatId, { video: fileBuffer, caption: helpText, gifPlayback: true }, {quoted: message});
                } catch (error) {
                    const fallbackHelp =
                        `💎 *ZEN*\n\n` +
                        `Basic Commands:\n` +
                        `• ${prefix}ping - Check bot status\n` +
                        `• ${prefix}help - Show commands\n\n` +
                        `Use ${prefix}help <command> for more details.`;

                    await sock.sendMessage(chatId, { text: fallbackHelp }, {quoted: message});
                }
            }
        },
    },

    ping: {
        description: "Check Bot Status",
        usage: "ping",
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, message } = context;
            const startTime = Date.now();

            const currentMode = config.get("settings").mode;
            const seconds = Math.floor(process.uptime());
            const d = Math.floor(seconds / (3600 * 24));
            const h = Math.floor((seconds % (3600 * 24)) / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);

            const uptimeStr =
                (d > 0 ? `${d}d ` : "") +
                (h > 0 ? `${h}h ` : "") +
                (m > 0 ? `${m}m ` : "") +
                `${s}s`;

            const pingMessage = await sock.sendMessage(chatId, { text: "⏱️ Pinging..." }, {quoted: message});
            const responseTime = Date.now() - startTime;

            await sock.sendMessage(chatId, { text: `*Zen-MD is Active!*\n⏱️ Response time: ${responseTime}ms\n🔹 Mode: *${currentMode}*\n⌚ Uptime: *${uptimeStr}*` }, { quoted: pingMessage });
        },
    },

    locked: {
        description: "List of admin-only set of commands",
        usage: "locked",
        aliases: ["sudomenu", "adminmenu"],
        adminOnly: true,
        execute: async (context) => {
            const { chatId, sock, message } = context;
            const adminMenu = `*🔅 Admin Commands Menu* \n📊 *Admin* \n• settings, ban, unban, disable, spawn, removecard, startslot, endslot, summon, cardinfo, timeout, stop, show, addecard, setseries, 
            \n\n👑 *Owner* \n• mode, setpp, addsudo, delsudo, set`
            await sock.sendMessage(chatId, { text: adminMenu }, {quoted: message});
            
        },
    },

    main: {
        description: "Send invite link to main group chat",
        usage: "main",
        aliases: ["maingc"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, message } = context;
            const mainMsg = `Main Group Chat Link\n> https://chat.whatsapp.com/III5VhO64Is7dc8CmN0eW3`;
            await sock.sendMessage(chatId, { text: mainMsg }, {quoted: message});
        },
    },

    pp: {
        description: "Send profile ID of user",
        usage: "pp",
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, message } = context;
            try {
                let target;

                if (
                    message.message?.extendedTextMessage?.contextInfo
                        ?.participant
                ) {
                    target =
                        message.message.extendedTextMessage.contextInfo
                            .participant;
                } else if (
                    message.message?.extendedTextMessage?.contextInfo
                        ?.mentionedJid?.length
                ) {
                    target =
                        message.message.extendedTextMessage.contextInfo
                            .mentionedJid[0];
                } else {
                    target = message.key.participant || message.key.remoteJid;
                }

                console.log(`[PROFILE CMD] target resolved: ${target}`);

                const contact = await sock.onWhatsApp(target);
                const pushName = contact?.[0]?.notify || target.split("@")[0];

                let pfpUrl;
                try {
                    pfpUrl = await sock.profilePictureUrl(target, "image");
                } catch {
                    pfpUrl = "https://i.ibb.co/1m1dFHS/default-pfp.png";
                }

                const res = await fetch(pfpUrl);
                const buffer = Buffer.from(await res.arrayBuffer());

                await sock.sendMessage(
                    chatId,
                    {
                        image: buffer,
                        caption: `${pushName}`,
                    },
                    { quoted: message },
                );
            } catch (err) {
                console.error("❌ Error in profile command:", err);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Failed to fetch profile picture." },
                    { quoted: message },
                );
            }
        },
    },
};

// ✅ add category-specific commands to exports
Object.keys(categoryMap).forEach((key) => {
    helpCommand[key] = buildCategoryCommand(key);
});

module.exports = helpCommand;
