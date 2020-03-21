const https = require('https');

const sendRequest = body => {
	const data = JSON.stringify(body);

	const full_hostname = 'https://sending-messages-for-doorman.herokuapp.com';
	const hostname = 'sending-messages-for-doorman.herokuapp.com';
	const path = '/phoneLogic';

	const options = {
		hostname: hostname,
		port: 443,
		path: path,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': data.length
		}
	};

	const req = https.request(options, res => {
		// console.log(`statusCode: ${res.statusCode}`);
		var dataQueue = '';
		res.on('data', d => {
			// process.stdout.write(d);
			dataQueue += d;
		});
		res.on('end', function() {
			console.log('Status resonse from Doorman Server:', dataQueue);
			// return dataQueue;
		});
	});

	req.on('error', error => {
		console.error(error);
	});

	req.write(data);
	req.end();
};

// body = { action: 'cloudFunctionStatusUpdate', status: 2 };
// sendRequest(body);
module.exports = sendRequest;
