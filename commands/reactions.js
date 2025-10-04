const fetch = require("node-fetch");

const reactions = [
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
];

const commands = {};

reactions.forEach((reaction) => {
    commands[reaction] = {
        description: `${reaction.charAt(0).toUpperCase() + reaction.slice(1)} someone with a GIF`,
        usage: `${reaction} [@user]`,
        adminOnly: false,
        execute: async ({ chatId, sock, message }) => {
            try {
                const sender = message.key.participant || message.key.remoteJid;
                const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

                // Fetch GIF from API
                const res = await fetch(`https://api.waifu.pics/sfw/${reaction}`);
                const data = await res.json();
                if (!data.url) throw new Error("API returned no URL.");

                // Caption text
                const caption = mentioned
                    ? `@${sender.split("@")[0]} ${reaction}ed @${mentioned.split("@")[0]} 💫`
                    : `@${sender.split("@")[0]} ${reaction}ed 💫`;

                // Send the GIF
                await sock.sendMessage(
                    chatId,
                    {
                        video: { url: data.url },
                        gifPlayback: true,
                        caption,
                        mentions: [sender, ...(mentioned ? [mentioned] : [])],
                    },
                    { quoted: message }
                );
            } catch (err) {
                console.error(`[${reaction}] Error:`, err);
                await sock.sendMessage(
                    chatId,
                    { text: `❌ Failed to fetch ${reaction} GIF.` },
                    { quoted: message }
                );
            }
        },
    };
});

module.exports = commands;
