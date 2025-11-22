// handler.js
const { Storage } = require('yandex-cloud');
const storage = new Storage();

const BUCKET = 'your-bucket-name'; // replace with your Object Storage bucket
const FILE = 'comments.json';

exports.handler = async (event) => {
    const { httpMethod, body } = event;

    if (httpMethod === 'POST') {
        const newComment = JSON.parse(body);
        const comments = await storage.getObject(BUCKET, FILE)
            .then(data => JSON.parse(data.toString()))
            .catch(() => []);
        comments.push({ ...newComment, timestamp: new Date().toISOString() });
        await storage.putObject(BUCKET, FILE, JSON.stringify(comments));
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } else if (httpMethod === 'GET') {
        const comments = await storage.getObject(BUCKET, FILE)
            .then(data => JSON.parse(data.toString()))
            .catch(() => []);
        return { statusCode: 200, body: JSON.stringify(comments) };
    } else {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
};
