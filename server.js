const express = require('express');
const { Readable } = require('stream');
const app = express();

const port = process.env.PORT || 3000;

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
    res.status(200).send('Proxy üzemkész a Vercelen! 🚀');
});

// A /get.php is itt van a csatornalistához!
app.get(['/player_api.php', '/xmltv.php', '/epg.php', '/get.php'], async (req, res) => {
    const { username, password, action } = req.query;

    console.log(`Kérés érkezett: ${req.path} (${username})`);

    if (!checkCredentials(username, password)) {
        return res.status(401).json({ error: "Hibás proxy hitelesítés!" });
    }

    try {
        const urlParams = new URLSearchParams(req.query);
        urlParams.set('username', IPTV_USER);
        urlParams.set('password', IPTV_PASS);
        
        const targetUrl = `${IPTV_URL}${req.path}?${urlParams.toString()}`;
        
        // JAVÍTÁS: Álcázzuk a Vercelt, hogy átmenjen a Cloudflare védelmen!
        const fetchHeaders = { 
            'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive',
            'Referer': IPTV_URL
        };
        
        const response = await fetch(targetUrl, { headers: fetchHeaders });
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            let rawText = await response.text();
            try {
                let data = JSON.parse(rawText);
                
                // Now/Next hiba javítása
                if (!action && req.path.includes('player_api.php')) {
                    if (data && data.server_info) {
                        const host = req.get('host').split(':')[0];
                        data.server_info.url = host;
                        data.server_info.port = "443";
                        data.server_info.https_port = "443";
                        data.server_info.server_protocol = "https";
                    }
                    if (data && data.user_info) {
                        data.user_info.username = MY_USER;
                        data.user_info.password = MY_PASS;
                    }
                }
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                return res.send(JSON.stringify(data));
            } catch (err) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(rawText);
            }
        } else {
            console.log(`Fájl streamelése: ${req.path}`);
            res.setHeader('Content-Type', contentType || 'application/xml');
            
            const disposition = response.headers.get('content-disposition');
            if (disposition) res.setHeader('Content-Disposition', disposition);

            const contentLength = response.headers.get('content-length');
            if (contentLength) res.setHeader('Content-Length', contentLength);

            if (response.body) {
                const handleStreamEvents = (stream) => {
                    stream.pipe(res);
                    stream.on('error', () => res.end());
                };
                try {
                    handleStreamEvents(Readable.fromWeb(response.body));
                } catch (err) {
                    handleStreamEvents(response.body);
                }
            } else {
                res.status(204).send();
            }
        }
    } catch (error) {
        if (!res.headersSent) res.status(500).send('Belső hiba.');
    }
});

app.get('/:type/:user/:pass/:filename', (req, res) => {
    const { type, user, pass, filename } = req.params;
    if (!checkCredentials(user, pass)) return res.status(403).send('Tiltott!');
    res.redirect(302, `${IPTV_URL}/${type}/${IPTV_USER}/${IPTV_PASS}/${filename}`);
});

app.listen(port, () => {
    console.log(`Szerver fut a ${port} porton!`);
});
