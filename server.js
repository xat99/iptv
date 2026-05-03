const express = require('express');
const app = express();

const port = process.env.PORT || 3000;

const IPTV_URL = process.env.IPTV_URL; 
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;

const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

function checkCredentials(user, pass) {
    if (!MY_USER || !MY_PASS) return false;
    return user === MY_USER && pass === MY_PASS;
}

app.get('/', (req, res) => {
    res.status(200).send('IPTV Proxy Aktív 🚀');
});

app.get(['/player_api.php', '/xmltv.php'], async (req, res) => {
    const { username, password } = req.query;

    if (!checkCredentials(username, password)) {
        return res.status(401).json({ error: "Hibás adatok!" });
    }

    try {
        const urlParams = new URLSearchParams(req.query);
        urlParams.set('username', IPTV_USER);
        urlParams.set('password', IPTV_PASS);
        
        const endpoint = req.path;
        const targetUrl = `${IPTV_URL}${endpoint}?${urlParams.toString()}`;

        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            let jsonData = await response.json();
            
            // SERVER INFO ÁTÍRÁSA a Smarters Pro miatt
            if (jsonData && jsonData.server_info) {
                const host = req.get('host');
                jsonData.server_info.url = host;
                jsonData.server_info.port = "443";
                jsonData.server_info.https_port = "443";
                jsonData.server_info.server_protocol = "https";
            }
            res.setHeader('Content-Type', 'application/json');
            return res.send(JSON.stringify(jsonData));
        } else {
            // Ha nem JSON (pl. XML műsorújság), akkor csak továbbadjuk a szöveget
            const textData = await response.text();
            res.setHeader('Content-Type', contentType || 'text/plain');
            return res.send(textData);
        }

    } catch (error) {
        console.error('API hiba:', error);
        res.status(500).send('Szerver hiba');
    }
});

app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;

    if (!checkCredentials(user, pass)) {
        return res.status(403).send('Tiltott!');
    }

    const redirectUrl = `${IPTV_URL}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`;
    res.redirect(302, redirectUrl);
});

app.listen(port, () => {
    console.log(`Szerver fut a ${port} porton.`);
});
