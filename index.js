const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState, 
    makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const Bot = require('./bot');
const config = require('./config');
const express = require("express");
const fs = require("fs");
const { Boom } = require('@hapi/boom');
const MessageQueue = require("./utils/queue"); // ✅ import queue
const readline = require("readline");
const { scheduleCardSpawns } = require("./spawnManager"); // your spawn logic
const mongoose = require("mongoose"); // fixed typo (was "moongoose")

const MONGO_URI = process.env.MONGODB_URI || 
  "mongodb+srv://Ryou:12345@shoob-cards.6bphku9.mongodb.net/?retryWrites=true&w=majority&appName=Shoob-Cards";

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: "cards-backup", // ensures correct DB is targeted
    });
    console.log("✅ Connected to MongoDB: shoob");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}

module.exports = { connectDB };


async function startBot() {
    await connectDB();
    try {
        console.log('🤖 Starting WhatsApp Bot...');

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
            logger: pino({ level: 'silent' }),
            syncFullHistory: false,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            generateHighQualityLinkPreview: true,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            getMessage: async () => undefined, 
        });
        
        //remove always online
        sock.sendPresenceUpdate = async () => { };

        // ✅ init queue
        const msgQueue = new MessageQueue(sock, 1000);

        // Pass both sock + queue into bot
        const bot = new Bot(sock, msgQueue);


        sock.ev.on('creds.update', saveCreds);

        // --- Connection Handling ---
        sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {

            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.info('Connection closed. Code:', reason);

                if (reason === DisconnectReason.badSession) {
                    console.log("❌ Bad session detected. Deleting session folder...");
                    fs.rmSync("./auth_info", { recursive: true, force: true });
                    return startBot();
                }

                if (reason === DisconnectReason.loggedOut) {
                    console.log("🚪 Logged out. Not reconnecting.");
                    return;
                }

                if (!sock.__reconnectTried) {
                    sock.__reconnectTried = true;
                    console.log("⚡ Reconnecting (once)...");
                    startBot();
                } else {
                    console.log("⛔ Reconnection disabled after first attempt.");
                }

            } else if (connection === 'open') {
                console.info('✅ WhatsApp bot connected successfully!');
                
                if (!sock.__welcomeSent) {
                    const firstOwner = config.get("phoneNumber");
                    const msg = `✅ *Zen-MD Connected!*\n\n` +
                        `🤖 WhatsApp Bot is online\n` +
                        `⏰ Connected at: ${new Date().toLocaleString()}\n` +
                        `📱 Status: Ready\n\n` +
                        `Type ${config.get('prefix')}help for commands.`;

                    try {
                        await msgQueue.sendMessage(firstOwner, { text: msg });
                        console.info(`✅ Success message sent to owner: ${firstOwner}`);
                        sock.__welcomeSent = true; // prevent spamming
                    } catch (err) {
                        console.error(`❌ Failed to send message to ${firstOwner}:`, err);
                    }
                }
            }
        });

        // --- Pairing Code (only when no saved session) ---
        if (!state.creds.registered) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            setTimeout(async () => {
                try {
                    const phoneNumber = config.get("pairingNumber");
                    console.log(`⏳ Generating pairing code for: ${phoneNumber} ...`);
                    const code = await sock.requestPairingCode(phoneNumber.trim());
                    console.log(`\n🔑 Your WhatsApp Pairing Code: ${code}`);
                    console.log("👉 Open WhatsApp > Linked Devices > Link with phone number and enter this code.\n");
                } catch (err) {
                    console.error("❌ Failed to generate pairing code:", err);
                }
            }, 2000);
        }

        // --- Message Handling ---
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message) return;
                if (msg.message.protocolMessage) return;

                await bot.handleMessage(m);

            } catch (err) {
                if (String(err).includes("Bad MAC")) {
                    console.log("⚠️ Bad MAC detected. Clearing session...");
                    fs.rmSync("./auth_info", { recursive: true, force: true });
                    return startBot();
                }
                console.error("❌ Error handling message:", err.message || err);
            }
        });

        scheduleCardSpawns(sock, msgQueue); // start spawn scheduler

    } catch (error) {
        console.error('❌ Error starting bot:', error);
    }
}

// === Keep Alive Server ===
const app = express();
const PORT = process.env.PORT || 5001;

app.get("/", (req, res) => {
  res.send("✅ Gura-MD bot is alive!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
  
  startBot();
});
