const https = require('https');

// Get key from Env Var or Argument
// Usage: BARK_KEY=xyz node scripts/notify.js [title] [body]
// Or: node scripts/notify.js [title] [body] [key]
const BARK_KEY = process.env.BARK_KEY || process.argv[4];

if (!BARK_KEY) {
    console.error('Error: BARK_KEY environment variable is not set and no key was provided as an argument.');
    console.error('Usage: BARK_KEY=your_key node scripts/notify.js "Title" "Body"');
    process.exit(1);
}

// Get args or set defaults
const title = process.argv[2] || 'Jules Task';
const body = process.argv[3] || 'Task Completed Successfully';

// Encode for URL
const encodedTitle = encodeURIComponent(title);
const encodedBody = encodeURIComponent(body);

const url = `https://api.day.app/${BARK_KEY}/${encodedTitle}/${encodedBody}`;

console.log(`Sending notification to Bark...`);

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log('Notification sent successfully.');
        } else {
            console.error(`Failed to send notification. Status: ${res.statusCode}`);
            process.exit(1);
        }
    });

}).on('error', (err) => {
    console.error('Error sending notification:', err.message);
    process.exit(1);
});
