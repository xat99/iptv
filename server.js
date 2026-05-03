const express = require('express');
const axios = require('axios'); // Jobb kezelés, mint a sima fetch
const app = express();

const port = process.env.PORT || 3000;

// Környezeti változók (Ügyelj rá, hogy a Render-en be legyenek állítva!)
const IPTV_URL = process.env.IPTV_URL; 
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;

const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

// Segédfüggvény a hitelesítéshez
function checkCredentials(user, pass) {
    if (!MY_USER || !MY_PASS) return false;
    return user === MY_USER && pass === MY_PASS;
}

app.get('/', (req, res) => {
    res.status(200).send('IPTV Proxy: Online és Stabil 🚀');
});

// API Kérések kezelése (Csatornalista, EPG, Login)
app.get(['/player_api.php', '/xmltv.php'], async (req, res) => {
    const { username, password, action } = req.query;

    if (!checkCredentials(username, password)) {
        return res.status(401).json({ error: "Hibás hitelesítés!" });
    }

    try {
        const urlParams = new URLSearchParams(req.query);
        urlParams.set('username', IPTV_USER);
        urlParams.set('password', IPTV_PASS);
        
        const endpoint = req.path;
        const targetUrl = `${IPTV_URL}${endpoint}?${urlParams.toString()}`;

        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
        });

        let data = response.data;

        // SERVER INFO ÁTÍRÁSA (Hogy az app a te proxy-dat hívja vissza)
        if (typeof data === 'object' && data.server_info) {
            const host = req.get('host');
            const protocol = req.protocol; // http vagy https

            data.server_info.url = host;
            data.server_info.port = protocol === 'https' ? '443' : '80';
            data.server_info.https_port = '443';
            data.server_info.server_protocol = protocol;
            
            // Néhány szolgáltató küld timestamp-et, ezt is érdemes frissíteni
            data.server_info.timestamp = Math.floor(Date.now() / 1000);
        }

        // Cache tiltása, hogy ne ragadjon be régi adat
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.send(data);

    } catch (error) {
        console.error('API hiba:', error.message);
        res.status(500).send('Szerver hiba a lekéréskor.');
    }
});

// STREAM ÁTIRÁNYÍTÁS (Élő adás, Filmek, Sorozatok)
app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;

    if (!checkCredentials(user, pass)) {
        return res.status(403).send('Hozzáférés megtagadva!');
    }

    const allowedTypes = ['live', 'movie', 'series'];
    if (!allowedTypes.includes(type)) {
        return res.status(404).send('Érvénytelen típus');
    }

    // Fontos: Itt a tényleges IPTV szolgáltatód URL-jét állítjuk össze
    const finalStreamUrl = `${IPTV_URL}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`;

    // 302-es átirányítás helyett néhány eszköz a 301-et vagy a direkt proxy-t szereti, 
    // de a 302 a legelterjedtebb. Ha nem megy, ezt kell cserélni.
    res.redirect(302, finalStreamUrl);
});

app.listen(port, () => {
    console.log(`Szerver fut: http://localhost:${port}`);
});
