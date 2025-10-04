const pairingNumber = '2349125642864'
const phoneNumber = '2349125642864' + '@s.whatsapp.net';
// phone number in international format without + or spaces 

// Default configuration
const defaultConfig = {
    prefix: '!',
    ownerName: 'Zen',
    phoneNumber,
    pairingNumber,
    ownerNumber: [
        phoneNumber,
        '270617702056168@lid',
    ], // Owner's WhatsApp number
    admins: [
        phoneNumber,
        '33381123379402@lid',
        '270617702056168@lid',
    ], // Admin numbers
    allowedGroups: [], // If empty, bot works in all groups
    commandCooldown: 2000, // 2 seconds
    settings: {
        autoWelcome: false,
        autoFarewell: false,
        restrictToAdmins: false,
        mode: 'public', // 'public' or 'private'
    },
    reactions : { commands: { help:'❓',basic:'📜',utility:'📜',downloads:'📜',games:'📜',media:'📜',group:'📜',h:'❓',menu:'❓',ping:'🏓',profile:'👤',pp:'👤',tts:'🔊',owner:'👑',locked:'👑',joke:'😂',fact:'🧠',quote:'💭',weather:'🌤️',define:'📖',lyrics:'🎵',vv:'👀',
sticker:'🎯',s:'🎯',toimg:'🖼️',img:'🖼️',image:'🖼️',pic:'🖼️',take:'👊',steal:'👊',tourl:'🔗',url:'🔗',tiny:'✂',movie:'🎬',imdb:'🎬',anime:'🎌',ani:'🎌',hangman:'🪢',trivia:'❓', scramble:'🔤', poke:'🐲', poke:'🐲', tictactoe:'⭕',ttt:'⭕',truth:'🗣️',dare:'🔥',word:'🔤',a:'🅰️',
play:'▶️',yt:'▶️',video:'▶️',song:'🎶',tomp3:'🎶',instagram:'📸',ig:'📸',tiktok:'🎵',tt:'🎵',spotify:'🎵',spot:'🎵',youtube:'▶️',ytmp3:'🎧',waifu:'💮',wife:'💮',promote:'⬆️',demote:'⬇️',kick:'👢',remove:'👢',add:'➕',setname:'📝',setdesc:'📜',close:'🔒',
mute:'🔒',open:'🔓',unmute:'🔓',tag:'🏷️',tagall:'📣',admins:'🛡️',resetlink:'♻️',groupinfo:'ℹ️',ginfo:'ℹ️',link:'🔗',ban:'🚫',unban:'✅',addsudo:'✅',aadmin:'✅',antilink:'🛑',delsudo:'🛑',radmin:'🛑',mode:'⚙️',settings:'⚙️',setting:'⚙️',set:'⚙️',
antidelete:'🗑️',setpp:'🖼️' }, phoneNumbers:{} }

};

module.exports = defaultConfig

class Config {
    constructor() {
        this.config = { ...defaultConfig };
        this.cooldowns = new Map();
    }

    // Get config value
    get(key) {
        return key ? this.config[key] : this.config;
    }

    // Set config value
    set(key, value) {
        this.config[key] = value;
        return true;
    }

    // Update settings
    updateSettings(settings) {
        this.config.settings = { ...this.config.settings, ...settings };
        return true;
    }

    // Admin management
    addAdmin(number) {
        if (!this.config.admins.includes(number)) {
            this.config.admins.push(number);
            return true;
        }
        return false;
    }

    removeAdmin(number) {
        const index = this.config.admins.indexOf(number);
        if (index > -1) {
            this.config.admins.splice(index, 1);
            return true;
        }
        return false;
    }

    isAdmin(number) {
        return this.config.admins.includes(number);
    }

    isOwner(number) {
        return this.config.ownerNumber.includes(number);
    }

    // Command cooldowns
    checkCooldown(userId, commandName) {
        const key = `${userId}-${commandName}`;
        const now = Date.now();
        const lastUsed = this.cooldowns.get(key);

        if (lastUsed && (now - lastUsed) < this.config.commandCooldown) {
            return false;
        }

        this.cooldowns.set(key, now);
        return true;
    }

    // Get emoji for a command
    getCommandEmoji(command) {
        return this.config.reactions.commands[command] || null;
    }

    // Get emoji for a phone number
    getNumberEmoji(number) {
        return this.config.reactions.phoneNumbers[number] || null;
    }

    // Get emoji for either command or phone
    getReaction({ command, number }) {
        return command ? this.getCommandEmoji(command) : this.getNumberEmoji(number);
    }
}

module.exports = new Config();
