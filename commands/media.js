const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const mediaUtils = require("../utils/media");
const config = require("../config");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static"); // 👈 static binary
const fs = require("fs");
const path = require("path");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

const mediaCommands = {
    view: {
        description: "Download media from replied message",
        usage: "download",
        aliases: ["vv"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, sock, message } = context;

            // Check if replying to a message
            const quotedMessage =
                message.message?.extendedTextMessage?.contextInfo
                    ?.quotedMessage;
            if (!quotedMessage) {
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Please reply to a message containing media." },
                    { quoted: message },
                );
                return;
            }

            try {
                // Check if quoted message has media
                const hasMedia =
                    quotedMessage.imageMessage ||
                    quotedMessage.videoMessage ||
                    quotedMessage.audioMessage ||
                    quotedMessage.documentMessage;

                if (!hasMedia) {
                    await sock.sendMessage(
                        chatId,
                        {
                            text: "❌ The replied message does not contain any media.",
                        },
                        { quoted: message },
                    );
                    return;
                }

                await sock.sendMessage(
                    chatId,
                    { text: "⏳ Downloading media..." },
                    { quoted: message },
                );

                // Create a fake message object for download
                const fakeMessage = {
                    key: message.message.extendedTextMessage.contextInfo
                        .stanzaId,
                    message: quotedMessage,
                };

                const buffer = await downloadMediaMessage(
                    fakeMessage,
                    "buffer",
                    {},
                );

                if (!buffer) {
                    await sock.sendMessage(
                        chatId,
                        { text: "❌ Failed to download media." },
                        { quoted: message },
                    );
                    return;
                }

                // Check file size
                if (buffer.length > config.get("mediaDownloadLimit")) {
                    await sock.sendMessage(
                        chatId,
                        { text: "❌ Media file is too large to download." },
                        { quoted: message },
                    );
                    return;
                }

                // Determine media type and send
                if (quotedMessage.imageMessage) {
                    await sock.sendMessage(
                        chatId,
                        { image: buffer, caption: "📥 Downloaded Image" },
                        { quoted: message },
                    );
                } else if (quotedMessage.videoMessage) {
                    await sock.sendMessage(
                        chatId,
                        { video: buffer, caption: "📥 Downloaded Video" },
                        { quoted: message },
                    );
                } else if (quotedMessage.audioMessage) {
                    await sock.sendMessage(
                        chatId,
                        { audio: buffer, mimetype: "audio/mp4" },
                        { quoted: message },
                    );
                } else if (quotedMessage.documentMessage) {
                    await sock.sendMessage(
                        chatId,
                        { text: "📥 Document downloaded successfully." },
                        { quoted: message },
                    );
                }
            } catch (error) {
                console.error("Download error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error downloading media." },
                    { quoted: message },
                );
            }
        },
    },

    sticker: {
        description: "Convert image/video to sticker",
        usage: "sticker (reply to image/video)",
        aliases: ["s"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, message, sock } = context;

            let targetMessage = null;
            let type = null;

            // Check if replying to image/video
            const quotedMessage =
                message.message?.extendedTextMessage?.contextInfo
                    ?.quotedMessage;
            if (quotedMessage?.imageMessage) {
                targetMessage = { message: quotedMessage };
                type = "image";
            } else if (quotedMessage?.videoMessage) {
                targetMessage = { message: quotedMessage };
                type = "video";
            } else if (message.message?.imageMessage) {
                targetMessage = message;
                type = "image";
            } else if (message.message?.videoMessage) {
                targetMessage = message;
                type = "video";
            }

            if (!targetMessage) {
                await sock.sendMessage(
                    chatId,
                    {
                        text: "❌ Please reply to an *image* or a *short video* (max 10s) with the sticker command.",
                    },
                    { quoted: message },
                );
                return;
            }

            try {
                await sock.sendMessage(
                    chatId,
                    { text: "⏳ Converting to sticker..." },
                    { quoted: message },
                );

                // Download media
                const buffer = await downloadMediaMessage(
                    targetMessage,
                    "buffer",
                    {},
                );
                if (!buffer) {
                    await sock.sendMessage(
                        chatId,
                        { text: "❌ Failed to download media." },
                        { quoted: message },
                    );
                    return;
                }

                // Fixed pack/author
                const pack = "𝚉𝙴𝙽-𝙼𝙳";
                const author = "Ryou";

                const sticker = new Sticker(buffer, {
                    pack,
                    author,
                    type:
                        type === "video"
                            ? StickerTypes.FULL
                            : StickerTypes.DEFAULT,
                    quality: 70,
                });

                const stickerBuffer = await sticker.build();

                // Send sticker
                await sock.sendMessage(chatId, { sticker: stickerBuffer });
            } catch (error) {
                console.error("Sticker error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error creating sticker." },
                    { quoted: message },
                );
            }
        },
    },

    take: {
        description: "Change pack name and author of a sticker",
        usage: "take <packname> <author> (reply to sticker)",
        aliases: ["steal"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, message, sock, args } = context;

            const quotedMessage =
                message.message?.extendedTextMessage?.contextInfo
                    ?.quotedMessage;
            if (!quotedMessage?.stickerMessage) {
                await sock.sendMessage(
                    chatId,
                    {
                        text: "❌ Please reply to a sticker with the take command.\nUsage: !take NewPack NewAuthor",
                    },
                    { quoted: message },
                );
                return;
            }

            if (args.length < 1) {
                await sock.sendMessage(
                    chatId,
                    {
                        text: "❌ Please provide at least a pack name.\nUsage: !take NewPack NewAuthor",
                    },
                    { quoted: message },
                );
                return;
            }

            const pack = args[0];
            const author = args[1] || "GURA-MD";

            try {
                await sock.sendMessage(
                    chatId,
                    { text: "⏳ Processing sticker..." },
                    { quoted: message },
                );

                // Download sticker
                const buffer = await downloadMediaMessage(
                    { message: quotedMessage },
                    "buffer",
                    {},
                );

                if (!buffer) {
                    await sock.sendMessage(
                        chatId,
                        { text: "❌ Failed to download sticker." },
                        { quoted: message },
                    );
                    return;
                }

                // Rebuild sticker with new pack/author
                const sticker = new Sticker(buffer, {
                    pack,
                    author,
                    type: StickerTypes.DEFAULT,
                    quality: 70,
                });

                const stickerBuffer = await sticker.build();

                await sock.sendMessage(chatId, { sticker: stickerBuffer });
            } catch (error) {
                console.error("Take command error:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "❌ Error changing sticker pack name." },
                    { quoted: message },
                );
            }
        },
    },

    toimg: {
        description: "Convert quoted sticker to image",
        usage: "toimg (reply to a sticker)",
        aliases: ["topicture", "tophoto"],
        adminOnly: false,
        execute: async (context) => {
            const { sock, chatId, message } = context;

            try {
                // get the quoted message
                const quoted =
                    message.message?.extendedTextMessage?.contextInfo
                        ?.quotedMessage;

                if (!quoted || !quoted.stickerMessage) {
                    return await sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please reply to a *sticker* with this command.",
                        },
                        { quoted: message },
                    );
                }

                // download sticker as buffer
                const buffer = await downloadMediaMessage(
                    { message: quoted },
                    "buffer",
                    {},
                );

                // send as image
                sock.sendMessage(
                    chatId,
                    {
                        image: buffer,
                        caption: "✅ Sticker converted to image \n> 𝚉𝙴𝙽",
                    },
                    { quoted: message },
                );
            } catch (err) {
                console.error("toimg command error:", err);
                await sock.sendMessage(
                    chatId,
                    { text: "⚠️ Failed to convert sticker to image." },
                    { quoted: message },
                );
            }
        },
    },

    tomp3: {
        description: "Convert quoted video to audio (mp3)",
        usage: "tomp3 (reply to a video)",
        adminOnly: false,
        execute: async (context) => {
            const { sock, bot, chatId, message } = context;

            try {
                // get quoted message
                const quoted =
                    message.message?.extendedTextMessage?.contextInfo
                        ?.quotedMessage;

                if (!quoted || !quoted.videoMessage) {
                    return await sock.sendMessage(
                        chatId,
                        {
                            text: "❌ Please reply to a *video* with this command.",
                        },
                        { quoted: message },
                    );
                }

                // download quoted video
                const buffer = await downloadMediaMessage(
                    { message: quoted },
                    "buffer",
                    {},
                );

                // save temp video
                const inputPath = path.join(__dirname, "temp_video.mp4");
                const outputPath = path.join(__dirname, "temp_audio.mp3");
                fs.writeFileSync(inputPath, buffer);

                // convert with ffmpeg
                await new Promise((resolve, reject) => {
                    ffmpeg(inputPath)
                        .setFfmpegPath(ffmpegPath)
                        .output(outputPath)
                        .on("end", resolve)
                        .on("error", reject)
                        .run();
                });

                // read converted audio
                const audioBuffer = fs.readFileSync(outputPath);

                // send via wrapper
                await sock.sendMessage(
                    chatId,
                    { audio: audioBuffer, mimetype: "audio/mpeg" },
                    { quoted: message },
                );

                // cleanup
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
            } catch (err) {
                console.error("tomp3 command error:", err);
                await sock.sendMessage(
                    chatId,
                    { text: "⚠️ Failed to convert video to audio." },
                    { quoted: message },
                );
            }
        },
    },
};

module.exports = mediaCommands;
