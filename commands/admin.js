const config = require('../config');
const permissions = require('../utils/permissions');

const adminCommands = {
    addadmin: {
        description: 'Add a user as bot admin',
        usage: 'addadmin <phone_number | mention | reply>',
        aliases: ["aadmin", "addsudo"],
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, bot, sender, message, isGroup } = context;
            const isOwner = await permissions.isBotOwner(sender);
            if (!isOwner) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
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
                await bot.sendMessage(
                    chatId,
                    '❌ Please provide or mention a valid phone number.\nUsage: !addadmin <phone | mention | reply>'
                );
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
                await bot.sendMessage(chatId, `✅ Added ${phoneNumber} as bot admin.`);
            } else {
                await bot.sendMessage(chatId, `ℹ️ ${phoneNumber} is already a bot admin.`);
            }
        }
    },

    
    removeadmin: {
        description: 'Remove a user from bot admins',
        usage: 'removeadmin <phone_number | mention | reply>',
        aliases: ["radmin", "delsudo"],
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, bot, sender, message, isGroup } = context;

            const isOwner = await permissions.isBotOwner(sender);
            if (!isOwner) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
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
                await bot.sendMessage(chatId, '❌ Please provide, mention, or reply with a valid phone number.\nUsage: !removeadmin <phone | mention | reply>');
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
                await bot.sendMessage(chatId, `✅ Removed ${phoneNumber} from bot admins.`);
            } else {
                await bot.sendMessage(chatId, `❌ ${phoneNumber} is not a bot admin.`);
            }
        }
    },

    
    settings: {
        description: 'Show current bot settings',
        usage: 'settings',
        aliases: ["setting"],
        adminOnly: true,
        execute: async (context) => {
            const { chatId, bot } = context;
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
            
            await bot.sendMessage(chatId, settingsText);
        }
    },
    
    setsetting: {
        description: 'Change bot settings',
        usage: 'setsetting <key> <value>',
        aliases: ["set"],
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, bot, sender } = context;

            const isOwner = await permissions.isBotOwner(sender)
            if (!isOwner) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
                return;
            }
            if (args.length < 2) {
                await bot.sendMessage(chatId, '❌ Please provide setting key and value.\nUsage: !setsetting autoWelcome true');
                return;
            }
            
            const key = args[0].toLowerCase();
            const value = args[1].toLowerCase();
            
            const validSettings = ['autowelcome', 'autofarewell', 'restricttoadmins'];
            
            if (!validSettings.includes(key)) {
                await bot.sendMessage(chatId, `❌ Invalid setting key. Valid keys: ${validSettings.join(', ')}`);
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
                await bot.sendMessage(chatId, `✅ Setting ${actualKey} updated to: ${boolValue}`);
            }
        }
    },

    mode: {
        description: 'Change bot mode (private/public)',
        usage: 'mode <private/public>',
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, bot, sender } = context;

            // ✅ check if sender is allowed
            const allowed = await permissions.checkPermission(sender, chatId, true, bot);
            if (!allowed) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
                return;
            }

            const isOwner = await permissions.isBotOwner(sender)
            if (!isOwner) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
                return;
            }

            if (args.length === 0) {
                const currentMode = config.get('settings').mode;
                await bot.sendMessage(chatId, `ℹ️ Current bot mode: *${currentMode}*\n\nUsage: !mode <private/public>`);
                return;
            }

            const mode = args[0].toLowerCase();

            if (mode !== 'private' && mode !== 'public') {
                await bot.sendMessage(chatId, '❌ Invalid mode. Use "private" or "public".');
                return;
            }

            const settings = config.get('settings');
            settings.mode = mode;
            settings.restrictToAdmins = (mode === 'private');

            config.updateSettings(settings);

            const modeText = mode === 'private'
                ? '🔒 Bot is now in *Private Mode*\nOnly bot owner and admins can use commands.'
                : '🌐 Bot is now in *Public Mode*\nEveryone can use bot commands.';

            await bot.sendMessage(chatId, `✅ ${modeText}`);
        }
    },

    setpp: {
        description: 'Set bot profile picture',
        usage: 'setpp (reply to image)',
        adminOnly: true,
        execute: async (context) => {
            const { chatId, bot, message, sender, sock } = context;

            const allowed = await permissions.checkPermission(sender, chatId, true, sock);
            if (!allowed) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
                return;
            }

            const isOwner = await permissions.isBotOwner(sender)
            if (!isOwner) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
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
                await bot.sendMessage(chatId, '❌ Please reply to an image or send an image with the command.');
                return;
            }

            try {
                await bot.sendMessage(chatId, '⏳ Setting profile picture...');
                const buffer = await downloadMediaMessage(targetMessage, 'buffer', {});
                if (!buffer) {
                    await bot.sendMessage(chatId, '❌ Failed to download image.');
                    return;
                }
                await sock.updateProfilePicture(sock.user.id, buffer);
                await bot.sendMessage(chatId, '✅ Profile picture updated successfully!');
            } catch (error) {
                await bot.sendMessage(chatId, '❌ Error setting profile picture.');
            }
        }
    },
};

module.exports = adminCommands;
