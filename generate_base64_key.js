const fs = require('fs');
const path = require('path');

try {
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) {
        console.error('❌ Error: serviceAccountKey.json not found in this folder!');
        process.exit(1);
    }

    const keyContent = fs.readFileSync(keyPath, 'utf8');
    // Minify JSON to remove unnecessary whitespace before encoding
    const minifiedKey = JSON.stringify(JSON.parse(keyContent));
    const base64Key = Buffer.from(minifiedKey).toString('base64');

    console.log('\n✅ Your Base64 Encoded Key (Copy everything below):\n');
    console.log(base64Key);
    console.log('\n✅ End of Key\n');
    console.log('👉 Add this as a new Environment Variable in Render:');
    console.log('   Key:   FIREBASE_AUTH_BASE64');
    console.log('   Value: (The long string printed above)');

} catch (error) {
    console.error('❌ Error:', error.message);
}
