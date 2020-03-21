#! /usr/bin/env node

var shell = require('shelljs');
const fs = require('fs');
const https = require('https');
const process = require('process');

const pkg = require('../package.json');
const axios = require('axios');

const doormanServerEndpoint = 'https://sending-messages-for-doorman.herokuapp.com/phoneLogic';

const givenProjectId = process.argv[2];
const apiSecret = process.argv[3];
const givenLocation = process.argv[4] || 'us-central1';

if (!givenProjectId) {
	console.log('no given project id');
	return;
}
if (!apiSecret) {
	console.log('no given api secret');
	return;
}

(async () => {
	const projectId = givenProjectId || process.env.FIREBASE_PROJECT_ID;
	console.log('using project id: ', projectId, 'env', givenProjectId, 'global', process.env.FIREBASE_PROJECT_ID);

	console.log('this is version', pkg.version);

	// 1) TODO send version and project id to server to mark it has started
	// sendRequest({ action: 'cloudFunctionStatusUpdate', status: 1, message: 'Started CLI', givenProjectId, apiSecret });
	let res = await axios.post(doormanServerEndpoint, {
		action: 'cloudFunctionStatusUpdate',
		status: 1,
		message: 'Started CLI',
		givenProjectId,
		apiSecret
	});
	console.log('FIRST RES', res.data);

	const OUTER_DIRECTORY = '.DoormanOuterDirectory';

	const OUTPUT_FILE = '.interactive';

	const OUTPUT_FILE_PATH = `${OUTER_DIRECTORY}/${OUTPUT_FILE}`;

	shell.exec(`mkdir ${OUTER_DIRECTORY}`);

	process.chdir(OUTER_DIRECTORY);

	console.log('Installing the latest versions of the Firebase CLI...');

	shell.exec(`cd ${OUTER_DIRECTORY} && npm install -g firebase-tools && npm install -g firebase-functions@latest firebase-admin@latest --save`);

	process.chdir('../');

	console.log('Firebase CLI installed!');

	// 2) TODO send successfully installed firebase tools
	// sendRequest({ action: 'cloudFunctionStatusUpdate', status: 2, message: 'Successfully installed firebase tools', givenProjectId, apiSecret });
	res = await axios.post(doormanServerEndpoint, {
		action: 'cloudFunctionStatusUpdate',
		status: 2,
		message: 'Successfully installed firebase tools',
		givenProjectId,
		apiSecret
	});
	console.log('res 2', res.data);
	return;
	console.log('Now logging you into Firebase...');

	process.chdir(OUTER_DIRECTORY);

	shell.exec(`firebase login:ci --interactive > ${OUTPUT_FILE}`);

	process.chdir('../');

	const inter = fs.readFileSync(OUTPUT_FILE_PATH, 'utf8');
	let token = inter.substring(inter.lastIndexOf('1//'));
	token = token.substring(0, token.indexOf('[') - 1);
	token = token.trim().replace(/\r?\n|\r/g, '');
	// console.log(`<<<${token}>>>`);

	// 3) TODO send successfully logged into firebase and got token (maybe even send first part of token as proof)
	/*sendRequest({
	action: 'cloudFunctionStatusUpdate',
	status: 3,
	message: 'Successfully logged into firebase',
	token: token.slice(0, 10),
	givenProjectId,
	apiSecret
});*/

	res = await axios.post(doormanServerEndpoint, {
		action: 'cloudFunctionStatusUpdate',
		status: 3,
		message: 'Successfully logged into firebase',
		token: token.slice(0, 10),
		givenProjectId,
		apiSecret
	});
	console.log('RESSSS', res);

	shell.exec(`rm ${OUTPUT_FILE_PATH}`);

	const REPLACE_TEXT = '<your-project-name>';

	const DOORMAN_DIRECTORY = '.DoormanDownload';
	const DOORMAN_DIRECTORY_PATH = `${OUTER_DIRECTORY}/${DOORMAN_DIRECTORY}`;

	shell.exec(`rm -r ${DOORMAN_DIRECTORY_PATH}`);

	console.log('Downloading cloud function to deploy.');

	shell.exec(`git clone https://github.com/jerber/DoormanDownload.git ${DOORMAN_DIRECTORY_PATH}`);

	shell.exec(`pwd && cd ${DOORMAN_DIRECTORY_PATH}/functions && npm i`);

	try {
		const data = fs.readFileSync(`${DOORMAN_DIRECTORY_PATH}/.firebaserc_before`, 'utf8');
		const afterData = data.replace(REPLACE_TEXT, projectId);
		fs.writeFileSync(`${DOORMAN_DIRECTORY_PATH}/.firebaserc`, afterData);
	} catch (err) {
		console.error(err);
	}
	// shell.exec(`sed 's/${replaceText}/${projectId}/' DoormanDownload/.firebaserc_before > DoormanDownload/.firebaserc`);

	const LOCATION_OUTPUT = 'firebaseUploadingLogs';

	// 4) TODO send successfully downloaded and NPMd doorman download
	/*sendRequest({
	action: 'cloudFunctionStatusUpdate',
	status: 4,
	message: 'Successfully downloaded and NPMd doorman download',
	givenProjectId,
	apiSecret
});*/

	res = await axios.post(doormanServerEndpoint, {
		action: 'cloudFunctionStatusUpdate',
		status: 4,
		message: 'Successfully downloaded and NPMd doorman download',
		givenProjectId,
		apiSecret
	});
	console.log('res', res);

	// add config
	console.log('Adding secret api key to Firebase environment.');
	shell.exec(`pwd && cd ${DOORMAN_DIRECTORY_PATH}/functions && firebase functions:config:set doorman.apisecret="${apiSecret}" --token "${token}"`);

	console.log('Deploying cloud function to Firebase...');

	shell.exec(
		`pwd && cd ${DOORMAN_DIRECTORY_PATH}/functions && firebase deploy --token "${token}" --only functions:doormanPhoneLogic > ${LOCATION_OUTPUT}`
	);

	temp = fs.readFileSync(`${DOORMAN_DIRECTORY_PATH}/functions/${LOCATION_OUTPUT}`, 'utf8');
	let location = temp.substring(temp.lastIndexOf('doormanPhoneLogic('));
	location = location.substring(0, location.indexOf(')'));
	location = location.trim().replace(/\r?\n|\r/g, '');
	location = location.replace('doormanPhoneLogic(', '').replace(')', '');

	console.log('location:', location);

	const final_location = location || givenLocation;
	if (final_location !== 'us-central1') console.log('REGIION IS NOT USE CENTRAL***');
	const ENDPOINT = `https://${final_location}-${projectId}.cloudfunctions.net/doormanPhoneLogic`;
	console.log('ENDPOINT FOR FUNCTION', ENDPOINT);

	shell.exec(`rm -r ${OUTER_DIRECTORY}`);

	// SEND 5
	/*sendRequest({
	action: 'cloudFunctionStatusUpdate',
	status: 5,
	message: 'Successfully deployed function',
	givenProjectId,
	apiSecret,
	endpoint: ENDPOINT,
	parsedLocation: location
});*/

	axios.post(doormanServerEndpoint, {
		action: 'cloudFunctionStatusUpdate',
		status: 5,
		message: 'Successfully deployed function',
		givenProjectId,
		apiSecret,
		endpoint: ENDPOINT,
		parsedLocation: location
	});

	// now time to send data to server
	const DOORMAN_ENDPOINT = 'https://sending-messages-for-doorman.herokuapp.com/uploadedCloudFunction';
	command_str = `curl -X POST -H "Content-Type: application/json" -d '{\"endpoint\": \"${ENDPOINT}\", \"parsedLocation\": \"${location}\", \"firebaseProjectId\": \"${projectId}\", \"apiSecret\": \"${apiSecret}\"}' ${DOORMAN_ENDPOINT}`;
	console.log('Sending status to Doorman now...');
	shell.exec(command_str);
	console.log('Status sent to Doorman, all done!');
})();
