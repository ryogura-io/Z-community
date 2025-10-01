const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");
const { convertToMp4 } = require("./mediaHelper"); // your existing ffmpeg util

/**
 * Send a single card (handles images, gifs, webm with fallback).
 */
async function sendCard(sock, chatId, message, card, caption) {
    if (
        (card.tier === "6" || card.tier === "S") &&
        (card.img.endsWith(".webm") || card.img.endsWith(".gif"))
    ) {
        try {
            const mediaBuffer = (
                await axios.get(card.img, { responseType: "arraybuffer" })
            ).data;

            const outputPath = path.join(
                __dirname,
                "..",
                `temp_output_${Date.now()}.mp4`
            );

            await convertToMp4(mediaBuffer, outputPath);
            const videoBuffer = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);

            return sock.sendMessage(
                chatId,
                {
                    video: videoBuffer,
                    caption,
                    mimetype: "video/mp4",
                    gifPlayback: true,
                },
                { quoted: message }
            );
        } catch (err) {
            console.error("Video conversion error:", err);
            // fallback to image
        }
    }

    // fallback to image
    const imgBuffer = (
        await axios.get(card.img, { responseType: "arraybuffer" })
    ).data;
    return sock.sendMessage(
        chatId,
        {
            image: imgBuffer,
            caption,
        },
        { quoted: message }
    );
}

/**
 * Create a grid image from an array of cards.
 */
async function createCardGrid(cards, columns = 3, cardWidth = 230, cardHeight = 300, padding = 10) {
    const rows = Math.ceil(cards.length / columns);

    const background = await sharp({
        create: {
            width: columns * (cardWidth + padding) + padding,
            height: rows * (cardHeight + padding) + padding,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
    }).png();

    const composite = [];

    for (let i = 0; i < cards.length; i++) {
        const row = Math.floor(i / columns);
        const col = i % columns;
        const x = padding + col * (cardWidth + padding);
        const y = padding + row * (cardHeight + padding);

        try {
            const cardImgResponse = await axios.get(cards[i].img, {
                responseType: "arraybuffer",
                timeout: 10000,
            });

            const resizedCard = await sharp(Buffer.from(cardImgResponse.data))
                .resize(cardWidth, cardHeight, { fit: "cover" })
                .png()
                .toBuffer();

            composite.push({ input: resizedCard, top: y, left: x });
        } catch (err) {
            console.error(`Error loading card image for ${cards[i].name}:`, err);

            const errorSvg = `
                <svg width="${cardWidth}" height="${cardHeight}">
                    <rect width="100%" height="100%" fill="#cccccc"/>
                    <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="20" fill="black">Error</text>
                </svg>
            `;

            const errorPlaceholder = await sharp(Buffer.from(errorSvg))
                .png()
                .toBuffer();

            composite.push({ input: errorPlaceholder, top: y, left: x });
        }
    }

    return await background.composite(composite).png().toBuffer();
}

module.exports = { sendCard, createCardGrid };
