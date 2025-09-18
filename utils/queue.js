// queue.js
class MessageQueue {
    constructor(sock, delay = 800) { // default 0.8s between sends
        this.sock = sock;
        this.delay = delay;
        this.queue = [];
        this.sending = false;
    }

    async sendMessage(jid, content, options = {}) {
        return new Promise((resolve, reject) => {
            this.queue.push({ jid, content, options, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.sending || this.queue.length === 0) return;
        this.sending = true;

        while (this.queue.length > 0) {
            const { jid, content, options, resolve, reject } = this.queue.shift();
            try {
                const result = await this.sock.sendMessage(jid, content, options);
                resolve(result);
            } catch (err) {
                reject(err);
            }
            await new Promise(r => setTimeout(r, this.delay)); // ⏳ delay between sends
        }

        this.sending = false;
    }
}

module.exports = MessageQueue;
