const https = require('https');

const sendRequest = body => {
	console.log('SEND REQUEST CALLED!');
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
		console.log('REQQQQQ REQUEST CALLED!');
		// console.log(`statusCode: ${res.statusCode}`);
		var dataQueue = '';
		res.on('data', d => {
			// process.stdout.write(d);
			dataQueue += d;
		});
		res.on('end', function() {
			data = JSON.parse(dataQueue);
			console.log('Status resonse from Doorman Server:', data);
			// return dataQueue;
		});
	});

	req.on('error', error => {
		console.error(error);
	});

	console.log('BEFORE WRITE REQUEST CALLED!');
	req.write(data);
	console.log('AFTER WRITE REQUEST CALLED!');
	req.end();
	console.log('AFTER END REQUEST CALLED!');
};

// body = { action: 'cloudFunctionStatusUpdate', status: 2 };
// sendRequest(body);
module.exports = sendRequest;
