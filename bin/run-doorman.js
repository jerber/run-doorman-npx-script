#! /usr/bin/env node

var shell = require('shelljs');
const fs = require('fs');
const https = require('https');

const pkg = require('../package.json');

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

const projectId = givenProjectId || process.env.FIREBASE_PROJECT_ID;
console.log('using project id: ', projectId, 'env', givenProjectId, 'global', process.env.FIREBASE_PROJECT_ID);

console.log('this is version', pkg.version);

const OUTER_DIRECTORY = '.DoormanOuterDirectory';

const OUTPUT_FILE = '.interactive';

const OUTPUT_FILE_PATH = `${OUTER_DIRECTORY}/${OUTPUT_FILE}`;

shell.exec(
	`mkdir ${OUTER_DIRECTORY} && cd ${OUTER_DIRECTORY} && npm install -g firebase-tools && npm install -g firebase-functions@latest firebase-admin@latest --save`
);
console.log('all firebase stuff has been installed');

shell.exec(`firebase login:ci --interactive > ${OUTPUT_FILE_PATH}`); //TODO put back after testing

const inter = fs.readFileSync(OUTPUT_FILE_PATH, 'utf8');
let token = inter.substring(inter.lastIndexOf('1//'));
token = token.substring(0, token.indexOf('[') - 1);
token = token.trim().replace(/\r?\n|\r/g, '');
console.log(`<<<${token}>>>`);

shell.exec(`rm ${OUTPUT_FILE_PATH}`);

const REPLACE_TEXT = '<your-project-name>';

const DOORMAN_DIRECTORY = '.DoormanDownload';
const DOORMAN_DIRECTORY_PATH = `${OUTER_DIRECTORY}/${DOORMAN_DIRECTORY}`;

shell.exec(`rm -r ${DOORMAN_DIRECTORY_PATH}`);

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

// add config
console.log('adding env key now...');
shell.exec(`pwd && cd ${DOORMAN_DIRECTORY_PATH}/functions && firebase functions:config:set doorman.apisecret="${apiSecret}" --token "${token}"`);
console.log('finished adding secret, now deploying...');
shell.exec(
	`pwd && cd ${DOORMAN_DIRECTORY_PATH}/functions && firebase deploy --token "${token}" --only functions:doormanPhoneLogic > ${LOCATION_OUTPUT}`
);

temp = fs.readFileSync(`${DOORMAN_DIRECTORY_PATH}/functions/${LOCATION_OUTPUT}`, 'utf8');
let location = temp.substring(temp.lastIndexOf('doormanPhoneLogic('));
location = location.substring(0, location.indexOf(')'));
location = location.trim().replace(/\r?\n|\r/g, '');
location = location.replace('doormanPhoneLogic(', '').replace(')', '');
console.log('PARSED LOCATION', location);
const final_location = location || givenLocation;
if (final_location !== 'us-central1') console.log('REGIION IS NOT USE CENTRAL***');
const ENDPOINT = `https://${final_location}-${projectId}.cloudfunctions.net/doormanPhoneLogic`;
console.log('ENDPOINT FOR FUNCTION', ENDPOINT);

shell.exec(`rm -r ${OUTER_DIRECTORY}`);

// now time to send data to server
const DOORMAN_ENDPOINT = 'https://sending-messages-for-doorman.herokuapp.com/uploadedCloudFunction';
command_str = `curl -X POST -H "Content-Type: application/json" -d '{\"endpoint\": \"${ENDPOINT}\", \"parsedLocation\": \"${location}\", \"firebaseProjectId\": \"${projectId}\", \"apiSecret\": \"${apiSecret}\"}' ${DOORMAN_ENDPOINT}`;
console.log('sending to doorman endpoint now');
shell.exec(command_str);
console.log('sent to endpoint');
