const express = require('express');
const { Readable } = require('stream');
const app = express();

// URL tisztítás
let IPTV_URL = process.env.IPTV_URL ? process.env.IPTV_URL.replace(/\/+$/, "") : ""; 
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;

const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

function checkCredentials(user, pass) {
    if (!MY_USER || !MY_PASS) return false;
    return user === MY_USER && pass === MY_PASS;
}

app.get('/', (req, res) => {
    res.status(200).send('Proxy üzemkész Vercel-en! 🚀');
});

// JAVÍTÁS 1: Bekerült a /get.php mellé az /m3u.php is!
app.get(['/player_api.php', '/xmltv.php', '/epg.php', '/get.php', '/m3u.php'], async (req, res) => {
    // JAVÍTÁS 2: Az 'action' beolvasása a Now/Next (Éppen megy) hiba javításához
    const { username, password, action } = req.query;

    console.log(`Kérés érkezett: ${req.path} (${username})`);

    // HITELÉSÍTÉS ELLENŐRZÉSE
    if (!checkCredentials(username, password)) {
        console.log(`Hiba: '${username}' névvel próbáltak belépni.`);
        return res.status(401).json({ error: "Hibás proxy hitelesítés!" });
    }

    try {
        const urlParams = new URLSearchParams(req.query);
        urlParams.set('username', IPTV_USER);
        urlParams.set('password', IPTV_PASS);
        
        const targetUrl = `${IPTV_URL}${req.path}?${urlParams.toString()}`;
        
        // Álcázás, hogy ne blokkoljon a szolgáltató
        const fetchHeaders = { 
            'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive',
            'Referer': IPTV_URL
        };
        
        const response = await fetch(targetUrl, { headers: fetchHeaders });
        
        // Ha a szolgáltató átirányít minket, mi is átirányítjuk a lejátszót
        if (response.redirected) {
             return res.redirect(302, response.url);
        }

        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            // Szövegként olvassuk be, hogy a Cloudflare hiba ne olvassza le a szervert
            let rawText = await response.text();
            
            try {
                let data = JSON.parse(rawText);
                
                // CSAK akkor írjuk át az adatokat, ha nincs 'action' (Now/Next javítás)
                if (!action && req.path.includes('player_api.php')) {
                    // SERVER INFO ÁTÍRÁSA
                    if (data && data.server_info) {
                        const host = req.headers.host.split(':')[0]; // Vercel kompatibilis Host lekérés
                        const protocol = 'https'; // Vercel mindig https

                        data.server_info.url = host;
                        data.server_info.port = "443";
                        data.server_info.https_port = "443";
                        data.server_info.server_protocol = protocol;
                        
                        // Műsorújság visszairányítása hozzánk
                        data.server_info.xmltv_api = `${protocol}://${host}/xmltv.php`;
                    }

                    // USER INFO ÁTÍRÁSA
                    if (data && data.user_info) {
                        data.user_info.username = MY_USER;
                        data.user_info.password = MY_PASS;
                    }
                }

                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                return res.send(JSON.stringify(data));
                
            } catch (err) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(rawText);
            }
            
        } else {
            // EPG és M3U STREAMELÉS
            console.log(`Fájl/EPG letöltése megkezdődött...`);
            
            res.setHeader('Content-Type', contentType || 'application/xml');
            
            const disposition = response.headers.get('content-disposition');
            if (disposition) res.setHeader('Content-Disposition', disposition);

            const contentLength = response.headers.get('content-length');
            if (contentLength) res.setHeader('Content-Length', contentLength);

            if (response.body) {
                const handleStreamEvents = (stream) => {
                    stream.pipe(res);
                    stream.on('end', () => console.log(`Letöltés SIKERESEN befejeződött.`));
                    stream.on('error', (err) => {
                        console.error('Hiba a streamelés alatt:', err.message);
                        if (!res.headersSent) {
                            res.status(500).end();
                        } else {
                            res.end(); 
                        }
                    });
                };

                try {
                    handleStreamEvents(Readable.fromWeb(response.body));
                } catch (err) {
                    handleStreamEvents(response.body);
                }
            } else {
                res.status(204).send(); 
            }
        }

    } catch (error) {
        console.error('Szerver hiba kéréskor:', error.message);
        if (!res.headersSent) {
            res.status(500).send('Belső hiba.');
        }
    }
});

app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;

    if (!checkCredentials(user, pass)) {
        return res.status(403).send('Tiltott stream elérés!');
    }

    const finalStreamUrl = `${IPTV_URL}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`;
    res.redirect(302, finalStreamUrl);
});

// ==========================================
// VERCEL VARÁZSLAT: app.listen helyett exportáljuk
// ==========================================
module.exports = app;
