const express = require('express');
const app = express();

const port = process.env.PORT || 3000;

// Eredeti szolgáltató adatai
const IPTV_URL = process.env.IPTV_URL; 
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;

// Saját, védett adatok
const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

// Biztonsági ellenőrző funkció
function checkCredentials(user, pass) {
    if (!MY_USER || !MY_PASS) return false;
    return user === MY_USER && pass === MY_PASS;
}

// ==========================================
// UPTIMEROBOT PING VÉGPONT (Ez a főoldal)
// ==========================================
app.get('/', (req, res) => {
    // Ez csak egy egyszerű válasz, hogy az UptimeRobot lássa: a szerver fut!
    res.status(200).send('IPTV Proxy aktív és ébren van! 🚀');
});

// ==========================================
// 1. XTREAM CODES API ÉS MŰSORÚJSÁG (EPG) TOVÁBBÍTÁSA
// ==========================================
app.get(['/player_api.php', '/xmltv.php'], async (req, res) => {
    const { username, password } = req.query;

    if (!checkCredentials(username, password)) {
        return res.status(401).json({ error: "Hibás felhasználónév vagy jelszó!" });
    }

    try {
        const urlParams = new URLSearchParams(req.query);
        urlParams.set('username', IPTV_USER);
        urlParams.set('password', IPTV_PASS);
        
        const endpoint = req.path;
        const targetUrl = `${IPTV_URL}${endpoint}?${urlParams.toString()}`;

        const response = await fetch(targetUrl);
        const data = await response.text();

        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        res.send(data);
    } catch (error) {
        console.error('API hiba:', error);
        res.status(500).send('Hiba a szerver kommunikációjában.');
    }
});

// ==========================================
// 2. VIDEÓ STREAMEK ÁTIRÁNYÍTÁSA
// ==========================================
app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;

    const allowedTypes = ['live', 'movie', 'series'];
    if (!allowedTypes.includes(type)) {
        return res.status(404).send('Nem található');
    }

    if (!checkCredentials(user, pass)) {
        return res.status(401).send('Hozzáférés megtagadva a videóhoz!');
    }

    const redirectUrl = `${IPTV_URL}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`;
    res.redirect(302, redirectUrl);
});

// Szerver indítása
app.listen(port, () => {
    console.log(`IPTV Xtream Proxy elindult a ${port}-es porton.`);
});
