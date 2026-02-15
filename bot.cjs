require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin
let db;
try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            console.log('✅ Loaded Firebase config from JSON Environment Variable');

            // FIX: Handle various newline escape issues common in cloud envs
            if (serviceAccount.private_key) {
                const oldKeyLen = serviceAccount.private_key.length;
                serviceAccount.private_key = serviceAccount.private_key
                    .replace(/\\n/g, '\n')  // Replace literal \n with actual newline
                    .replace(/"/g, '')      // Remove any extra quotes if accidentally included

                // Ensure correct header/footer if they got messed up
                if (!serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
                    console.error('❌ CRITICAL: Private Key missing header!');
                }
            }
            console.log(`ℹ️ Service Account ID: ${serviceAccount.client_email}`);
        } catch (e) {
            console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e);
        }
    } else {
        console.log('ℹ️ Loading Firebase config from local file path...');
        serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log('Firebase Admin initialized');
} catch (error) {
    console.error('Failed to initialize Firebase Admin:', error.message);
    process.exit(1);
}

// Config
const ADMIN_ID = process.env.ADMIN_ID;
const PAYMENT_DETAILS = `
✨ <b>How to Complete Your Purchase:</b>

💳 <b>Available Methods:</b>
<i>(Tap any number below to copy)</i>
🔹 <b>bKash:</b> <code>01334677801</code> (Personal)
🔹 <b>bKash Merchant:</b> <code>01829014276</code> (Payment)
🔹 <b>Nagad:</b> <code>01334677801</code> (Personal)
🔹 <b>Upay:</b> <code>01334677801</code> (Personal)

📝 <b>Step-by-Step Instructions:</b>
1️⃣ Send the exact amount for your plan.
2️⃣ Capture a clear <b>Screenshot</b> of the success page.
3️⃣ <b>Upload the Screenshot</b> to this bot right now.
4️⃣ <b>Important:</b> Mention your <i>Transaction ID</i> in the photo caption.

⏳ <b>What's Next?</b>
After you send the photo, our Admin will verify it.
Your license key will be delivered 📩 automatically in <b>10-30 minutes</b>.
`;

// Initialize Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// User Middleware (Auto-register user in Firestore)
bot.use(async (ctx, next) => {
    if (ctx.from) {
        const userId = ctx.from.id.toString();
        const userRef = db.collection('users').doc(userId);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            await userRef.set({
                id: userId,
                first_name: ctx.from.first_name,
                username: ctx.from.username || null,
                status: 'active',
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                auth_type: 'telegram'
            });
            console.log(`New user registered: ${userId}`);
        }
    }
    return next();
});

// Start Command
bot.command('start', async (ctx) => {
    const startPayload = ctx.payload;

    if (startPayload === 'trial') {
        return handleTrialRequest(ctx);
    } else if (startPayload === 'premium') {
        return handlePremiumRequest(ctx);
    }

    ctx.replyWithPhoto('https://picsum.photos/800/400?grayscale', {
        caption: `<b>Welcome to ERB Traffic Bot! 🚀</b>\n\nI am your personal assistant for managing your traffic licenses.\n\n<b>🆔 Your ID:</b> <code>${ctx.from.id}</code>\n\nSelect an option below to get started:`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Get Free Trial (3 Days)', 'get_trial')],
            [Markup.button.callback('💎 Premium Plans', 'buy_premium'), Markup.button.callback('👤 My License', 'my_license')],
            [Markup.button.callback('🆘 Support', 'support')]
        ])
    });
});

