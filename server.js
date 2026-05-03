const express = require('express');
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

app.get(['/player_api.php', '/xmltv.php'], async (req, res) => {
    const { username, password } = req.query;

    console.log(`Bejelentkezési kísérlet: ${username}`);

    // HITELÉSÍTÉS ELLENŐRZÉSE
    if (!checkCredentials(username, password)) {
        console.log(`Hiba: '${username}' névvel próbáltak belépni, de a Proxy-hoz '${MY_USER}' kell.`);
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
                const host = req.get('host');
                data.server_info.url = host;
                data.server_info.port = "443";
                data.server_info.https_port = "443";
                data.server_info.server_protocol = "https";
            }

            // USER INFO ÁTÍRÁSA (Ez volt a hiba!)
            // Kicseréljük az igazi adatokat a te proxy adataidra
            if (data && data.user_info) {
                data.user_info.username = MY_USER;
                data.user_info.password = MY_PASS;
            }

            console.log(`Sikeres válasz küldése a kliensnek (${username})`);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.send(JSON.stringify(data));
        } else {
            const textData = await response.text();
            res.setHeader('Content-Type', contentType || 'text/plain');
            return res.send(textData);
        }

    } catch (error) {
        console.error('Szerver hiba:', error.message);
        res.status(500).send('Belső hiba.');
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
