const express = require('express');
const { Readable } = require('stream'); // ÚJ: Stream modul importálása a nagy fájlokhoz
const app = express();

const port = process.env.PORT || 3000;

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
    res.status(200).send('Proxy üzemkész! 🚀');
});

// ÚJ: Az '/epg.php'-t is hozzáadtam, mert sok alkalmazás ezen keresi a műsorújságot
app.get(['/player_api.php', '/xmltv.php', '/epg.php'], async (req, res) => {
    const { username, password } = req.query;

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
        
        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            let data = await response.json();
            
            // SERVER INFO ÁTÍRÁSA
            if (data && data.server_info) {
                // ÚJ: A port levágása a host-ról (ha benne lenne), mert azt az API külön kezeli
                const host = req.get('host').split(':')[0];
                data.server_info.url = host;
                data.server_info.port = "443";
                data.server_info.https_port = "443";
                data.server_info.server_protocol = "https";
            }

            // USER INFO ÁTÍRÁSA
            if (data && data.user_info) {
                data.user_info.username = MY_USER;
                data.user_info.password = MY_PASS;
            }

            console.log(`JSON válasz elküldve (${username})`);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.send(JSON.stringify(data));
            
        } else {
            // ÚJ: Nagy fájlok (XMLTV) streamelése a memóriába töltés helyett!
            console.log(`EPG fájl streamelése...`);
            res.setHeader('Content-Type', contentType || 'text/plain');
            
            if (response.body) {
                try {
                    // Node.js 18+ (beépített fetch / Web Streams API)
                    Readable.fromWeb(response.body).pipe(res);
                } catch (err) {
                    // Régebbi Node.js verzió vagy külső node-fetch csomag esetén
                    response.body.pipe(res);
                }
            } else {
                res.send('');
            }
        }

    } catch (error) {
        console.error('Szerver hiba:', error.message);
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

app.listen(port, () => {
    console.log(`Szerver fut! Port: ${port}`);
});
