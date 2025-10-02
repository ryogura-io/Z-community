const Player = require("../models/Player");

async function addItemToInventory(userId, itemName, amount = 1) {
    const player = await Player.findOne({ userId });

    if (!player) throw new Error("Player not found");

    const itemIndex = player.inventory.findIndex(i => i.item === itemName);

    if (itemIndex >= 0) {
        // Item exists, increment quantity
        player.inventory[itemIndex].quantity += amount;
    } else {
        // Add new item
        player.inventory.push({ item: itemName, quantity: amount });
    }

    await player.save();
    return player.inventory;
}

async function removeItemFromInventory(userId, itemName, amount = 1) {
    const player = await Player.findOne({ userId });

    if (!player) throw new Error("Player not found");

    const itemIndex = player.inventory.findIndex(i => i.item === itemName);

    if (itemIndex < 0) throw new Error("Item not found in inventory");

    player.inventory[itemIndex].quantity -= amount;

    // Remove if quantity reaches 0
    if (player.inventory[itemIndex].quantity <= 0) {
        player.inventory.splice(itemIndex, 1);
    }

    await player.save();
    return player.inventory;
}

async function getInventory(userId) {
    const player = await Player.findOne({ userId });
    if (!player) throw new Error("Player not found");
    return player.inventory;
}

module.exports = { addItemToInventory, removeItemFromInventory, getInventory };
