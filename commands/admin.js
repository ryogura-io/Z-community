const config = require('../config');
const permissions = require('../utils/permissions');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const adminCommands = {
    addadmin: {
        description: 'Add a user as bot admin',
        usage: 'addadmin <phone_number | mention | reply>',
        aliases: ["aadmin", "addsudo"],
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, sock, sender, message, isGroup } = context;
            const isOwner = await permissions.isBotOwner(sender);
            if (!isOwner) {
                await sock.sendMessage(chatId, { text: '❌ You are not authorized to use this command.' }, { quoted: message });
                return;
            }

            let phoneNumber;

            // 🔹 1. Mentioned
            if (message?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                const mentioned = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                phoneNumber = mentioned.split('@')[0];
            }

            // 🔹 2. Quoted
            else if (message?.message?.extendedTextMessage?.contextInfo?.participant) {
                const quoted = message.message.extendedTextMessage.contextInfo.participant;
                phoneNumber = quoted.split('@')[0];
            }

            // 🔹 3. Manual input
            else if (args.length > 0) {
                phoneNumber = args[0].replace(/[^\d]/g, '');
            }

            // 🔹 Validate
            if (!phoneNumber || phoneNumber.length < 10) {
                await sock.sendMessage(chatId, { text: '❌ Please provide or mention a valid phone number.\nUsage: !addadmin <phone | mention | reply>' }, { quoted: message });
                return;
            }

            // 🔹 Normalize JID
            let fullNumber;
            if (isGroup) {
                fullNumber = phoneNumber + '@lid';
            } else {
                fullNumber = phoneNumber + '@s.whatsapp.net';
            }

            if (config.addAdmin(fullNumber)) {
                await sock.sendMessage(chatId, { text: `✅ Added ${phoneNumber} as bot admin.` }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text: `ℹ️ ${phoneNumber} is already a bot admin.` }, { quoted: message });
            }
        }
    },

    
    removeadmin: {
        description: 'Remove a user from bot admins',
        usage: 'removeadmin <phone_number | mention | reply>',
        aliases: ["radmin", "delsudo"],
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, sock, sender, message, isGroup } = context;

            const isOwner = await permissions.isBotOwner(sender);
            if (!isOwner) {
                await sock.sendMessage(chatId, { text: '❌ You are not authorized to use this command.' }, { quoted: message });
                return;
            }

            let phoneNumber;

            // 🔹 1. Check if user was mentioned
            if (message?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                const mentioned = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
                phoneNumber = mentioned.split('@')[0];
            }

            // 🔹 2. If not mentioned, check if message is a reply (quoted)
            else if (message?.message?.extendedTextMessage?.contextInfo?.participant) {
                const quoted = message.message.extendedTextMessage.contextInfo.participant;
                phoneNumber = quoted.split('@')[0];
            }

            // 🔹 3. If neither, use args[0] (manual input)
            else if (args.length > 0) {
                phoneNumber = args[0].replace(/[^\d]/g, '');
            }

            // 🔹 Validate
            if (!phoneNumber || phoneNumber.length < 10) {
                await sock.sendMessage(chatId, { text: '❌ Please provide, mention, or reply with a valid phone number.\nUsage: !removeadmin <phone | mention | reply>' }, { quoted: message });
                return;
            }

            // 🔹 Normalize JID
            let fullNumber;
            if (isGroup) {
                fullNumber = phoneNumber + '@lid';
            } else {
                fullNumber = phoneNumber + '@s.whatsapp.net';
            }

            if (config.removeAdmin(fullNumber)) {
                await sock.sendMessage(chatId, { text: `✅ Removed ${phoneNumber} from bot admins.` }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text: `❌ ${phoneNumber} is not a bot admin.` }, { quoted: message });
            }
        }
    },

    
    settings: {
        description: 'Show current bot settings',
        usage: 'settings',
        aliases: ["setting"],
        adminOnly: true,
        execute: async (context) => {
            const { chatId, sock, message } = context;
            const settings = config.get('settings');
            const admins = config.get('admins');
            
            const settingsText = `⚙️ *Bot Settings*\n\n` +
                `*Prefix:* ${config.get('prefix')}\n` +
                `*Auto Welcome:* ${settings.autoWelcome ? 'Enabled' : 'Disabled'}\n` +
                `*Auto Farewell:* ${settings.autoFarewell ? 'Enabled' : 'Disabled'}\n` +
                `*Restrict to Admins:* ${settings.restrictToAdmins ? 'Enabled' : 'Disabled'}\n` +
                `*Command Cooldown:* ${config.get('commandCooldown')}ms\n` +
                `*Bot Sudo:* ${admins.length}\n\n` +
                admins.map(admin => `• ${admin.split('@')[0]}`).join('\n');
            
            await sock.sendMessage(chatId, { text: settingsText }, { quoted: message });
        }
    },
    
    setsetting: {
        description: 'Change bot settings',
        usage: 'setsetting <key> <value>',
        aliases: ["set"],
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, sock, message, sender } = context;

            const isOwner = await permissions.isBotOwner(sender)
            if (!isOwner) {
                await sock.sendMessage(chatId, { text: '❌ You are not authorized to use this command.' }, { quoted: message });
                return;
            }
            if (args.length < 2) {
                await sock.sendMessage(chatId, { text: '❌ Please provide setting key and value.\nUsage: !setsetting autoWelcome true' }, { quoted: message });
                return;
            }
            
            const key = args[0].toLowerCase();
            const value = args[1].toLowerCase();
            
            const validSettings = ['autowelcome', 'autofarewell', 'restricttoadmins'];
            
            if (!validSettings.includes(key)) {
                await sock.sendMessage(chatId, { text: `❌ Invalid setting key. Valid keys: ${validSettings.join(', ')}` }, { quoted: message });
                return;
            }
            
            const boolValue = value === 'true' || value === 'on' || value === 'yes' || value === '1';
            
            const settings = config.get('settings');
            
            // Map to actual setting names
            const settingMap = {
                autowelcome: 'autoWelcome',
                autofarewell: 'autoFarewell',
                restricttoadmins: 'restrictToAdmins',
            };

            const actualKey = settingMap[key];
            if (actualKey) {
                settings[actualKey] = boolValue;
                config.updateSettings(settings);
                await sock.sendMessage(chatId, { text: `✅ Setting ${actualKey} updated to: ${boolValue}` }, { quoted: message });
            }
        }
    },

    mode: {
        description: 'Change bot mode (private/public)',
        usage: 'mode <private/public>',
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, bot, sender, sock, message } = context;

            // ✅ check if sender is allowed
            const allowed = await permissions.checkPermission(sender, chatId, true, bot);
            if (!allowed) {
                await sock.sendMessage(chatId, { text: '❌ You are not authorized to use this command.' }, { quoted: message });
                return;
            }

            const isOwner = await permissions.isBotOwner(sender)
            if (!isOwner) {
                await sock.sendMessage(chatId, { text: '❌ You are not authorized to use this command.' }, { quoted: message });
                return;
            }

            if (args.length === 0) {
                const currentMode = config.get('settings').mode;
                await sock.sendMessage(chatId, { text: `ℹ️ Current bot mode: *${currentMode}*\n\nUsage: !mode <private/public>` }, { quoted: message });
                return;
            }

            const mode = args[0].toLowerCase();

            if (mode !== 'private' && mode !== 'public') {
                await sock.sendMessage(chatId, { text: '❌ Invalid mode. Use "private" or "public".' }, { quoted: message });
                return;
            }

            const settings = config.get('settings');
            settings.mode = mode;
            settings.restrictToAdmins = (mode === 'private');

            config.updateSettings(settings);

            const modeText = mode === 'private'
                ? '🔒 Bot is now in *Private Mode*\nOnly bot owner and admins can use commands.'
                : '🌐 Bot is now in *Public Mode*\nEveryone can use bot commands.';

            await sock.sendMessage(chatId, { text: `✅ ${modeText}` }, { quoted: message });
        }
    },

    setpp: {
        description: 'Set bot profile picture',
        usage: 'setpp (reply to image)',
        adminOnly: true,
        execute: async (context) => {
            const { chatId, message, sender, sock } = context;

            const allowed = await permissions.checkPermission(sender, chatId, true, sock);
            if (!allowed) {
                await sock.sendMessage(chatId, { text: '❌ You are not authorized to use this command.' }, { quoted: message });
                return;
            }

            const isOwner = await permissions.isBotOwner(sender)
            if (!isOwner) {
                await sock.sendMessage(chatId, { text: '❌ You are not authorized to use this command.' }, { quoted: message });
                return;
            }

            let targetMessage = null;
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (quotedMessage?.imageMessage) {
                targetMessage = {
                    key: message.message.extendedTextMessage.contextInfo.stanzaId,
                    message: quotedMessage
                };
            } else if (message.message?.imageMessage) {
                targetMessage = message;
            }

            if (!targetMessage) {
                await sock.sendMessage(chatId, { text: '❌ Please reply to an image or send an image with the command.' }, { quoted: message });
                return;
            }

            try {
                await sock.sendMessage(chatId, { text: '⏳ Setting profile picture...' }, { quoted: message });
                const buffer = await downloadMediaMessage(targetMessage, 'buffer', {});
                if (!buffer) {
                    await sock.sendMessage(chatId, { text: '❌ Failed to download image.' }, { quoted: message });
                    return;
                }
                await sock.updateProfilePicture(sock.user.id, buffer);
                await sock.sendMessage(chatId, { text: '✅ Profile picture updated successfully!' }, { quoted: message });
            } catch (error) {
                await sock.sendMessage(chatId, { text: '❌ Error setting profile picture.' }, { quoted: message });
            }
        }
    },

    left: {
        description: "Make the bot leave the current group",
        usage: "left",
        adminOnly: true,
        execute: async ({ sender, chatId, isGroup, sock, message }) => {
            if (!isGroup) {
                return sock.sendMessage(chatId, { text: "❌ This command can only be used in groups." }, {quoted: message});
            }

            try {
                await sock.sendMessage(chatId, { text: "👋 Goodbye! The bot is leaving this group." }, {quoted: message});
                await sock.groupLeave(chatId);
                console.log(`[LEFT] Bot left group ${chatId} by admin ${sender}`);
            } catch (error) {
                console.error('Left command error:', error);
                await sock.sendMessage(chatId, { text: "❌ Error leaving group." }, {quoted: message});
            }
        }
    }

};

module.exports = adminCommands;
