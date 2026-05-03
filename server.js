const express = require('express');
const app = express();

const port = process.env.PORT || 3000;

// Környezeti változók beolvasása
const IPTV_URL = process.env.IPTV_URL; 
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;

const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

// Biztonsági ellenőrzés
function checkCredentials(user, pass) {
    if (!MY_USER || !MY_PASS) return false;
    return user === MY_USER && pass === MY_PASS;
}

// UptimeRobot ping végpont
app.get('/', (req, res) => {
    res.status(200).send('IPTV Proxy aktív és ébren van! 🚀');
});

// Xtream Codes API és EPG lekérések kezelése
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

        // ÚJ: Továbbítjuk a Firestick/Smarters "személyazonosságát" (User-Agent)
        const fetchOptions = {
            headers: {
                'User-Agent': req.get('User-Agent') || 'IPTV Smarters Pro'
            }
        };

        const response = await fetch(targetUrl, fetchOptions);
        let data = await response.text();

        // TRÜKK: Az applikáció átverése a szerver linkjével
        try {
            let jsonData = JSON.parse(data);
            
            if (jsonData && jsonData.server_info) {
                const host = req.get('host'); // pl. te-szervered.onrender.com
                jsonData.server_info.url = host;
                jsonData.server_info.port = '443';
                jsonData.server_info.https_port = '443';
                jsonData.server_info.server_protocol = 'https';
                
                data = JSON.stringify(jsonData);
            }
        } catch (e) {
            // Ha nem JSON (pl. Műsorújság XML), akkor hagyjuk ahogy van
        }

        // Tévé memóriájának (cache) szigorú tiltása
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        res.send(data);
    } catch (error) {
        console.error('API hiba:', error);
        res.status(500).send('Hiba a szerver kommunikációjában.');
    }
});

// Videó streamek átirányítása
app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;

    const allowedTypes = ['live', 'movie', 'series'];
    if (!allowedTypes.includes(type)) {
        return res.status(404).send('Nem található');
    }

    if (!checkCredentials(user, pass)) {
        return res.status(401).send('Hozzáférés megtagadva a videóhoz!');
    }

    // Itt is tiltjuk a cache-t
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const redirectUrl = `${IPTV_URL}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`;
    res.redirect(302, redirectUrl);
});

// Szerver indítása
app.listen(port, () => {
    console.log(`IPTV Xtream Proxy elindult a ${port}-es porton.`);
});