// Handle 'Get Trial'
async function handleTrialRequest(ctx) {
    const userId = ctx.from.id.toString();
    const licensesRef = db.collection('licenses');

    // Check if user already has any license (prevent multiple trials)
    const existing = await licensesRef.where('user_id', '==', userId).get();
    if (!existing.empty) {
        return ctx.reply('⚠️ You already have a license associated with this account. Use 👤 My License to check details.');
    }

    // Generate Trial Key
    const key = `ERB-TRIAL-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 3); // 3 Days Trial

    await licensesRef.add({
        key: key,
        user_id: userId,
        tier: 'TRIAL',
        status: 'active',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        expires_at: expiryDate.toISOString(),
        max_activations: 1,
        activations: [],
        features: ['basic_traffic', 'trial_access']
    });

    ctx.reply(`✅ <b>3-Day Trial Activated!</b>\n\nYour Key: <code>${key}</code>\n\nPaste this key into the app to activate your features!`, { parse_mode: 'HTML' });
}

// Handle 'Buy Premium' (Shows Plans)
function handlePremiumRequest(ctx) {
    ctx.reply(
        `💎 <b>ERB Traffic Premium Plans</b>\n\n` +
        `🟢 <b>Starter:</b> 15 Days - 300 TK\n` +
        `🔵 <b>Standard:</b> 30 Days - 600 TK\n` +
        `🟠 <b>Pro:</b> 6 Months - 1500 TK\n` +
        `👑 <b>Permanent:</b> Lifetime - 3500 TK\n\n` +
        `<i>Select a plan to see payment details:</i>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Starter (15d)', 'pay_starter'), Markup.button.callback('Standard (30d)', 'pay_30d')],
                [Markup.button.callback('Pro (6m)', 'pay_6m'), Markup.button.callback('Permanent', 'pay_perm')],
                [Markup.button.callback('⬅️ Back', 'start_over')]
            ])
        }
    );
}

// Plan Payment Detail Handlers
bot.action(/pay_(.+)/, async (ctx) => {
    const plan = ctx.match[1];
    const userId = ctx.from.id.toString();

    // Save pending plan to Firestore
    await db.collection('users').doc(userId).update({
        pending_plan: plan
    });

    const planNames = {
        'starter': 'Starter (15 Days - 300 TK)',
        '30d': 'Standard (30 Days - 600 TK)',
        '6m': 'Pro (6 Months - 1500 TK)',
        'perm': 'Permanent (Lifetime - 3500 TK)'
    };

    ctx.reply(
        `💳 <b>Payment for ${planNames[plan]}</b>\n${PAYMENT_DETAILS}`,
        { parse_mode: 'HTML' }
    );
});

// Handle Screenshot Uploads
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id.toString();
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Get highest resolution
    const caption = ctx.message.caption || 'No caption provided';

    // Get user's pending plan
    const userDoc = await db.collection('users').doc(userId).get();
    const pendingPlan = userDoc.exists ? (userDoc.data().pending_plan || null) : null;

    if (!pendingPlan) {
        return ctx.reply('⚠️ Please select a plan first by clicking "💎 Premium Plans" before sending your payment screenshot.');
    }

    const planConfig = {
        'starter': { label: 'Approve Starter (15d)', days: 15 },
        '30d': { label: 'Approve 30 Days', days: 30 },
        '6m': { label: 'Approve 6 Months', days: 180 },
        'perm': { label: 'Approve Permanent', days: 3650 }
    };

    const targetPlan = planConfig[pendingPlan];

    // Forward to Admin
    try {
        await ctx.telegram.sendPhoto(ADMIN_ID, photo.file_id, {
            caption: `📩 <b>New Payment Screenshot!</b>\n` +
                `👤 <b>User:</b> ${ctx.from.first_name} (@${ctx.from.username || 'N/A'})\n` +
                `🆔 <b>ID:</b> <code>${userId}</code>\n` +
                `� <b>Requested Plan:</b> ${pendingPlan.toUpperCase()}\n` +
                `�💬 <b>Caption:</b> ${caption}`,
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(`✅ ${targetPlan.label}`, `admin_appr_${userId}_${targetPlan.days}`)],
                [Markup.button.callback('❌ Reject', `admin_rej_${userId}`)]
            ])
        });

        ctx.reply('✅ <b>Screenshot sent to Admin!</b>\n\nPlease wait while we verify your transaction. You will receive a notification once approved.', { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Failed to forward screenshot:', error);
        ctx.reply('❌ <b>Error sending screenshot.</b> Please contact support directly.');
    }
});

