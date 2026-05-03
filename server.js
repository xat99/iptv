const express = require('express');
const app = express();

const port = process.env.PORT || 3000;

// Beállítások a Render környezeti változóiból
const IPTV_URL = process.env.IPTV_URL; 
const IPTV_USER = process.env.IPTV_USER;
const IPTV_PASS = process.env.IPTV_PASS;

const MY_USER = process.env.MY_USER;
const MY_PASS = process.env.MY_PASS;

// Hitelesítés ellenőrzése
function checkCredentials(user, pass) {
    if (!MY_USER || !MY_PASS) return false;
    return user === MY_USER && pass === MY_PASS;
}

app.get('/', (req, res) => {
    res.status(200).send('IPTV Proxy: Online és minden eszközre felkészítve! 🚀');
});

// Xtream API és EPG kezelő
app.get(['/player_api.php', '/xmltv.php'], async (req, res) => {
    const { username, password } = req.query;

    // Ha nincs megadva felhasználónév/jelszó a kérésben (pl. Smart TV bejelentkezés)
    if (!username || !password || !checkCredentials(username, password)) {
        return res.status(401).json({ error: "Hibás hitelesítés!" });
    }

    try {
        // Paraméterek előkészítése a valódi szolgáltató felé
        const urlParams = new URLSearchParams(req.query);
        urlParams.set('username', IPTV_USER);
        urlParams.set('password', IPTV_PASS);
        
        const endpoint = req.path;
        const targetUrl = `${IPTV_URL}${endpoint}?${urlParams.toString()}`;

        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'IPTVSmarters' } // Álcázás
        });

        const contentType = response.headers.get('content-type');
        
        // Ha JSON adatot kapunk (Bejelentkezés vagy csatornalista)
        if (contentType && contentType.includes('application/json')) {
            let data = await response.json();
            
            // SERVER INFO ÁTÍRÁSA - Ez a kulcs a stabilitáshoz minden appnál
            if (data && data.server_info) {
                const host = req.get('host'); // pl. xy.onrender.com
                const isHttps = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';

                data.server_info.url = host;
                data.server_info.port = isHttps ? "443" : "80";
                data.server_info.https_port = "443";
                data.server_info.server_protocol = isHttps ? "https" : "http";
                data.server_info.timestamp = Math.floor(Date.now() / 1000);
            }
            
            // Néhány app (pl. Tivimate) igényli a pontos fejlécet
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.send(JSON.stringify(data));
        } else {
            // XML vagy egyéb adat (EPG műsorújság)
            const textData = await response.text();
            res.setHeader('Content-Type', contentType || 'text/xml');
            return res.send(textData);
        }

    } catch (error) {
        console.error('API hiba:', error.message);
        res.status(500).json({ message: "Szerver kommunikációs hiba" });
    }
});

// Videó stream átirányítás (Live, Movie, Series)
app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;

    if (!checkCredentials(user, pass)) {
        return res.status(403).send('Hozzáférés megtagadva!');
    }

    // Átirányítás a valódi streamre
    // A 302 redirect a legstabilabb telefonon és modern TV-ken
    const finalStreamUrl = `${IPTV_URL}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`;
    
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.redirect(302, finalStreamUrl);
});

app.listen(port, () => {
    console.log(`Proxy szerver elindult.`);
});
