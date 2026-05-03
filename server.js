const express = require('express');
const app = express();

// Middleware-ek a POST kérések fogadásához
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;

const IPTV_URL = process.env.IPTV_URL; 
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;

const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

const cleanIptvUrl = IPTV_URL ? IPTV_URL.replace(/\/+$/, '') : '';

function checkCredentials(user, pass) {
    if (!MY_USER || !MY_PASS) return false;
    return user === MY_USER && pass === MY_PASS;
}

// UptimeRobot főoldal
app.get('/', (req, res) => res.send('IPTV Proxy 🚀'));

// Xtream Codes API kezelése
app.all(['/player_api.php', '/xmltv.php'], async (req, res) => {
    // Adatok bekérése Query-ből (GET) vagy Body-ból (POST)
    const username = req.query.username || req.body.username || req.query.user;
    const password = req.query.password || req.body.password || req.query.pass;
    const action = req.query.action || req.body.action; // Megnézzük mit kér az app

    if (!checkCredentials(username, password)) {
        return res.status(401).json({ error: "Auth failed" });
    }

    try {
        const urlParams = new URLSearchParams(req.query);
        urlParams.set('username', IPTV_USER);
        urlParams.set('password', IPTV_PASS);
        const targetUrl = `${cleanIptvUrl}${req.path}?${urlParams.toString()}`;

        const fetchOptions = {
            method: 'GET',
            headers: { 'User-Agent': 'IPTV Smarters Pro' }
        };

        const response = await fetch(targetUrl, fetchOptions);

        // SZIGORÚ CACHE TILTÁS
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');

        // ==========================================
        // SZUPERGYORS OPTIMALIZÁLÁS
        // ==========================================
        // Csak bejelentkezéskor nyúlunk bele a JSON-be
        if (!action || action === 'user' || action === 'user_info') {
            let data = await response.text();
            try {
                let jsonData = JSON.parse(data);
                if (jsonData && jsonData.server_info) {
                    const host = req.get('host');
                    jsonData.server_info.url = host;
                    jsonData.server_info.port = '443';
                    jsonData.server_info.server_protocol = 'https';
                    data = JSON.stringify(jsonData);
                }
            } catch (e) {}
            return res.send(data);
        } else {
            // Ha CSATORNALISTÁT kér, nem számolunk, csak közvetlenül átirányítjuk a streamet
            // Ez megakadályozza az időtúllépést az ingyenes szerveren
            return response.body.pipe(res);
        }

    } catch (error) {
        res.status(500).send('API Error');
    }
});

// Videó streamek átirányítása
app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;
    if (!checkCredentials(user, pass)) return res.status(401).send('Denied');

    res.redirect(302, `${cleanIptvUrl}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`);
});

app.listen(port);