// Admin Action Handlers
bot.action(/admin_appr_(.+)_(\d+)/, async (ctx) => {
    const userId = ctx.match[1];
    const days = parseInt(ctx.match[2]);
    const licensesRef = db.collection('licenses');

    // Generate Key
    const key = `ERB-PAID-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    await licensesRef.add({
        key: key,
        user_id: userId,
        tier: days > 365 ? 'PERMANENT' : 'PREMIUM',
        status: 'active',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        expires_at: expiryDate.toISOString(),
        max_activations: 5,
        activations: [],
        features: ['all_plugins', 'unlimited_traffic', 'priority_support']
    });

    // Notify User
    try {
        await ctx.telegram.sendMessage(userId,
            `🎊 <b>Congratulations! Your payment has been approved.</b>\n\n` +
            `🔑 <b>License Key:</b> <code>${key}</code>\n` +
            `📅 <b>Expires:</b> ${days > 365 ? 'Never' : expiryDate.toLocaleDateString()}\n\n` +
            `Happy Traffic! 🚀`,
            { parse_mode: 'HTML' }
        );
        ctx.answerCbQuery('User Notified!');
        ctx.editMessageCaption(`✅ Approved. User ID: ${userId} for ${days} days.`);
    } catch (e) {
        ctx.answerCbQuery('Approved, but failed to notify user.');
    }
});

bot.action(/admin_rej_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    try {
        await ctx.telegram.sendMessage(userId, '❌ <b>Your payment was rejected!</b>\n\nPlease check your transaction details and try again or contact support at @samuelsrom.', { parse_mode: 'HTML' });
        ctx.answerCbQuery('User Notified of Rejection');
        ctx.editMessageCaption(`❌ Rejected User ID: ${userId}`);
    } catch (e) {
        ctx.answerCbQuery('Rejected, but failed to notify user.');
    }
});

// Other Actions
bot.action('start_over', (ctx) => ctx.deleteMessage() && bot.handleUpdate(ctx.update));
bot.action('get_trial', (ctx) => handleTrialRequest(ctx));
bot.action('buy_premium', (ctx) => handlePremiumRequest(ctx));
bot.action('support', (ctx) => ctx.reply('🆘 <b>Support Details:</b>\n\nContact @samuelsrom for any issues regarding payments or technical support.', { parse_mode: 'HTML' }));

bot.action('my_license', async (ctx) => {
    const userId = ctx.from.id.toString();
    const licensesRef = db.collection('licenses');
    const snapshot = await licensesRef.where('user_id', '==', userId).where('status', '==', 'active').get();

    if (snapshot.empty) {
        return ctx.reply('❌ <b>You do not have an active license.</b>\nClick ⚡ Get Free Trial or 💎 Premium Plans to get started.');
    }

    const license = snapshot.docs[0].data();
    const isPermanent = license.tier === 'PERMANENT';

    ctx.reply(
        `📋 <b>License Details</b>\n\n` +
        `🔑 <b>Key:</b> <code>${license.key}</code>\n` +
        `🏅 <b>Tier:</b> ${license.tier}\n` +
        `📅 <b>Expires:</b> ${isPermanent ? 'Never' : new Date(license.expires_at).toLocaleDateString()}\n` +
        `💻 <b>Activations:</b> ${license.activations ? license.activations.length : 0}/${license.max_activations}`,
        { parse_mode: 'HTML' }
    );
});

// Start Bot
bot.launch().then(() => {
    console.log('🤖 ERB Traffic Bot is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Cloud Hosting Keep-Alive (For Render/Glitch/Replit)
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('ERB Traffic Bot is Alive!');
    res.end();
}).listen(PORT, () => {
    console.log(`Keep-alive server listening on port ${PORT}`);
});
