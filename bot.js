const commands = require("./commands");
const config = require("./config");
const permissions = require("./utils/permissions");

class Bot {
    constructor(sock, msgQueue) {
        this.sock = sock;
        this.msgQueue = msgQueue;
        this.commands = commands;
    }

    async handleMessage(messageUpdate) {
        try {
            const messages = messageUpdate.messages;
            if (!messages || messages.length === 0) return;

            for (const message of messages) {
                await this.processMessage(message);
            }
        } catch (error) {
            console.error("Error handling message:", error);
        }
    }

    async processMessage(message) {
        try {
            if (message.key.remoteJid === "status@broadcast") return;
            if (!message.message) return;

            const messageText = this.getMessageText(message);
            const sender = message.key.participant || message.key.remoteJid;
            const chatId = message.key.remoteJid;
            const isGroup = chatId.endsWith("@g.us");

            if (!isGroup) return;

            const Group = require("./models/Group");
            const Player = require("./models/Player");
            const group = await Group.findOne({ groupId: chatId });
            const player = await Player.findOne({ userId: sender });

            // 🔹 1) AFK OFF if the player sends ANY message
            if (player?.isAfk) {
                player.isAfk = false;
                player.afkMessage = "";
                await player.save();

                await this.sock.sendMessage(
                    chatId,
                    {
                        text: `✅ Welcome back! You're no longer AFK.`,
                        mentions: [sender],
                    },
                    { quoted: message },
                );
            }

            // 🔹 2) AFK REPLY if quoting/mentioning AFK users
            const mentioned =
                message.message?.extendedTextMessage?.contextInfo
                    ?.mentionedJid || [];
            const quotedJid =
                message.message?.extendedTextMessage?.contextInfo
                    ?.participant || null;

            const afkUsers = [...mentioned, quotedJid].filter(Boolean);

            if (afkUsers.length > 0) {
                for (const u of afkUsers) {
                    const afkPlayer = await Player.findOne({ userId: u });
                    if (afkPlayer?.isAfk) {
                        await this.sock.sendMessage(
                            chatId,
                            {
                                text: `💤 *${afkPlayer.name || u}* is currently AFK. \n📝 Message: ${afkPlayer.afkMessage}`,
                            },
                            { quoted: message },
                        );
                    }
                }
            }

            // ⬇️ STOP HERE if the message is NOT a command
            const prefix = config.get("prefix");
            if (!messageText || !messageText.startsWith(prefix)) return;

            // 🔹 3) COMMAND HANDLING (same as your code below)
            const args = messageText.slice(prefix.length).trim().split(" ");
            const commandName = args.shift().toLowerCase();

            if (
                (!group || group.status !== "enabled") &&
                !(player && player.isModerator)
            ) {
                return;
            }

            // --- 🔥 BANNED CHECK ---
            const User = require("./models/Player"); // adjust path if needed
            const userDoc = await User.findOne({ userId: sender });
            if (userDoc?.isBanned) {
                console.log(
                    `[BLOCKED] Banned user ${sender} tried to use ${commandName}`,
                );
                return; // ❌ Stop here, don’t execute anything
            }

            // --- 🚫 DISABLED COMMANDS CHECK ---
            const Config = require("./models/Config");
            const configDoc = await Config.findOne({});
            if (configDoc?.disabledCommands?.includes(commandName)) {
                await this.sock.sendMessage(
                    chatId,
                    {
                        text: `🚫 The command ${commandName} is currently disabled.`,
                    },
                    { quoted: message },
                );
                console.log(
                    `[BLOCKED] Disabled command ${commandName} used by ${sender}`,
                );
                return; // ❌ Stop here, command is disabled
            }

            // --- ⏰ TIMEOUT CHECK ---
            if (userDoc?.timeout && userDoc.timeout > Date.now()) {
                console.log(
                    `[BLOCKED] User ${sender} is in timeout until ${new Date(userDoc.timeout)}`,
                );
                return; // ❌ Stop here, user is in timeout
            }

            if (!this.commands[commandName]) {
                await this.sock.sendMessage(
                    chatId,
                    {
                        text: `❌ Unknown command: *${commandName}*\n💡 Try ${config.get("prefix")}help for a list of commands.`,
                    },
                    { quoted: message },
                );
                return;
            }

            if (!config.checkCooldown(sender, commandName)) return;

            const command = this.commands[commandName];
            const hasPermission = await permissions.checkPermission(
                sender,
                chatId,
                command.adminOnly || false,
                this.sock,
            );
            if (!hasPermission) return;

            await this.addCommandReaction(message, commandName);

            const context = {
                sock: this.sock,
                msgQueue: this.msgQueue,
                message,
                args,
                sender,
                chatId,
                isGroup,
                messageText,
                bot: this,
            };

            // --- Log command usage ---
            console.log(
                `[COMMAND] ${commandName} used by ${sender} in ${isGroup ? chatId : "private chat"}`,
            );

            // Add EXP for command usage
            await this.addCommandExp(sender, commandName, chatId);

            await command.execute(context);
        } catch (error) {
            console.error("Error processing message:", error);
        }
    }

