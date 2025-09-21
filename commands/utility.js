const gtts = require('gtts');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

const utilityCommands = {
    tts: {
        description: 'Convert text to speech',
        usage: 'tts <text>',
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot, sock, message } = context;

            if (args.length === 0) {
                await sock.sendMessage(chatId, { text: '❌ Please provide text to convert.\nUsage: !tts Hello World' }, { quoted: message });
                return;
            }

            try {
                const text = args.join(' ');
                const tts = new gtts(text, 'en');
                const tempFile = path.join(__dirname, '..', 'temp', `tts_${Date.now()}.mp3`);

                // Create temp directory if it doesn't exist
                const tempDir = path.dirname(tempFile);
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }

                tts.save(tempFile, async (err) => {
                    if (err) {
                        await sock.sendMessage(chatId, { text: '❌ Error generating speech' }, { quoted: message });
                        return;
                    }

                    const audioBuffer = fs.readFileSync(tempFile);
                    await sock.sendMessage(chatId, { audio: audioBuffer, mimetype: 'audio/mpeg' }, { quoted: message });

                    // Clean up temp file
                    fs.unlinkSync(tempFile);
                });

            } catch (error) {
                await sock.sendMessage(chatId, { text: '❌ Error converting text to speech' }, { quoted: message });
            }
        }
    },

    owner: {
        description: 'Send owner contact card',
        usage: 'owner',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock } = context;

            try {
                const vcard = 'BEGIN:VCARD\n' +
                    'VERSION:3.0\n' +
                    'FN:Chris\n' +
                    'ORG:WhatsApp Bot;\n' +
                    'TEL;type=CELL;type=VOICE;waid=2347010285113:+234 701 028 5113\n' +
                    'END:VCARD';

                await sock.sendMessage(chatId, {
                    contacts: {
                        displayName: 'Chris',
                        contacts: [{
                            vcard: vcard
                        }]
                    }
                });
            } catch (error) {
                await sock.sendMessage(chatId, { text: '❌ Error sending owner contact' }, { quoted: message });
            }
        }
    },

    joke: {
        description: 'Get a random joke',
        usage: 'joke',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock, message } = context;

            try {
                const response = await axios.get('https://official-joke-api.appspot.com/random_joke');
                const joke = response.data;

                const jokeText = `😂 *Random Joke*\n\n${joke.setup}\n\n${joke.punchline}`;
                await sock.sendMessage(chatId, { text: jokeText }, { quoted: message });
            } catch (error) {
                await sock.sendMessage(chatId, { text: '❌ Error fetching joke. Try again later!' }, { quoted: message });
            }
        }
    },

    fact: {
        description: 'Get a random fact',
        usage: 'fact',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock, message } = context;

            try {
                const response = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
                const fact = response.data.text;

                const factText = `🧠 *Random Fact*\n\n${fact}`;
                await sock.sendMessage(chatId, { text: factText }, { quoted: message });
            } catch (error) {
                await sock.sendMessage(chatId, { text: '❌ Error fetching fact. Try again later!' }, { quoted: message });
            }
        }
    },

    quote: {
        description: 'Get a random inspirational quote',
        usage: 'quote',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock, message } = context;

            try {
                // Primary API - ZenQuotes
                const res = await axios.get('https://zenquotes.io/api/random', { timeout: 7000 });
                const data = res.data[0];

                if (data?.q && data?.a) {
                    return await sock.sendMessage(
                        chatId,
                        { text: `💡 *Quote of the Moment*\n\n_"${data.q}"_\n\n— *${data.a}*` },
                        { quoted: message }
                    );
                }
                throw new Error('Invalid response from ZenQuotes');
            } catch (err) {
                console.warn('ZenQuotes failed, switching to Quotable:', err.message || err);

                try {
                    // Fallback API - Quotable
                    const res2 = await axios.get('https://api.quotable.io/random', { timeout: 7000 });
                    const data2 = res2.data;

                    if (data2?.content && data2?.author) {
                        return await sock.sendMessage(
                            chatId,
                            { text: `💡 *Quote of the Moment*\n\n_"${data2.content}"_\n\n— *${data2.author}*` },
                            { quoted: message }
                        );
                    } else {
                        throw new Error('Invalid response from Quotable');
                    }
                } catch (err2) {
                    console.error('Both APIs failed:', err2.message || err2);
                    await sock.sendMessage(chatId, { text: '⚠️ Could not fetch a quote right now. Please try again later.' }, { quoted: message });
                }
            }
        }
    },

    weather: {
        description: 'Get weather information',
        usage: 'weather <location>',
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot, sock, message } = context;

            if (args.length === 0) {
                await sock.sendMessage(chatId, { text: '❌ Please provide a location.\nUsage: !weather Lagos' }, { quoted: message });
                return;
            }

            try {
                const location = args.join(' ');
                const apiKey = '4902c0f2550f58298ad4146a92b65e10';
                const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${apiKey}&units=metric`);

                const weather = response.data;
                const weatherText = `🌤️ *Weather in ${weather.name}, ${weather.sys.country}*\n\n` +
                    `🌡️ Temperature: ${weather.main.temp}°C\n` +
                    `🌡️ Feels like: ${weather.main.feels_like}°C\n` +
                    `📊 Humidity: ${weather.main.humidity}%\n` +
                    `🌪️ Wind: ${weather.wind.speed} m/s\n` +
                    `☁️ Condition: ${weather.weather[0].description}\n` +
                    `👁️ Visibility: ${weather.visibility / 1000} km`;

                await sock.sendMessage(chatId, { text: weatherText }, { quoted: message });
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    await sock.sendMessage(chatId, { text: '❌ Location not found. Please check the spelling and try again.' }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, { text: '❌ Error fetching weather data. Try again later!' }, { quoted: message });
                }
            }
        }
    },
    
    define: {
        description: 'Get word definition',
        usage: 'define <word>',
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot, sock, message } = context;

            if (args.length === 0) {
                await sock.sendMessage(chatId, { text: '❌ Please provide a word to define.\nUsage: !define happiness' }, { quoted: message });
                return;
            }

            const term = args.join(' ').trim();
            const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`;

            try {
                const res = await fetch(url);

                // Handle HTTP errors explicitly
                if (!res.ok) {
                    if (res.status === 404) {
                        await sock.sendMessage(chatId, { text: `❌ No definition found for "${term}".` }, { quoted: message });
                        return;
                    }
                    await sock.sendMessage(chatId, { text: `❌ Dictionary API error (${res.status}). Try again later.` }, { quoted: message });
                    return;
                }

                const data = await res.json();
                if (!Array.isArray(data) || !data[0]) {
                    await sock.sendMessage(chatId, { text: `❌ No definition found for "${term}".` }, { quoted: message });
                    return;
                }

                const entry = data[0];

                // Build response safely
                let out = `📖 *Definition of "${term}"*\n\n`;

                const phonetic = (entry.phonetics || []).find(p => p && p.text)?.text;
                if (phonetic) out += `🔊 Pronunciation: ${phonetic}\n\n`;

                if (Array.isArray(entry.meanings) && entry.meanings.length) {
                    // show up to 2 meanings, first definition each
                    entry.meanings.slice(0, 2).forEach(m => {
                        out += `*${m.partOfSpeech || 'meaning'}*\n`;
                        const def = Array.isArray(m.definitions) ? m.definitions[0] : undefined;
                        if (def?.definition) out += `• ${def.definition}\n`;
                        if (def?.example) out += `  _Example: ${def.example}_\n`;
                        out += '\n';
                    });
                } else {
                    out += '❌ No meanings available.\n';
                }

                await sock.sendMessage(chatId, { text: out.trim() }, { quoted: message });
            } catch (err) {
                // Make sure this always logs something useful
                console.error('Define command error:', err && (err.stack || err.message || err));
                await sock.sendMessage(chatId, { text: '❌ Error fetching definition. Please try again later.' }, { quoted: message });
            }
        }
    },
    
    lyrics: {
        description: 'Get song lyrics',
        usage: 'lyrics <song name>',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock, message, args } = context;

            if (!args.length) {
                return sock.sendMessage(chatId, { text: "❌ Please provide a song title.\nExample: `lyrics despacito`" }, { quoted: message });
            }

            const query = args.join(" ");

            try {
                // Primary API (Gifted)
                const response = await axios.get(`https://api.giftedtech.web.id/api/search/lyrics?apikey=gifted&query=${encodeURIComponent(query)}`);
                const data = response.data.result;

                if (data && data.lyrics) {
                    const lyricsMsg = `🎶 *${data.title || query}* - ${data.artist || ""}\n\n${data.lyrics}`;
                    await sock.sendMessage(chatId, { text: lyricsMsg }, { quoted: message });
                    return;
                }

                throw new Error("Primary API returned no lyrics");
            } catch (error) {
                console.warn("Gifted API failed, trying fallback...", error.message);

                try {
                    // Fallback API (Dreaded)
                    const fallback = await axios.get(`https://api.dreaded.site/api/lyrics?title=${encodeURIComponent(query)}`);
                    const result = fallback.data.result;

                    if (result && result.lyrics) {
                        const lyricsMsg = `🎶 *${result.title || query}* - ${result.artist || ""}\n\n${result.lyrics}`;
                        await sock.sendMessage(chatId, { text: lyricsMsg }, { quoted: message });
                    } else {
                        await sock.sendMessage(chatId, { text: "❌ Couldn't fetch lyrics, try again later!" }, { quoted: message });
                    }
                } catch (fallbackError) {
                    console.error("Fallback lyrics API failed:", fallbackError.message);
                    await sock.sendMessage(chatId, { text: "⚠️ Both lyrics sources are down, please try again later." }, { quoted: message });
                }
            }
        }
    },

    url: {
        description: 'Upload a quoted image and get a direct link (Catbox primary, ImgBB fallback)',
        usage: 'url (reply to an image)',
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, message, sock } = context;

            try {
                // Get quoted message (or accept sending message itself if you want)
                const cited = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const quotedInfo = message.message?.extendedTextMessage?.contextInfo;

                // If not a quoted message, maybe the user sent the image directly (optional)
                const directImage = message.message?.imageMessage || message.message?.documentMessage;

                if (!cited && !directImage) {
                    return await sock.sendMessage(chatId, { text: '❌ Please reply to an image (or sticker/document image) with `url`' }, { quoted: message });
                }

                let targetMessage;
                if (cited) {
                    // include the quoted message object so downloadMediaMessage recognizes it
                    targetMessage = { message: cited };
                    // If possible, include key info so that helper can find context (not always required)
                    if (quotedInfo?.stanzaId) {
                        targetMessage.key = { id: quotedInfo.stanzaId };
                    }
                } else {
                    // no quote — use the current message (already contains the media)
                    targetMessage = message;
                }

                // Download buffer using Baileys helper
                const buffer = await downloadMediaMessage(targetMessage, 'buffer', {});
                if (!buffer || !Buffer.isBuffer(buffer)) {
                    throw new Error('Failed to download image buffer');
                }

                // ---- Upload to Catbox (primary) ----
                try {
                    const form = new FormData();
                    // catbox expects fileToUpload and optionally reqtype=fileupload
                    form.append('fileToUpload', buffer, { filename: 'upload.jpg' });
                    form.append('reqtype', 'fileupload');

                    const catboxRes = await axios.post('https://catbox.moe/user/api.php', form, {
                        headers: form.getHeaders(),
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                        timeout: 30000
                    });

                    // catbox returns the URL in plain text on success
                    if (catboxRes.data && String(catboxRes.data).startsWith('http')) {
                        return await sock.sendMessage(chatId, { text: `✅ Uploaded to Catbox:\n${catboxRes.data}` }, { quoted: message });
                    }

                    throw new Error('Catbox did not return a valid URL');
                } catch (catErr) {
                    console.warn('Catbox upload failed:', catErr.message || catErr);
                }

                // ---- Fallback to ImgBB ----
                try {
                    const imgBBKey = 'c7427b69f5258372a34457ff92d7e642';
                    const form2 = new FormData();
                    // imgbb accepts base64 image in `image`
                    form2.append('image', buffer.toString('base64'));

                    const imgbbRes = await axios.post(
                        `https://api.imgbb.com/1/upload?key=${imgBBKey}`,
                        form2,
                        { headers: form2.getHeaders(), timeout: 20000 }
                    );

                    const url = imgbbRes.data?.data?.url;
                    if (url) {
                        return await sock.sendMessage(chatId, { text: `✅ Uploaded to ImgBB:\n${url}` }, { quoted: message });
                    }

                    throw new Error('ImgBB did not return a URL');
                } catch (imgErr) {
                    console.error('ImgBB upload failed:', imgErr.message || imgErr);
                    return await sock.sendMessage(chatId, { text: '⚠️ Failed to upload image to both Catbox and ImgBB. Please try again.' }, { quoted: message });
                }

            } catch (err) {
                console.error('Image upload error:', err && (err.stack || err.message || err));
                return await sock.sendMessage(chatId, { text: '❌ Error processing the image. Make sure you replied to an image.' }, { quoted: message });
            }
        }
    },

    movie: {
        description: 'Get movie information',
        usage: 'movie <movie name>',
        aliases: ["imdb"],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot, sock, message } = context;

            if (args.length === 0) {
                await sock.sendMessage(chatId, { text: '❌ Please provide a movie name.\nUsage: !movie Avengers' }, { quoted: message });
                return;
            }

            try {
                const movieName = args.join(' ');
                const response = await axios.get(`http://www.omdbapi.com/?t=${encodeURIComponent(movieName)}&apikey=thewdb`);
                const movie = response.data;

                if (movie.Response === 'False') {
                    await sock.sendMessage(chatId, { text: '❌ Movie not found. Please check the spelling and try again.' }, { quoted: message });
                    return;
                }

                const movieText = `🎬 *${movie.Title}* (${movie.Year})\n\n` +
                    `⭐ Rating: ${movie.imdbRating}/10\n` +
                    `🎭 Genre: ${movie.Genre}\n` +
                    `🎬 Director: ${movie.Director}\n` +
                    `🎭 Cast: ${movie.Actors}\n` +
                    `⏱️ Runtime: ${movie.Runtime}\n` +
                    `🏆 Awards: ${movie.Awards}\n\n` +
                    `📝 *Plot:*\n${movie.Plot}`;

                if (movie.Poster && movie.Poster !== 'N/A') {
                    // send poster + details
                    const posterResponse = await axios.get(movie.Poster, { responseType: 'arraybuffer' });
                    const posterBuffer = Buffer.from(posterResponse.data, 'binary');

                    await sock.sendMessage(chatId, { image: posterBuffer, caption: movieText }, { quoted: message });
                } else {
                    // fallback: send text only
                    await sock.sendMessage(chatId, { text: movieText }, { quoted: message });
                }
            } catch (error) {
                await sock.sendMessage(chatId, { text: '❌ Error fetching movie information. Try again later!' }, { quoted: message });
            }
        }
    },

    anime: {
        description: 'Get anime information',
        usage: 'anime <anime name>',
        aliases: ["ani"],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot, sock, message } = context;

            if (!args.length) {
                await sock.sendMessage(chatId, { text: '❌ Please provide an anime name.\nUsage: !anime Naruto' }, { quoted: message });
                return;
            }

            try {
                const animeName = args.join(' ');

                const query = `
                    query ($search: String) {
                        Media (search: $search, type: ANIME) {
                            title { romaji english }
                            description
                            episodes
                            status
                            averageScore
                            genres
                            format
                            startDate { year }
                            endDate { year }
                            coverImage { large medium }
                            siteUrl
                        }
                    }
                `;

                const response = await axios.post('https://graphql.anilist.co', {
                    query: query,
                    variables: { search: animeName }
                });

                const anime = response.data.data.Media;

                if (!anime) {
                    await sock.sendMessage(chatId, { text: '❌ Anime not found. Check spelling and try again.' }, { quoted: message });
                    return;
                }

                const title = anime.title.english || anime.title.romaji;
                const description = anime.description ? anime.description.replace(/<[^>]*>/g, '') : 'No description available';
                const imageUrl = anime.coverImage?.large || anime.coverImage?.medium || null;

                let animeText =
                    `🎌 *${title}*\n\n` +
                    `⭐ Score: ${anime.averageScore ? anime.averageScore + '/100' : 'N/A'}\n` +
                    `📺 Episodes: ${anime.episodes || 'Unknown'}\n` +
                    `📅 Year: ${anime.startDate?.year || 'Unknown'}\n` +
                    `📺 Format: ${anime.format || 'Unknown'}\n` +
                    `📊 Status: ${anime.status || 'Unknown'}\n` +
                    `🏷️ Genres: ${anime.genres ? anime.genres.join(', ') : 'Unknown'}\n\n` +
                    `📝 *Description:*\n${description}\n\n` +
                    `🔗 [AniList Link](${anime.siteUrl})`;

                if (animeText.length > 1000) {
                    animeText = animeText.substring(0, 950) + '...';
                }

                if (imageUrl) {
                    const imageBuffer = (await axios.get(imageUrl, { responseType: 'arraybuffer' })).data;
                    await sock.sendMessage(chatId, { image: imageBuffer, caption: animeText }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, { text: animeText }, { quoted: message });
                }

            } catch (err) {
                console.error('❌ Anime command error:', err);
                await sock.sendMessage(chatId, { text: '❌ Error fetching anime information. Try again later!' }, { quoted: message });
            }
        }
    },

    tiny: {
        description: 'Shorten a link',
        usage: 'tiny <url>',
        aliases: ["tinyurl"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, sock, message, args } = context;

            if (!args[0]) {
                return await sock.sendMessage(chatId, { text: '❌ Please provide a URL to shorten.' }, { quoted: message });
            }

            const longUrl = args[0];
            let shortUrl;

            try {
                // Primary: dreaded.site
                const res = await fetch(`https://api.dreaded.site/api/shorten-url?url=${encodeURIComponent(longUrl)}`);
                const data = await res.json();

                if (data && data.result && data.result.shortened_url) {
                    shortUrl = data.result.shortened_url;
                } else {
                    throw new Error('Primary API failed');
                }

            } catch (err) {
                console.error('Primary tiny API error:', err);

                try {
                    // Fallback: giftedtech
                    const res2 = await fetch(`https://api.giftedtech.web.id/api/tools/tinyurl?apikey=gifted&url=${encodeURIComponent(longUrl)}`);
                    const data2 = await res2.json();

                    if (data2 && data2.result) {
                        shortUrl = data2.result;
                    } else {
                        throw new Error('Fallback API failed');
                    }

                } catch (err2) {
                    console.error('Fallback tiny API error:', err2);
                    return await sock.sendMessage(chatId, { text: '⚠️ Failed to shorten the link. Please try again later.' }, { quoted: message });
                }
            }

            await sock.sendMessage(chatId, { text: `🔗 *Shortened URL:*\n${shortUrl}` }, { quoted: message });
        }
    },
};

module.exports = utilityCommands;
