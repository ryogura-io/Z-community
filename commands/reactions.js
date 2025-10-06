const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { convertToMp4 } = require("../utils/deckHelper");

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
            const sender = message.key.participant || message.key.remoteJid;
            let mentioned;

            if (
                message.message?.extendedTextMessage?.contextInfo?.participant
            ) {
                mentioned =
                    message.message.extendedTextMessage.contextInfo.participant;
            } else if (
                message.message?.extendedTextMessage?.contextInfo?.mentionedJid
                    ?.length
            ) {
                mentioned =
                    message.message.extendedTextMessage.contextInfo
                        .mentionedJid[0];
            } else {
                mentioned = message.key.participant || message.key.remoteJid;
            }

            try {
                // Fetch GIF from API
                const res = await fetch(
                    `https://api.waifu.pics/sfw/${reaction}`,
                );
                const data = await res.json();
                if (!data.url) throw new Error("API returned no URL.");

                // Download the GIF into a buffer
                const gifRes = await fetch(data.url);
                const gifBuffer = await gifRes.arrayBuffer();

                // Prepare temp paths
                const tempMp4Path = path.join(
                    __dirname,
                    `../temp_${Date.now()}.mp4`,
                );

                // Convert GIF to MP4
                await convertToMp4(Buffer.from(gifBuffer), tempMp4Path);

                // Caption text
                const caption = mentioned
                    ? `@${sender.split("@")[0]} ${reaction}ed @${mentioned.split("@")[0]}`
                    : `@${sender.split("@")[0]} ${reaction}ed`;

                // Send as MP4 video
                await sock.sendMessage(
                    chatId,
                    {
                        video: fs.readFileSync(tempMp4Path),
                        caption,
                        mentions: [sender, ...(mentioned ? [mentioned] : [])],
                        gifPlayback: true,
                    },
                    { quoted: message },
                );

                // Cleanup
                fs.unlinkSync(tempMp4Path);
            } catch (err) {
                console.error(`[${reaction}] Error:`, err);
                await sock.sendMessage(
                    chatId,
                    { text: `❌ Failed to fetch or convert ${reaction} GIF.` },
                    { quoted: message },
                );
            }
        },
    };
});

module.exports = commands;
