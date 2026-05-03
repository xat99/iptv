const express = require('express');
const app = express();

// Middleware-ek a POST kérések (Smarters Pro) hibátlan fogadásához
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;

// Környezeti változók a Render.com-ról
const IPTV_URL = process.env.IPTV_URL; 
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;

const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

// Biztonsági perjel-eltávolító (hogy sose legyen dupla perjel a linkben)
const cleanIptvUrl = IPTV_URL ? IPTV_URL.replace(/\/+$/, '') : '';

// Hitelesítés
function checkCredentials(user, pass) {
    if (!MY_USER || !MY_PASS) return false;
    return user === MY_USER && pass === MY_PASS;
}

// UptimeRobot ping végpont
app.get('/', (req, res) => res.send('IPTV Proxy aktív és ébren van! 🚀'));

// Xtream Codes API kezelése (GET és POST is)
app.all(['/player_api.php', '/xmltv.php', '/panel_api.php'], async (req, res) => {
    const username = req.query.username || req.body.username || req.query.user;
    const password = req.query.password || req.body.password || req.query.pass;
    const action = req.query.action || req.body.action; 

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

        // Szigorú memória (cache) tiltás
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');

        let data = await response.text();

        // Csak bejelentkezéskor nyúlunk bele az adatokba, hogy gyors maradjon a szerver
        if (!action || action === 'user' || action === 'user_info') {
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
        }
        
        // Kész adatok elküldése a tévének/telefonnak
        return res.send(data);

    } catch (error) {
        console.error('API hiba:', error);
        res.status(500).send('API Error');
    }
});

// Videó streamek átirányítása
app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;

    const allowedTypes = ['live', 'movie', 'series'];
    if (!allowedTypes.includes(type)) {
        return res.status(404).send('Not found');
    }

    if (!checkCredentials(user, pass)) {
        return res.status(401).send('Denied');
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.redirect(302, `${cleanIptvUrl}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`);
});

app.listen(port, () => {
    console.log(`IPTV Proxy elindult a ${port}-es porton.`);
});
