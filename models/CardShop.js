const mongoose = require("mongoose");

const cardShopSchema = new mongoose.Schema(
  {
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Card",
      required: true,
    },
    sellerId: { type: String, required: true }, // WhatsApp JID of seller
    sellerName: { type: String, required: true }, // Display name of seller
    price: { type: Number, required: true, min: 1 }, // Price in shards
    purchaseCaptcha: { type: String, required: true }, // Random captcha for purchase
    listedAt: { type: Date, default: Date.now }, // When the card was listed
    expiresAt: { type: Date, required: true, index: false }, // 6 hours from listing
  },
  {
    timestamps: true,
  },
);

// Note: Manual expiry handling to prevent card loss - no TTL index

// Static method to get available slots count
cardShopSchema.statics.getAvailableSlots = async function () {
  const currentCount = await this.countDocuments();
  return Math.max(0, 12 - currentCount);
};

// Static method to check if shop is full
cardShopSchema.statics.isShopFull = async function () {
  const currentCount = await this.countDocuments();
  return currentCount >= 12;
};

// Method to check if card has expired (6 hours)
cardShopSchema.methods.hasExpired = function () {
  return Date.now() > this.expiresAt;
};

// Static method to clean up expired cards and return them to sellers
cardShopSchema.statics.cleanupExpiredCards = async function () {
  try {
    const Player = require("./Player");

    // Find all expired shop cards
    const expiredCards = await this.find({
      expiresAt: { $lte: new Date() },
    }).populate("cardId");

    let returnedCount = 0;

    for (const shopCard of expiredCards) {
      const seller = await Player.findOne({ userId: shopCard.sellerId });

      if (seller && shopCard.cardId) {
        seller.collection.push(shopCard.cardId._id);
        await seller.save();
        // Remove card from shop
        await this.deleteOne({ _id: shopCard._id });

        console.log(
          `🔄 Returned expired card ${shopCard.cardId.name} to ${shopCard.sellerName}`,
        );
        returnedCount++;
      }
    }

    if (returnedCount > 0) {
      console.log(`🧹 Cleaned up ${returnedCount} expired cards from shop`);
    }

    return returnedCount;
  } catch (error) {
    console.error("Error cleaning up expired cards:", error);
    return 0;
  }
};

module.exports = mongoose.model("CardShop", cardShopSchema);
