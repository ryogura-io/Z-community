const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const mediaUtils = require('../utils/media');
const config = require('../config');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');  // 👈 static binary
const fs = require('fs');
const path = require('path');
// const { Sticker, StickerTypes } = require('wa-sticker-formatter');



const mediaCommands = {
    view: {
        description: 'Download media from replied message',
        usage: 'download',
        aliases: ["vv"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, message } = context;
            
            // Check if replying to a message
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMessage) {
                await bot.sendMessage(chatId, '❌ Please reply to a message containing media.');
                return;
            }
            
            try {
                // Check if quoted message has media
                const hasMedia = quotedMessage.imageMessage || 
                               quotedMessage.videoMessage || 
                               quotedMessage.audioMessage || 
                               quotedMessage.documentMessage;
                
                if (!hasMedia) {
                    await bot.sendMessage(chatId, '❌ The replied message does not contain any media.');
                    return;
                }
                
                await bot.sendMessage(chatId, '⏳ Downloading media...');
                
                // Create a fake message object for download
                const fakeMessage = {
                    key: message.message.extendedTextMessage.contextInfo.stanzaId,
                    message: quotedMessage
                };
                
                const buffer = await downloadMediaMessage(fakeMessage, 'buffer', {});
                
                if (!buffer) {
                    await bot.sendMessage(chatId, '❌ Failed to download media.');
                    return;
                }
                
                // Check file size
                if (buffer.length > config.get('mediaDownloadLimit')) {
                    await bot.sendMessage(chatId, '❌ Media file is too large to download.');
                    return;
                }
                
                // Determine media type and send
                if (quotedMessage.imageMessage) {
                    await bot.sendImage(chatId, buffer, '📥 Downloaded Image');
                } else if (quotedMessage.videoMessage) {
                    await bot.sendVideo(chatId, buffer, '📥 Downloaded Video');
                } else if (quotedMessage.audioMessage) {
                    await bot.sendAudio(chatId, buffer);
                } else if (quotedMessage.documentMessage) {
                    await bot.sendMessage(chatId, '📥 Document downloaded successfully.');
                }
                
            } catch (error) {
                console.error('Download error:', error);
                await bot.sendMessage(chatId, '❌ Error downloading media.');
            }
        }
    },
    
    sticker: {
        description: 'Convert image/video to sticker',
        usage: 'sticker (reply to image/video)',
        aliases: ["s"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, message, sock } = context;

            let targetMessage = null;
            let type = null;

            // Check if replying to image/video
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage?.imageMessage) {
                targetMessage = { message: quotedMessage };
                type = 'image';
            } else if (quotedMessage?.videoMessage) {
                targetMessage = { message: quotedMessage };
                type = 'video';
            } else if (message.message?.imageMessage) {
                targetMessage = message;
                type = 'image';
            } else if (message.message?.videoMessage) {
                targetMessage = message;
                type = 'video';
            }

            if (!targetMessage) {
                await bot.sendMessage(chatId, '❌ Please reply to an *image* or a *short video* (max 10s) with the sticker command.');
                return;
            }

            try {
                await bot.sendMessage(chatId, '⏳ Converting to sticker...');

                // Download media
                const buffer = await downloadMediaMessage(targetMessage, 'buffer', {});
                if (!buffer) {
                    await bot.sendMessage(chatId, '❌ Failed to download media.');
                    return;
                }

                // Fixed pack/author
                const pack = "𝚉𝙴𝙽-𝙼𝙳";
                const author = "Ryou";

                const sticker = new Sticker(buffer, {
                    pack,
                    author,
                    type: type === 'video' ? StickerTypes.FULL : StickerTypes.DEFAULT,
                    quality: 70,
                });

                const stickerBuffer = await sticker.build();

                // Send sticker
                await sock.sendMessage(chatId, { sticker: stickerBuffer });

            } catch (error) {
                console.error('Sticker error:', error);
                await bot.sendMessage(chatId, '❌ Error creating sticker.');
            }
        }
    },

    take: {
        description: 'Change pack name and author of a sticker',
        usage: 'take <packname> <author> (reply to sticker)',
        aliases: ["steal"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, message, sock, args } = context;

            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMessage?.stickerMessage) {
                await bot.sendMessage(chatId, '❌ Please reply to a sticker with the take command.\nUsage: !take NewPack NewAuthor');
                return;
            }

            if (args.length < 1) {
                await bot.sendMessage(chatId, '❌ Please provide at least a pack name.\nUsage: !take NewPack NewAuthor');
                return;
            }

            const pack = args[0];
            const author = args[1] || "GURA-MD";

            try {
                await bot.sendMessage(chatId, '⏳ Processing sticker...');

                // Download sticker
                const buffer = await downloadMediaMessage({ message: quotedMessage }, 'buffer', {});

                if (!buffer) {
                    await bot.sendMessage(chatId, '❌ Failed to download sticker.');
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
                console.error('Take command error:', error);
                await bot.sendMessage(chatId, '❌ Error changing sticker pack name.');
            }
        }
    },

    toimg: {
        description: 'Convert quoted sticker to image',
        usage: 'toimg (reply to a sticker)',
        aliases: ["topicture", "tophoto"],
        adminOnly: false,
        execute: async (context) => {
            const { bot, chatId, message } = context;

            try {
                // get the quoted message
                const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                if (!quoted || !quoted.stickerMessage) {
                    return await bot.sendMessage(chatId, '❌ Please reply to a *sticker* with this command.');
                }

                // download sticker as buffer
                const buffer = await downloadMediaMessage(
                    { message: quoted },
                    'buffer',
                    {}
                );

                // send as image using wrapper
                await bot.sendImage(chatId, buffer, '✅ Sticker converted to image \n> 𝚉𝙴𝙽-𝙼𝙳');

            } catch (err) {
                console.error('toimg command error:', err);
                await bot.sendMessage(chatId, '⚠️ Failed to convert sticker to image.');
            }
        }
    }, 

    tomp3: {
        description: 'Convert quoted video to audio (mp3)',
        usage: 'tomp3 (reply to a video)',
        adminOnly: false,
        execute: async (context) => {
            const { bot, chatId, message } = context;

            try {
                // get quoted message
                const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                if (!quoted || !quoted.videoMessage) {
                    return await bot.sendMessage(chatId, '❌ Please reply to a *video* with this command.');
                }

                // download quoted video
                const buffer = await downloadMediaMessage(
                    { message: quoted },
                    'buffer',
                    {}
                );

                // save temp video
                const inputPath = path.join(__dirname, 'temp_video.mp4');
                const outputPath = path.join(__dirname, 'temp_audio.mp3');
                fs.writeFileSync(inputPath, buffer);

                // convert with ffmpeg
                await new Promise((resolve, reject) => {
                    ffmpeg(inputPath)
                        .setFfmpegPath(ffmpegPath)
                        .output(outputPath)
                        .on('end', resolve)
                        .on('error', reject)
                        .run();
                });

                // read converted audio
                const audioBuffer = fs.readFileSync(outputPath);

                // send via wrapper
                await bot.sendAudio(chatId, audioBuffer);

                // cleanup
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);

            } catch (err) {
                console.error('tomp3 command error:', err);
                await bot.sendMessage(chatId, '⚠️ Failed to convert video to audio.');
            }
        }
    }

}

module.exports = mediaCommands;
