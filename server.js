const express = require('express');
const { Readable } = require('stream');
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

app.get(['/player_api.php', '/xmltv.php', '/epg.php'], async (req, res) => {
    // JAVÍTÁS: Beolvassuk az 'action' paramétert is, ez mutatja, ha csak műsorinfót kér az app
    const { username, password, action } = req.query;

    console.log(`Kérés érkezett: ${req.path} (${username}) | Akció: ${action || 'Fő bejelentkezés'}`);

    // HITELÉSÍTÉS ELLENŐRZÉSE
    if (!checkCredentials(username, password)) {
        console.log(`Hiba: '${username}' névvel próbáltak belépni.`);
        return res.status(401).json({ error: "Hibás proxy hitelesítés!" });
    }

    try {
        const urlParams = new URLSearchParams(req.query);
        urlParams.set('username', IPTV_USER);
        urlParams.set('password', IPTV_PASS);
        
        const targetUrl = `${IPTV_URL}${req.path}?${urlParams.toString()}`;
        
        // A lejátszó EREDETI User-Agent-jét küldjük tovább
        const fetchHeaders = { 
            'User-Agent': req.headers['user-agent'] || 'VLC/3.0.0' 
        };
        
        const response = await fetch(targetUrl, { headers: fetchHeaders });
        const contentType = response.headers.get('content-type') || '';
        
        // JAVÍTÁS LÉNYEGE: Itt a varázslat. CSAK akkor írjuk át a szerver adatokat, 
        // ha NINCS 'action' paraméter (vagyis ez a legelső belépés).
        // Ha van action (pl. 'get_short_epg', amit a csatornaváltásnál kér a tv), azt érintetlenül hagyjuk!
        if (req.path.includes('player_api.php') && !action && contentType.includes('application/json')) {
            let data = await response.json();
            
            // SERVER INFO ÁTÍRÁSA
            if (data && data.server_info) {
                const host = req.get('host').split(':')[0];
                data.server_info.url = host;
                data.server_info.port = "443";
                data.server_info.https_port = "443";
                data.server_info.server_protocol = "https";
            }

            // USER INFO ÁTÍRÁSA
            if (data && data.user_info) {
                data.user_info.username = MY_USER;
                data.user_info.password = MY_PASS;
            }

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.send(JSON.stringify(data));
            
        } else {
            // MINDEN MÁS ADAT STREAMELÉSE (teljes EPG, Now/Next info, Csatornalista)
            res.setHeader('Content-Type', contentType || 'application/xml');
            
            // Ha a szolgáltató küld fájlnevet, továbbítjuk
            const disposition = response.headers.get('content-disposition');
            if (disposition) res.setHeader('Content-Disposition', disposition);

            // A pontos fájlméret átadása
            const contentLength = response.headers.get('content-length');
            if (contentLength) res.setHeader('Content-Length', contentLength);

            if (response.body) {
                // Biztonságos streamelés eseménykezelőkkel
                const handleStreamEvents = (stream) => {
                    stream.pipe(res);
                    stream.on('end', () => {
                        if (req.path.includes('xmltv') || req.path.includes('epg')) {
                            console.log(`EPG letöltés SIKERESEN befejeződött.`);
                        }
                    });
                    stream.on('error', (err) => {
                        console.error('Hiba a streamelés alatt:', err.message);
                        res.end();
                    });
                };

                try {
                    handleStreamEvents(Readable.fromWeb(response.body));
                } catch (err) {
                    handleStreamEvents(response.body);
                }
            } else {
                res.status(204).send(); // Üres adat esetén azonnal lezárjuk
            }
        }

    } catch (error) {
        console.error('Szerver hiba kéréskor:', error.message);
        if (!res.headersSent) {
            res.status(500).send('Belső hiba.');
        }
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
