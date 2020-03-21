const axios = require('axios');

(async () => {
	const doormanServerEndpoint = 'https://sending-messages-for-doorman.herokuapp.com/phoneLogic';

	res = await axios.post(doormanServerEndpoint, {
		action: 'cloudFunctionStatusUpdate',
		status: 1,
		message: 'Started CLI'
	});

	console.log(res.data);
	return res.data;
})();
