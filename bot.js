const commands = require('./commands');
const config = require('./config');
const permissions = require('./utils/permissions');

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
            console.error('Error handling message:', error);
        }
    }

    async processMessage(message) {
        try {
            if (message.key.remoteJid === 'status@broadcast') return;
            if (!message.message) return;

            const messageText = this.getMessageText(message);
            if (!messageText) return;

            const prefix = config.get('prefix');
            if (!messageText.startsWith(prefix)) return;

            const args = messageText.slice(prefix.length).trim().split(' ');
            const commandName = args.shift().toLowerCase();

            if (!this.commands[commandName]) return;

            const sender = message.key.participant || message.key.remoteJid;
            const chatId = message.key.remoteJid;
            const isGroup = chatId.endsWith('@g.us');

            if (!config.checkCooldown(sender, commandName)) return;

            const command = this.commands[commandName];
            const hasPermission = await permissions.checkPermission(
                sender,
                chatId,
                command.adminOnly || false,
                this.sock
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
                bot: this
            };

            // --- Log command usage ---
            console.log(`[COMMAND] ${commandName} used by ${sender} in ${isGroup ? chatId : 'private chat'}`);

            await command.execute(context);

        } catch (error) {
            console.error('Error processing message:', error);
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

    async sendMessage(chatId, text, options = {}) {
        try {
            await this.msgQueue.sendMessage(chatId, {
                text: text,
                ...options
            });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    async sendImage(chatId, buffer, caption = '') {
        try {
            await this.msgQueue.sendMessage(chatId, {
                image: buffer,
                caption: caption,
                mimetype: 'image/jpeg' // or 'image/png' depending on the buffer
            });
        } catch (error) {
            console.error('Error sending image:', error);
        }
    }

    async sendVideo(chatId, buffer, caption = '', options = {}) {
        try {
            await this.msgQueue.sendMessage(chatId, {
                video: buffer,
                caption: caption,
                mimetype: 'video/mp4',
                gifPlayback: options.gif || false,
                ...options
            });
        } catch (error) {
            console.error('Error sending video:', error);
        }
    }

    async sendAudio(chatId, buffer) {
        try {
            await this.msgQueue.sendMessage(chatId, {
                audio: buffer,
                mimetype: 'audio/mp4'
            });
        } catch (error) {
            console.error('Error sending audio:', error);
        }
    }

    async handleGroupUpdate(updates) {
        try {
            for (const update of updates) {
                console.info('Group update:', update);
                // Extend this later if needed
            }
        } catch (error) {
            console.error('Error handling group update:', error);
        }
    }

    async handleParticipantsUpdate(update) {
        try {
            const { id: groupId, participants, action } = update;

            if (!config.get('settings').autoWelcome && !config.get('settings').autoFarewell) {
                return;
            }

            for (const participant of participants) {
                if (action === 'add' && config.get('settings').autoWelcome) {
                    await this.sendMessage(groupId, `👋 Welcome to the group, @${participant.split('@')[0]}!`);
                } else if (action === 'remove' && config.get('settings').autoFarewell) {
                    await this.sendMessage(groupId, `👋 Goodbye @${participant.split('@')[0]}!`);
                }
            }
        } catch (error) {
            console.error('Error handling participants update:', error);
        }
    }

    async addCommandReaction(message, commandName) {
        try {
            const reactions = config.get('reactions');
            const reactionEmoji = reactions.commands[commandName] || null;

            if (reactionEmoji) {
                await this.msgQueue.sendMessage(message.key.remoteJid, {
                    react: {
                        text: reactionEmoji,
                        key: message.key
                    }
                });
            }
        } catch (error) {
            console.error('Error adding reaction:', error);
        }
    }

}

module.exports = Bot;
