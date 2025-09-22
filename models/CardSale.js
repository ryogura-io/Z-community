const mongoose = require("mongoose");

const cardSaleSchema = new mongoose.Schema({
  cardId: { type: mongoose.Schema.Types.ObjectId, ref: "Card", required: true },
  sellerId: { type: String, required: true }, // WhatsApp JID of seller
  sellerName: { type: String, required: true }, // Display name of seller
  groupId: { type: String, required: true }, // WhatsApp group JID where sale is happening
  price: { type: Number, required: true, min: 1 }, // Price in shards
  saleCaptcha: { type: String, required: true }, // Random captcha for purchase
  listedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }, // 10 minutes from listing
  status: { type: String, enum: ['active', 'sold', 'expired'], default: 'active' },
  buyerId: { type: String, default: null }, // WhatsApp JID of buyer when sold
  buyerName: { type: String, default: null }, // Display name of buyer when sold
  soldAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Index for efficient cleanup of expired sales
cardSaleSchema.index({ expiresAt: 1, status: 1 });
cardSaleSchema.index({ groupId: 1, status: 1 });
cardSaleSchema.index({ saleCaptcha: 1 });

// Method to check if sale has expired
cardSaleSchema.methods.hasExpired = function() {
  return Date.now() > this.expiresAt;
};

// Static method to cleanup expired sales and return cards to sellers
cardSaleSchema.statics.cleanupExpiredSales = async function(groupId = null) {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  
  try {
    return await session.withTransaction(async () => {
      const Player = require("./Player");
      
      let query = { 
        expiresAt: { $lte: new Date() }, 
        status: 'active' 
      };
      
      if (groupId) {
        query.groupId = groupId;
      }
      
      const expiredSales = await this.find(query).populate('cardId').session(session);
      
      let returnedCount = 0;
      
      for (const sale of expiredSales) {
        // Return card to seller's collection
        const seller = await Player.findOne({ userId: sale.sellerId }).session(session);
        if (seller && sale.cardId) {
          seller.collection.push(sale.cardId._id);
          await seller.save({ session });
          
          // Mark sale as expired
          sale.status = 'expired';
          await sale.save({ session });
          
          console.log(`🔄 Returned expired sale card ${sale.cardId.name} to ${sale.sellerName} in group ${sale.groupId}`);
          returnedCount++;
        }
      }
      
      return returnedCount;
    });
  } catch (error) {
    console.error("Error cleaning up expired sales:", error);
    return 0;
  } finally {
    await session.endSession();
  }
};

// Generate random 4-character captcha
cardSaleSchema.statics.generateCaptcha = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

module.exports = mongoose.model("CardSale", cardSaleSchema);