    getMessageText(message) {
        const messageContent = message.message;

        if (messageContent.conversation) {
            return messageContent.conversation;
        }
        if (messageContent.extendedTextMessage?.text) {
            return messageContent.extendedTextMessage.text;
        }
        if (messageContent.imageMessage?.caption) {
            return messageContent.imageMessage.caption;
        }
        if (messageContent.videoMessage?.caption) {
            return messageContent.videoMessage.caption;
        }
        return null;
    }

    async handleGroupUpdate(updates) {
        try {
            for (const update of updates) {
                console.info("Group update:", update);
                // Extend this later if needed
            }
        } catch (error) {
            console.error("Error handling group update:", error);
        }
    }

    async handleParticipantsUpdate(update) {
        try {
            const { id: groupId, participants, action } = update;

            // Check if group is enabled
            const Group = require("./models/Group");
            const group = await Group.findOne({ groupId: groupId });
            if (!group || group.status !== "enabled") {
                return; // Only send welcome messages in enabled groups
            }

            for (const participant of participants) {
                if (action === "add") {
                    const welcomeMsg =
                        `🎉 *Welcome to ${group.groupName || "the group"}!*\n\n` +
                        `👋 Hello @${participant.split("@")[0]}!\n` +
                        `🤖 This group has ZEN bot enabled\n` +
                        `ℹ️ Type ${config.get("prefix")}help to see available commands\n` +
                        `🎆 Have fun and enjoy the card collection game!`;

                    await this.sock.sendMessage(groupId, {
                        text: welcomeMsg,
                        mentions: [participant],
                    });
                } else if (action === "remove") {
                    await this.sock.sendMessage(groupId, {
                        text: `👋 Goodbye @${participant.split("@")[0]}! Thanks for being part of our community.`,
                        mentions: [participant],
                    });
                }
            }
        } catch (error) {
            console.error("Error handling participants update:", error);
        }
    }

    async addCommandReaction(message, commandName) {
        try {
            const reactions = config.get("reactions");
            let reactionEmoji = reactions.commands[commandName] || null;

            // If no specific reaction, use random emoji from array
            if (!reactionEmoji) {
                const randomEmojis = [
                    "✅",
                    "⚡",
                    "🚀",
                    "💫",
                    "🔥",
                    "💎",
                    "⭐",
                    "🌟",
                    "✨",
                    "☀",
                    "❤️",
                    "💖",
                    "🩵",
                    "💧",
                    "🫧",
                ];
                reactionEmoji =
                    randomEmojis[
                        Math.floor(Math.random() * randomEmojis.length)
                    ];
            }

            if (reactionEmoji) {
                await this.msgQueue.sendMessage(message.key.remoteJid, {
                    react: {
                        text: reactionEmoji,
                        key: message.key,
                    },
                });
            }
        } catch (error) {
            console.error("Error adding reaction:", error);
        }
    }

    async addCommandExp(userId, commandName, chatId = null) {
        try {
            const Player = require("./models/Player");
            const player = await Player.findOne({ userId: userId });

            if (player) {
                // Different EXP amounts for different commands
                let expGain = 2; // Default EXP

                if (["claim", "spawn"].includes(commandName)) {
                    expGain = 10;
                } else if (["daily", "slot", "rob"].includes(commandName)) {
                    expGain = 10;
                } else if (["register", "bonus"].includes(commandName)) {
                    expGain = 10;
                }

                player.exp += expGain;

                const oldLevel = player.level;

                // Function to calculate total EXP needed for a given level
                function expForLevel(level) {
                    return ((level * (level + 1)) / 2) * 1000;
                }

                // Find the highest level the player qualifies for
                let newLevel = oldLevel;
                while (player.exp >= expForLevel(newLevel)) {
                    newLevel++;
                }

                // If leveled up, apply rewards
                if (newLevel > oldLevel) {
                    player.level = newLevel;
                    player.shards += newLevel * 100; // Level up bonus (shards)

                    // Crystal rewards: Level 1->2 = 100, then +5 per level
                    const crystalReward = 100 + (newLevel - 2) * 5;
                    player.crystals += crystalReward;

                    // Send levelup message if chatId is provided
                    if (chatId && this.sock) {
                        const levelUpMsg =
                            `🎉 *LEVEL UP!*\n\n` +
                            `👤 *${player.name}* reached Level ${newLevel}!\n` +
                            `🎁 *Rewards:*\n` +
                            `💰 Shards: +${newLevel * 100}\n` +
                            `💎 Crystals: +${crystalReward}\n\n` +
                            `🌟 Keep collecting to reach even higher levels!`;

                        try {
                            await this.sock.sendMessage(chatId, {
                                text: levelUpMsg,
                            });
                        } catch (err) {
                            console.error(
                                "Error sending levelup message:",
                                err,
                            );
                        }
                    }
                }

                await player.save();
            }
        } catch (error) {
            console.error("Error adding command exp:", error);
        }
    }
}

module.exports = Bot;
