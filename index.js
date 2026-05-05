const { default: makeWASocket, useMultiFileAuthState, Browsers, delay } = require("@whiskeysockets/baileys");
const { createClient } = require('@supabase/supabase-js');
const express = require("express");
const pino = require("pino");

// 1. YAHAN APNI SUPABASE DETAILS DALEIN
const supabase = createClient(
    'https://yrqrymnjadgmubutzixj.supabase.co', 
    'sb_publishable_gpYIdcI_v7r_sTB3sJxIOQ_h2r6J-g6'
);

const app = express();
let sock;
let isConnected = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        // Pairing code ke liye Chrome browser hona zaroori hai
        browser: Browsers.ubuntu("Chrome")
    });

    sock.ev.on('creds.update', saveCreds);

    // MESSAGE RECEIVE LOGIC
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid.replace(/[^0-9]/g, '');
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text && text.startsWith("VERIFY-")) {
            const code = text.split("-")[1];
            const { error } = await supabase
                .from('verified_users')
                .update({ is_verified: true })
                .eq('phone_number', sender)
                .eq('code', code);

            if (!error) {
                await sock.sendMessage(msg.key.remoteJid, { text: "✅ Verification Successful! Website par wapas jayein." });
            }
        }
    });

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') {
            isConnected = true;
            console.log("✅ WhatsApp Connected Successfully!");
        }
        if (u.connection === 'close') {
            isConnected = false;
            startBot(); // Reconnect if closed
        }
    });
}

// ---------------------------------------------------------
// NEW: PAIRING CODE (OTP) ENDPOINT
// Is link ko kholne par aapko WhatsApp link karne ka code milega
// Example: /pair?number=919693521763
// ---------------------------------------------------------
app.get("/pair", async (req, res) => {
    let num = req.query.number;
    if (!num) return res.send("Number missing! ?number=91XXXXXXXXXX");
    
    num = num.replace(/[^0-9]/g, '');
    
    try {
        if (isConnected) return res.send("Bot pehle se connected hai!");
        
        await delay(3000); // Wait for socket to be ready
        const code = await sock.requestPairingCode(num);
        
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1>Aapka WhatsApp OTP (Pairing Code):</h1>
                <div style="background:#25D366; color:white; display:inline-block; padding:20px; font-size:40px; border-radius:10px; font-weight:bold;">
                    ${code}
                </div>
                <p>1. WhatsApp > Settings > Linked Devices > Link a Device.</p>
                <p>2. Choose <b>'Link with phone number instead'</b>.</p>
                <p>3. Ye 8-digit code wahan dalein.</p>
            </div>
        `);
    } catch (err) {
        res.send("Error: " + err.message);
    }
});

// Website logic: Link generate karna
app.get("/get-link", async (req, res) => {
    const num = req.query.number;
    const code = Math.floor(100000 + Math.random() * 900000);
    await supabase.from('verified_users').upsert({ phone_number: num, code: code.toString(), is_verified: false });
    
    // BOT_NUMBER ki jagah wo number dalein jise aap link kar rahe hain
    const link = `https://wa.me/919693521763?text=VERIFY-${code}`;
    res.json({ link });
});

app.get("/status", async (req, res) => {
    const { data } = await supabase.from('verified_users').select('is_verified').eq('phone_number', req.query.number).single();
    res.json({ verified: data?.is_verified || false });
});

app.listen(process.env.PORT || 8080, () => startBot());