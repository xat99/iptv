const express = require('express');
const app = express();

const IPTV_URL = process.env.IPTV_URL?.replace(/\/+$/, "") || "";
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;
const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

function checkCredentials(user, pass) {
    return user && pass && user === MY_USER && pass === MY_PASS;
}

app.get('/', (req, res) => {
    res.send('IPTV Proxy fut Vercel-en ✅');
});

app.get(['/', '/player_api.php', '/xmltv.php', '/get.php'], async (req, res) => {
    const { username, password } = req.query;

    if (!checkCredentials(username, password)) {
        return res.status(401).json({ error: "Hibás hitelesítés" });
    }

    try {
        const params = new URLSearchParams(req.query);
        params.set('username', IPTV_USER);
        params.set('password', IPTV_PASS);

        const target = `${IPTV_URL}${req.path}?${params.toString()}`;
        const response = await fetch(target);
        const text = await response.text();

        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        res.send(text);
    } catch (err) {
        res.status(500).send('Hiba történt');
    }
});

app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;
    if (!checkCredentials(user, pass)) return res.status(403).send('Tiltott');
    res.redirect(`${IPTV_URL}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`);
});

module.exports = app;
