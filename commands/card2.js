const Player = require("../models/Player");
const Card = require("../models/Card");
const CardShop = require("../models/CardShop");
const axios = require("axios");

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
    execute: async ({ sender, chatId, args, bot }) => {
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
            return bot.sendMessage(chatId, "❌ Invalid card shop index!");
          }

          const shopCard = shopCards[cardIndex];
          const timeLeft = Math.max(
            0,
            Math.floor((shopCard.expiresAt - Date.now()) / (1000 * 60 * 60)),
          );

          const cardMsg =
            `🏪 *Card Shop - Position ${args[0]}*\n\n` +
            `📜 *Name:* ${shopCard.cardId.name}\n` +
            `⭐ *Tier:* ${shopCard.cardId.tier}\n` +
            `🎭 *Series:* ${shopCard.cardId.series}\n` +
            `👨‍🎨 *Maker:* ${shopCard.cardId.maker}\n\n` +
            `💰 *Price:* ${shopCard.price} shards\n` +
            `👤 *Seller:* ${shopCard.sellerName}\n` +
            `⏰ *Time Left:* ${timeLeft} hours\n` +
            `🔑 *Purchase Code:* ${shopCard.purchaseCaptcha}\n\n` +
            `💡 Use \`!purchase ${shopCard.purchaseCaptcha}\` to buy`;

          const imgBuffer = (
            await axios.get(shopCard.cardId.img, {
              responseType: "arraybuffer",
            })
          ).data;
          return bot.sendImage(chatId, imgBuffer, cardMsg);
        }

        // Show all cards in shop
        const shopMsg = formatCardShopList(shopCards);
        await bot.sendMessage(chatId, shopMsg);
      } catch (error) {
        console.error("Cardshop error:", error);
        await bot.sendMessage(chatId, "❌ Error accessing card shop.");
      }
    },
  },

  marketcard: {
    description: "Put a card from your collection on the market (Tier 4+ only)",
    usage: "marketcard <collection_index> <price>",
    aliases: ["listcard"],
    adminOnly: false,
    execute: async ({ sender, chatId, args, bot }) => {
      if (!args[0] || !args[1] || isNaN(args[0]) || isNaN(args[1])) {
        return bot.sendMessage(
          chatId,
          "❌ Usage: !marketcard <collection_index> <price>",
        );
      }

      try {
        // Clean up expired cards first
        await CardShop.cleanupExpiredCards();

        // Check if shop is full
        if (await CardShop.isShopFull()) {
          return bot.sendMessage(
            chatId,
            "❌ Card shop is full! Try again later when slots become available.",
          );
        }

        const player = await Player.findOne({ userId: sender }).populate(
          "collection",
        );
        if (!player) {
          return bot.sendMessage(chatId, "❌ Please register first!");
        }

        const cardIndex = parseInt(args[0]) - 1;
        const price = parseInt(args[1]);

        if (cardIndex < 0 || cardIndex >= player.collection.length) {
          return bot.sendMessage(chatId, "❌ Invalid collection index!");
        }

        if (price < 1) {
          return bot.sendMessage(chatId, "❌ Price must be at least 1 shard!");
        }

        const card = player.collection[cardIndex];

        // Check if card is tier 4 or above
        const tierNum = parseInt(card.tier);
        if (isNaN(tierNum) || tierNum < 4) {
          return bot.sendMessage(
            chatId,
            "❌ Only cards of Tier 4 and above can be sold!",
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

        const successMsg =
          `✅ *Card Listed Successfully!*\n\n` +
          `🎴 **${card.name}** (Tier ${card.tier})\n` +
          `💰 Price: ${price} shards\n` +
          `🔑 Purchase Code: ${captcha}\n` +
          `⏰ Expires in 6 hours\n\n` +
          `💡 Buyers can use \`!purchase ${captcha}\` to buy`;

        await bot.sendMessage(chatId, successMsg);
      } catch (error) {
        console.error("Marketcard error:", error);
        await bot.sendMessage(chatId, "❌ Error listing card for sale.");
      }
    },
  },

  purchase: {
    description: "Purchase a card from the marketplace using its captcha code",
    usage: "purchase <captcha_code>",
    aliases: ["getcard"],
    adminOnly: false,
    execute: async ({ sender, chatId, args, bot }) => {
      if (!args[0]) {
        return bot.sendMessage(chatId, "❌ Usage: !purchase <captcha_code>");
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
            `🎴 **${shopCard.cardId.name}** (Tier ${shopCard.cardId.tier})\n` +
            `💰 Paid: ${shopCard.price} shards\n` +
            `👤 Bought from: ${shopCard.sellerName}\n\n` +
            `🎉 Card added to your collection!`;

          await bot.sendMessage(chatId, successMsg);

          // Notify seller if online (optional)
          if (seller) {
            const sellerMsg =
              `💰 *Card Sold!*\n\n` +
              `🎴 **${shopCard.cardId.name}** sold for ${shopCard.price} shards\n` +
              `👤 Buyer: ${buyer.name}\n` +
              `💎 Your balance: ${seller.shards} shards`;

            try {
              await bot.sendMessage(shopCard.sellerId, sellerMsg);
            } catch (error) {
              // Seller might have bot blocked, ignore error
              console.log("Could not notify seller:", error.message);
            }
          }
        } catch (transactionError) {
          console.error("Purchase transaction error:", transactionError);
          await bot.sendMessage(
            chatId,
            `❌ ${transactionError.message || "Error processing purchase."}`,
          );
        } finally {
          await session.endSession();
        }
      } catch (error) {
        console.error("Purchase error:", error);
        await bot.sendMessage(chatId, "❌ Error processing purchase.");
      }
    },
  },
};
