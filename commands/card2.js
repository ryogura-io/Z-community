const Player = require("../models/Player");
const Card = require("../models/Card");
const CardShop = require("../models/CardShop");
const axios = require("axios");
const spawnManager = require("../spawnManager");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

// Helper function to convert media to MP4
async function convertToMp4(inputBuffer, outputPath) {
  return new Promise((resolve, reject) => {
    const tempInputPath = path.join(
      __dirname,
      "..",
      "temp_input_" + Date.now(),
    );

    // Write buffer to temporary file
    fs.writeFileSync(tempInputPath, inputBuffer);

    ffmpeg(tempInputPath)
      .toFormat("mp4")
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-movflags +faststart",
        "-pix_fmt yuv420p",
        "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2", // Ensure even dimensions
      ])
      .on("end", () => {
        fs.unlinkSync(tempInputPath); // Clean up temp input file
        resolve();
      })
      .on("error", (err) => {
        if (fs.existsSync(tempInputPath)) {
          fs.unlinkSync(tempInputPath); // Clean up on error
        }
        reject(err);
      })
      .save(outputPath);
  });
}

// Helper function to generate random captcha
function generateCaptcha() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper function to format card shop display
function formatCardShopList(shopCards) {
  let msg = `🏪 *Card Shop* (${shopCards.length}/12 slots)\n\n`;

  if (shopCards.length === 0) {
    msg += "❌ No cards available in the shop right now!";
    return msg;
  }

  shopCards.forEach((shopCard, index) => {
    const timeLeft = Math.max(
      0,
      Math.floor((shopCard.expiresAt - Date.now()) / (1000 * 60 * 60)),
    );
    msg += `🎴 *${index + 1}.* ${shopCard.cardId.name}\n`;
    msg += `⭐ Tier: ${shopCard.cardId.tier} | 💰 ${shopCard.price} shards\n`;
    msg += `👤 Seller: ${shopCard.sellerName}\n`;
    msg += `⏰ ${timeLeft}h left | 🔑 ${shopCard.purchaseCaptcha}\n\n`;
  });

  msg += `💡 Use \`!cardshop <index>\` to see details\n`;
  msg += `💰 Use \`!purchase <captcha>\` to buy`;

  return msg;
}

