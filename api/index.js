const express = require('express');
const app = express();

const IPTV_URL = process.env.IPTV_URL ? process.env.IPTV_URL.replace(/\/+$/, "") : ""; 
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;
const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

function checkCredentials(user, pass) {
    if (!MY_USER || !MY_PASS) return false;
    return user === MY_USER && pass === MY_PASS;
}

app.get('/', (req, res) => {
    res.status(200).send('IPTV Proxy: Vercel aktív! 🚀');
});

// ÚJ: Hozzáadtuk a /get.php-t a listához!
app.get(['/player_api.php', '/xmltv.php', '/get.php'], async (req, res) => {
    const { username, password } = req.query;

    if (!checkCredentials(username, password)) {
        return res.status(401).json({ error: "Hibás hitelesítés! Ellenőrizd a TV-n a nevet/jelszót!" });
    }

    try {
        const urlParams = new URLSearchParams(req.query);
        urlParams.set('username', IPTV_USER);
        urlParams.set('password', IPTV_PASS);
        
        const targetUrl = `${IPTV_URL}${req.path}?${urlParams.toString()}`;

        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        // Ha a szolgáltató átirányít (pl stream letöltésnél a get.php-n)
        if (response.redirected) {
             return res.redirect(302, response.url);
        }

        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            let data = await response.json();
            
            const host = req.headers.host;
            const protocol = 'https';

            if (data && data.server_info) {
                data.server_info.url = host;
                data.server_info.port = "443";
                data.server_info.https_port = "443";
                data.server_info.server_protocol = "https";
                data.server_info.xmltv_api = `${protocol}://${host}/xmltv.php`;
            }

            if (data && data.user_info) {
                data.user_info.username = MY_USER;
                data.user_info.password = MY_PASS;
            }

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.send(JSON.stringify(data));
        } else {
            const textData = await response.text();
            res.setHeader('Content-Type', contentType || 'text/plain');
            return res.send(textData);
        }
    } catch (error) {
        res.status(500).send('Szerver hiba');
    }
});

app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;
    if (!checkCredentials(user, pass)) return res.status(403).send('Tiltott!');
    
    res.redirect(302, `${IPTV_URL}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`);
});

module.exports = app;
