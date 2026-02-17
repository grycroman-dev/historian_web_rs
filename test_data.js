const https = require('https');

const options = {
    hostname: 'localhost',
    port: 3443,
    path: '/api/devicedata?draw=1&start=0&length=1',
    method: 'GET',
    rejectUnauthorized: false
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Total Records:', json.recordsTotal);
            if (json.data && json.data.length > 0) {
                console.log('First Record ModifiedOn:', json.data[0].ModifiedOn);
                console.log('First Record ModifiedOn type:', typeof json.data[0].ModifiedOn);
            } else {
                console.log('No records found.');
            }
        } catch (e) {
            console.log('Error parsing JSON:', e.message);
            console.log('Raw Data:', data.substring(0, 100));
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