module.exports = {
  cardshop: {
    description: "View cards in the marketplace or specific card details",
    usage: "cardshop [index]",
    aliases: ["market"],
    adminOnly: false,
    execute: async ({ sender, chatId, sock, message, args }) => {
      try {
        // Clean up expired cards first
        await CardShop.cleanupExpiredCards();

        const shopCards = await CardShop.find()
          .populate("cardId")
          .sort({ listedAt: 1 });

        // If user wants to see a specific card
        if (args[0] && !isNaN(args[0])) {
          const cardIndex = parseInt(args[0]) - 1;
          if (cardIndex < 0 || cardIndex >= shopCards.length) {
            return sock.sendMessage(
              chatId,
              { text: `❌ Invalid card shop index!` },
              { quoted: message },
            );
          }

          const shopCard = shopCards[cardIndex];
          const timeLeft = Math.max(
            0,
            Math.floor((shopCard.expiresAt - Date.now()) / (1000 * 60 * 60)),
          );

          const cardMsg =
            `🏪 *Card Shop ${args[0]}*\n\n` +
            `📜 *Name:* ${shopCard.cardId.name}\n` +
            `⭐ *Tier:* ${shopCard.cardId.tier}\n` +
            `🎭 *Series:* ${shopCard.cardId.series}\n` +
            `💰 *Price:* ${shopCard.price} shards\n` +
            `👤 *Seller:* ${shopCard.sellerName}\n` +
            `⏰ *Time Left:* ${timeLeft} hours\n` +
            `🔑 *Purchase captcha:* ${shopCard.purchaseCaptcha}\n\n` +
            `💡 Use \`!purchase ${shopCard.purchaseCaptcha}\` to buy`;

          const imgBuffer = (
            await axios.get(shopCard.cardId.img, {
              responseType: "arraybuffer",
            })
          ).data;

          // return sock.sendMessage(chatId, {
          //   image: imgBuffer,
          //   caption: cardMsg
          // }, { quoted: message })

          if (
            (shopCard.cardId.tier === "6" || shopCard.cardId.tier === "S") &&
            (shopCard.cardId.img.endsWith(".webm") ||
              shopCard.cardId.img.endsWith(".gif"))
          ) {
            try {
              const mediaBuffer = (
                await axios.get(shopCard.cardId.img, {
                  responseType: "arraybuffer",
                })
              ).data;
              const outputPath = path.join(
                __dirname,
                "..",
                `temp_output_${Date.now()}.mp4`,
              );

              await convertToMp4(mediaBuffer, outputPath);
              const videoBuffer = fs.readFileSync(outputPath);
              fs.unlinkSync(outputPath); // Clean up

              return sock.sendMessage(
                chatId,
                {
                  video: videoBuffer,
                  caption: cardMsg,
                  mimetype: "video/mp4",
                  gifPlayback: true,
                },
                { quoted: message },
              );
            } catch (conversionError) {
              console.error("Video conversion error:", conversionError);
              // Fallback to sending as image
              const imgBuffer = (
                await axios.get(shopCard.cardId.img, {
                  responseType: "arraybuffer",
                })
              ).data;
              return sock.sendMessage(
                chatId,
                {
                  image: imgBuffer,
                  caption: cardMsg,
                },
                { quoted: message },
              );
            }
          } else {
            const imgBuffer = (
              await axios.get(shopCard.cardId.img, {
                responseType: "arraybuffer",
              })
            ).data;
            return sock.sendMessage(
              chatId,
              {
                image: imgBuffer,
                caption: cardMsg,
              },
              { quoted: message },
            );
          }
        }
        // Show all cards in shop
        const sharp = require("sharp");

        // Create base image (800x600) with white background
        const cardWidth = 230;
        const cardHeight = 300;
        const padding = 10;
        const columns = 3;
        const rows = Math.ceil(shopCards.length / columns);

        const background = await sharp({
          create: {
            width: columns * (cardWidth + padding) + padding,
            height: rows * (cardHeight + padding) + padding,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        }).png();

        const composite = [];

        // Loop through shop cards
        for (let i = 0; i < shopCards.length; i++) {
          const row = Math.floor(i / columns);
          const col = i % columns;
          const x = padding + col * (cardWidth + padding);
          const y = padding + row * (cardHeight + padding);

          const shopCard = shopCards[i];

          try {
            const cardImgResponse = await axios.get(shopCard.cardId.img, {
              responseType: "arraybuffer",
              timeout: 10000,
            });

            const resizedCard = await sharp(Buffer.from(cardImgResponse.data))
              .resize(cardWidth, cardHeight, { fit: "cover" })
              .png()
              .toBuffer();

            composite.push({ input: resizedCard, top: y, left: x });
          } catch (cardError) {
            console.error(
              `Error loading card image for ${shopCard.cardId.name}:`,
              cardError,
            );

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

        // Composite into one final image
        const imageBuffer = await background
          .composite(composite)
          .png()
          .toBuffer();

        const shopMsg = formatCardShopList(shopCards);

        await sock.sendMessage(
          chatId,
          {
            image: imageBuffer,
            caption: shopMsg,
          },
          { quoted: message },
        );
      } catch (error) {
        console.error("Cardshop error:", error);
        await sock.sendMessage(
          chatId,
          { text: `❌ Error accessing card shop.` },
          { quoted: message },
        );
      }
    },
  },

  marketcard: {
    description: "Put a card from your collection on the market (Tier 4+ only)",
    usage: "marketcard <collection_index> <price>",
    aliases: ["listcard", "mc"],
    adminOnly: false,
    execute: async ({ sender, chatId, message, sock, args }) => {
      if (!args[0] || !args[1] || isNaN(args[0]) || isNaN(args[1])) {
        return sock.sendMessage(
          chatId,
          { text: "❌ Usage: !marketcard <collection_index> <price>" },
          { quoted: message },
        );
      }

      try {
        // Clean up expired cards first
        await CardShop.cleanupExpiredCards();

        // Check if shop is full
        if (await CardShop.isShopFull()) {
          return sock.sendMessage(
            chatId,
            {
              text: "❌ Card shop is full! Try again later when slots become available.",
            },
            { quoted: message },
          );
        }

        const player = await Player.findOne({ userId: sender }).populate(
          "collection",
        );
        if (!player) {
          return sock.sendMessage(
            chatId,
            { text: `❌ Please register first!` },
            { quoted: message },
          );
        }

        const cardIndex = parseInt(args[0]) - 1;
        const price = parseInt(args[1]);

        if (cardIndex < 0 || cardIndex >= player.collection.length) {
          return sock.sendMessage(
            chatId,
            { text: `❌ Invalid collection index!` },
            { quoted: message },
          );
        }

        if (price < 1) {
          return sock.sendMessage(
            chatId,
            { text: `❌ Price must be at least 1 shard!` },
            { quoted: message },
          );
        }

        const card = player.collection[cardIndex];

        // Check if card is tier 4 or above
        const tierNum = parseInt(card.tier);
        if (isNaN(tierNum) || tierNum < 4) {
          return sock.sendMessage(
            chatId,
            { text: "❌ Only cards of Tier 4 and above can be sold!" },
            { quoted: message },
          );
        }

        // Remove card from player's collection
        player.collection.splice(cardIndex, 1);

        // Generate captcha and create shop entry
        const captcha = generateCaptcha();
        const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours from now

        const shopCard = new CardShop({
          cardId: card._id,
          sellerId: sender,
          sellerName: player.name,
          price: price,
          purchaseCaptcha: captcha,
          expiresAt: expiresAt,
        });

        await shopCard.save();
        await player.save();

        // After await shopCard.save(); and await player.save();

        setTimeout(
          async () => {
            try {
              const expiredCard = await CardShop.findById(
                shopCard._id,
              ).populate("cardId");
              if (expiredCard && expiredCard.expiresAt <= new Date()) {
                // Return card to seller
                const seller = await Player.findOne({
                  userId: expiredCard.sellerId,
                });
                if (seller) {
                  seller.collection.push(expiredCard.cardId._id);
                  await seller.save();
                }

                // Remove expired listing
                await CardShop.deleteOne({ _id: expiredCard._id });

                // Optional: notify seller
                try {
                  await sock.sendMessage(expiredCard.sellerId, {
                    text: `⏰ Your listing for "${expiredCard.cardId.name}" expired. The card has been returned to your collection.`,
                  });
                } catch (notifyErr) {
                  console.log("Seller notification failed:", notifyErr.message);
                }
              }
            } catch (err) {
              console.error("Error auto-returning expired shop card:", err);
            }
          },
          6 * 60 * 60 * 1000,
        ); // 6 hours

        const successMsg =
          `✅ *Card Listed Successfully!*\n\n` +
          `🎴 *${card.name}* (Tier ${card.tier})\n` +
          `💰 Price: ${price} shards\n` +
          `🔑 Purchase Code: ${captcha}\n` +
          `⏰ Expires in 6 hours\n\n` +
          `💡 Buyers can use \`!purchase ${captcha}\` to buy`;

        const imgBuffer = (
          await axios.get(card.img, {
            responseType: "arraybuffer",
          })
        ).data;
        await sock.sendMessage(
          chatId,
          {
            image: imgBuffer,
            caption: successMsg,
          },
          { quoted: message },
        );
      } catch (error) {
        console.error("Marketcard error:", error);
        await sock.sendMessage(
          chatId,
          { text: `❌ Error listing card for sale.` },
          { quoted: message },
        );
      }
    },
  },

  purchase: {
    description: "Purchase a card from the marketplace using its captcha code",
    usage: "purchase <captcha_code>",
    aliases: ["getcard"],
    adminOnly: false,
    execute: async ({ sender, chatId, args, bot, sock, message }) => {
      if (!args[0]) {
        return sock.sendMessage(
          chatId,
          { text: `❌ Usage: !purchase <captcha_code>` },
          { quoted: message },
        );
      }

      try {
        const mongoose = require("mongoose");
        const session = await mongoose.startSession();

        try {
          let shopCard, seller, buyer;

          // Clean up expired cards first (outside transaction to avoid nesting)
          await CardShop.cleanupExpiredCards();

          await session.withTransaction(async () => {
            const captcha = args[0].toUpperCase();

            // Atomically find and remove the card from shop (prevents double purchase)
            shopCard = await CardShop.findOneAndDelete({
              purchaseCaptcha: captcha,
              expiresAt: { $gt: new Date() }, // ensure not expired
            })
              .populate("cardId")
              .session(session);

            if (!shopCard) {
              throw new Error(
                "Invalid purchase code, card no longer available, or listing expired!",
              );
            }

            buyer = await Player.findOne({ userId: sender }).session(session);
            if (!buyer) {
              throw new Error("Please register first!");
            }

            // Check if buyer is trying to buy their own card
            if (shopCard.sellerId === sender) {
              // Return card to shop since transaction failed
              const restoredCard = new CardShop(shopCard.toObject());
              delete restoredCard._id;
              await restoredCard.save({ session });
              throw new Error("You cannot buy your own card!");
            }

            // Check if buyer has enough shards
            if (buyer.shards < shopCard.price) {
              // Return card to shop since transaction failed
              const restoredCard = new CardShop(shopCard.toObject());
              delete restoredCard._id;
              await restoredCard.save({ session });
              throw new Error(
                `Insufficient shards! You need ${shopCard.price} shards but only have ${buyer.shards}.`,
              );
            }

            // Process the atomic transaction
            buyer.shards -= shopCard.price;
            buyer.collection.push(shopCard.cardId._id);
            await buyer.save({ session });

            // Give shards to seller
            seller = await Player.findOne({
              userId: shopCard.sellerId,
            }).session(session);
            if (seller) {
              seller.shards += shopCard.price;
              await seller.save({ session });
            }
          });

          // Transaction successful - send success messages
          const successMsg =
            `✅ *Purchase Successful!*\n\n` +
            `🎴 *${shopCard.cardId.name}* (Tier ${shopCard.cardId.tier})\n` +
            `💰 Paid: ${shopCard.price} shards\n` +
            `👤 Bought from: ${shopCard.sellerName}\n\n` +
            `🎉 Card added to your collection!`;

          await sock.sendMessage(
            chatId,
            { text: successMsg },
            { quoted: message },
          );

          // Notify seller if online (optional)
          if (seller) {
            const sellerMsg =
              `💰 *Card Sold!*\n\n` +
              `🎴 **${shopCard.cardId.name}** sold for ${shopCard.price} shards\n` +
              `👤 Buyer: ${buyer.name}\n` +
              `💎 Your balance: ${seller.shards} shards`;

            try {
              await sock.sendMessage(
                shopCard.sellerId,
                { text: sellerMsg },
                { quoted: message },
              );
            } catch (error) {
              // Seller might have bot blocked, ignore error
              console.log("Could not notify seller:", error.message);
            }
          }
        } catch (transactionError) {
          console.error("Purchase transaction error:", transactionError);
          await sock.sendMessage(
            chatId,
            {
              text: `❌ ${transactionError.message || "Error processing purchase."}`,
            },
            { quoted: message },
          );
        } finally {
          await session.endSession();
        }
      } catch (error) {
        console.error("Purchase error:", error);
        await sock.sendMessage(
          chatId,
          { text: `❌ Error processing purchase.` },
          { quoted: message },
        );
      }
    },
  },

  sellcard: {
    description: "Put a card from your collection on sale in this group",
    usage: "sellcard <collectionindex> <price>",
    aliases: ["sc"],
    adminOnly: false,
    execute: async ({ sender, chatId, message, args, sock, isGroup }) => {
      try {
        if (!isGroup) {
          return sock.sendMessage(
            chatId,
            { text: "❌ Card selling is only available in groups!" },
            { quoted: message },
          );
        }

        if (args.length !== 2) {
          return sock.sendMessage(
            chatId,
            {
              text: "❌ Usage: !sellcard <collectionindex> <price>\nExample: !sellcard 5 100",
            },
            { quoted: message },
          );
        }

        const collectionIndex = parseInt(args[0]) - 1;
        const price = parseInt(args[1]);

        if (isNaN(collectionIndex) || collectionIndex < 0) {
          return sock.sendMessage(
            chatId,
            { text: "❌ Invalid collection index! Use a positive number." },
            { quoted: message },
          );
        }

        if (isNaN(price) || price < 1) {
          return sock.sendMessage(
            chatId,
            { text: "❌ Invalid price! Use a positive number." },
            { quoted: message },
          );
        }

        const Player = require("../models/Player");
        const CardSale = require("../models/CardSale");

        const player = await Player.findOne({
          userId: sender,
        }).populate("collection");
        if (!player) {
          return sock.sendMessage(
            chatId,
            { text: `❌ Please register first!` },
            { quoted: message },
          );
        }

        if (collectionIndex >= player.collection.length) {
          return sock.sendMessage(
            chatId,
            {
              text: `❌ You only have ${player.collection.length} cards in your collection!`,
            },
            { quoted: message },
          );
        }

        const cardToSell = player.collection[collectionIndex];
        if (!cardToSell) {
          return sock.sendMessage(
            chatId,
            { text: "❌ No card found at that index!" },
            { quoted: message },
          );
        }

        // Cleanup any expired sales first
        await CardSale.cleanupExpiredSales(chatId);

        // Check if seller already has an active sale in this group
        const existingSale = await CardSale.findOne({
          sellerId: sender,
          groupId: chatId,
          status: "active",
        });

        if (existingSale) {
          return sock.sendMessage(
            chatId,
            {
              text: "❌ You already have an active sale in this group! Wait for it to expire or be purchased.",
            },
            { quoted: message },
          );
        }

        // Remove card from seller's collection
        player.collection.splice(collectionIndex, 1);
        await player.save();

        // Generate sale captcha and create sale record
        const saleCaptcha = CardSale.generateCaptcha();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const cardSale = new CardSale({
          cardId: cardToSell._id,
          sellerId: sender,
          sellerName: player.name,
          groupId: chatId,
          price: price,
          saleCaptcha: saleCaptcha,
          expiresAt: expiresAt,
        });

        await cardSale.save();

        // Send card image with sale details (reliable approach)
        try {
          // Send the original card image with sale information
          const cardImgResponse = await axios.get(cardToSell.img, {
            responseType: "arraybuffer",
            timeout: 5000,
          });

          const saleMsg =
            `🏪 *CARD FOR SALE* 🏪\n\n` +
            `🎴 *Name:* ${cardToSell.name}\n` +
            `⭐ *Tier:* ${cardToSell.tier}\n` +
            `💰 *Price: ${price} Shards*\n` +
            `🔑 *Buy captcha: ${saleCaptcha}*\n\n` +
            `👤 Seller: ${player.name}\n` +
            `💡 Use *!buycard ${saleCaptcha}* to purchase`;

          await sock.sendMessage(
            chatId,
            {
              image: cardImgResponse.data,
              caption: saleMsg,
            },
            { quoted: message },
          );
          // Set timeout to auto-return card if not sold
          setTimeout(
            async () => {
              try {
                const sale = await CardSale.findById(cardSale._id);
                if (sale && sale.status === "active") {
                  const seller = await Player.findOne({
                    userId: sale.sellerId,
                  });
                  if (seller) {
                    seller.collection.push(sale.cardId);
                    await seller.save();
                    sale.status = "expired";
                    await sale.save();

                    await sock.sendMessage(
                      chatId,
                      {
                        text: `⏰ Sale expired! Card "${cardToSell.name}" has been returned to ${player.name}'s collection.`,
                      },
                      { quoted: message },
                    );
                  }
                }
              } catch (timeoutError) {
                console.error("Error in sale timeout:", timeoutError);
              }
            },
            10 * 60 * 1000,
          ); // 10 minutes
        } catch (imageError) {
          console.error("Error creating sale image:", imageError);

          // Fallback to text message
          const saleMsg =
            `🏪 *CARD FOR SALE* 🏪\n\n` +
            `🎴 *Name:* ${cardToSell.name}\n` +
            `⭐ *Tier:* ${cardToSell.tier}\n` +
            `🎭 *Series:* ${cardToSell.series}\n` +
            `👨‍🎨 *Maker:* ${cardToSell.maker}\n\n` +
            `💰 *Price: ${price} Shards*\n` +
            `🔑 *Buy Captcha: ${saleCaptcha}*\n\n` +
            `👤 Seller: ${player.name}\n` +
            `⏰ Expires in 10 minutes\n` +
            `💡 Use \`*!buycard ${saleCaptcha}*\` to purchase`;

          await sock.sendMessage(
            chatId,
            { text: saleMsg },
            { quoted: message },
          );
        }
      } catch (error) {
        console.error("Sellcard error:", error);
        await sock.sendMessage(
          chatId,
          { text: `❌ Error creating card sale.` },
          { quoted: message },
        );
      }
    },
  },

  buycard: {
    description: "Buy a card that's for sale in this group",
    usage: "buycard <salecaptcha>",
    aliases: ["bc"],
    adminOnly: false,
    execute: async ({ sender, chatId, message, sock, args, isGroup }) => {
      try {
        if (!isGroup) {
          return sock.sendMessage(
            chatId,
            { text: "❌ Card buying is only available in groups!" },
            { quoted: message },
          );
        }

        if (args.length !== 1) {
          return sock.sendMessage(
            chatId,
            {
              text: "❌ Usage: !buycard <salecaptcha>\nExample: !buycard ABC1",
            },
            { quoted: message },
          );
        }

        const saleCaptcha = args[0].toUpperCase();

        const Player = require("../models/Player");
        const CardSale = require("../models/CardSale");

        const buyer = await Player.findOne({ userId: sender });
        if (!buyer) {
          return sock.sendMessage(
            chatId,
            { text: `❌ Please register first!` },
            { quoted: message },
          );
        }

        // Cleanup expired sales first
        await CardSale.cleanupExpiredSales(chatId);

        // Find the active sale in this group with this captcha
        const sale = await CardSale.findOne({
          groupId: chatId,
          saleCaptcha: saleCaptcha,
          status: "active",
        }).populate("cardId");

        if (!sale) {
          return sock.sendMessage(
            chatId,
            { text: "❌ No active sale found with that code in this group!" },
            { quoted: message },
          );
        }

        // Check if sale has expired
        if (sale.hasExpired()) {
          // Cleanup this expired sale
          await CardSale.cleanupExpiredSales(chatId);
          return sock.sendMessage(
            chatId,
            { text: `❌ That sale has expired!` },
            { quoted: message },
          );
        }

        // Prevent self-purchase
        if (sale.sellerId === sender) {
          return sock.sendMessage(
            chatId,
            { text: "❌ You cannot buy your own card!" },
            { quoted: message },
          );
        }

        // Check if buyer has enough shards
        if (buyer.shards < sale.price) {
          return sock.sendMessage(
            chatId,
            {
              text: `❌ You need ${sale.price} shards but only have ${buyer.shards}!`,
            },
            { quoted: message },
          );
        }

        // Get seller
        const seller = await Player.findOne({ userId: sale.sellerId });
        if (!seller) {
          return sock.sendMessage(
            chatId,
            { text: `❌ Seller not found!` },
            { quoted: message },
          );
        }

        // Perform the transaction atomically
        const mongoose = require("mongoose");
        const session = await mongoose.startSession();

        try {
          await session.withTransaction(async () => {
            // Deduct shards from buyer
            buyer.shards -= sale.price;

            // Add shards to seller
            seller.shards += sale.price;

            // Add card to buyer's collection
            buyer.collection.push(sale.cardId._id);

            // Mark sale as sold
            sale.status = "sold";
            sale.buyerId = sender;
            sale.buyerName = buyer.name;
            sale.soldAt = new Date();

            // Save all changes
            await buyer.save({ session });
            await seller.save({ session });
            await sale.save({ session });
          });

          const purchaseMsg =
            `✅ *PURCHASE SUCCESSFUL!* ✅\n\n` +
            `🎴 *Name:* ${sale.cardId.name} (Tier ${sale.cardId.tier})\n` +
            `💰 *Price*: ${sale.price} shards\n\n` +
            `👤 *Buyer*: ${buyer.name}\n` +
            `👤 *Seller*: ${seller.name}\n\n` +
            `💰 ${buyer.name}'s remaining shards: ${buyer.shards}\n` +
            `💰 ${seller.name}'s new balance: ${seller.shards}`;

          await sock.sendMessage(
            chatId,
            { text: purchaseMsg },
            { quoted: message },
          );
        } catch (transactionError) {
          await session.abortTransaction();
          console.error("Transaction error:", transactionError);
          await sock.sendMessage(
            chatId,
            { text: "❌ Error processing purchase. Please try again." },
            { quoted: message },
          );
        } finally {
          await session.endSession();
        }
      } catch (error) {
        console.error("Buycard error:", error);
        await sock.sendMessage(
          chatId,
          { text: `❌ Error purchasing card.` },
          { quoted: message },
        );
      }
    },
  },

  cancelsale: {
    description: "Cancel your current card sale in this group",
    usage: "cancelsale",
    aliases: ["cs"],
    adminOnly: false,
    execute: async ({ sender, chatId, message, sock, isGroup }) => {
      try {
        if (!isGroup) {
          return sock.sendMessage(
            chatId,
            { text: "❌ Card sales are only available in groups!" },
            { quoted: message },
          );
        }

        const Player = require("../models/Player");
        const CardSale = require("../models/CardSale");

        const player = await Player.findOne({ userId: sender });
        if (!player) {
          return sock.sendMessage(
            chatId,
            { text: `❌ Please register first!` },
            { quoted: message },
          );
        }

        // Cleanup any expired sales first
        await CardSale.cleanupExpiredSales(chatId);

        // Find the seller's active sale in this group
        const activeSale = await CardSale.findOne({
          sellerId: sender,
          groupId: chatId,
          status: "active",
        }).populate("cardId");

        if (!activeSale) {
          return sock.sendMessage(
            chatId,
            { text: "❌ You don't have any active sales in this group!" },
            { quoted: message },
          );
        }

        // Check if sale has expired (safety check)
        if (activeSale.hasExpired()) {
          await CardSale.cleanupExpiredSales(chatId);
          return sock.sendMessage(
            chatId,
            { text: "❌ Your sale has already expired!" },
            { quoted: message },
          );
        }

        // Perform the cancellation atomically
        const mongoose = require("mongoose");
        const session = await mongoose.startSession();

        try {
          await session.withTransaction(async () => {
            // Return card to seller's collection
            player.collection.push(activeSale.cardId._id);

            // Mark sale as expired/cancelled
            activeSale.status = "expired";

            // Save changes
            await player.save({ session });
            await activeSale.save({ session });
          });

          const cancelMsg =
            `❌ *SALE CANCELLED* ❌\n\n` +
            `🎴 *${activeSale.cardId.name}* (Tier ${activeSale.cardId.tier})\n` +
            `💰 Was priced at: ${activeSale.price} shards\n\n` +
            `✅ Card has been returned to your collection.\n` +
            `👤 Cancelled by: ${player.name}`;

          await sock.sendMessage(
            chatId,
            { text: cancelMsg },
            { quoted: message },
          );
        } catch (transactionError) {
          await session.abortTransaction();
          console.error(
            "Transaction error during cancellation:",
            transactionError,
          );
          await sock.sendMessage(
            chatId,
            { text: "❌ Error cancelling sale. Please try again." },
            { quoted: message },
          );
        } finally {
          await session.endSession();
        }
      } catch (error) {
        console.error("Cancelsale error:", error);
        await sock.sendMessage(
          chatId,
          { text: `❌ Error cancelling card sale.` },
          { quoted: message },
        );
      }
    },
  },
};
