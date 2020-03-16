#! /usr/bin/env node

var shell = require('shelljs');
const fs = require('fs');
const pkg = require('../package.json');

const givenProjectId = process.argv[2];
const apiSecret = process.argv[3];
const givenLocation = process.argv[4] || 'us-central1';

const projectId = givenProjectId || process.env.FIREBASE_PROJECT_ID;
console.log('using project id: ', projectId, 'env', givenProjectId, 'global', process.env.FIREBASE_PROJECT_ID);

console.log('now logging shit, this is version', pkg.version);

const OUTPUT_FILE = '.interactive';

shell.exec('npm install -g firebase-tools && npm install -g firebase-functions@latest firebase-admin@latest --save');
console.log('all firebase stuff has been installed');

shell.exec(`firebase login:ci --interactive > ${OUTPUT_FILE}`); //TODO put back after testing

const inter = fs.readFileSync(OUTPUT_FILE, 'utf8');
let token = inter.substring(inter.lastIndexOf('1//'));
token = token.substring(0, token.indexOf('[') - 1);
token = token.trim().replace(/\r?\n|\r/g, '');
console.log(`<<<${token}>>>`);

shell.exec(`rm ${OUTPUT_FILE}`);

const REPLACE_TEXT = '<your-project-name>';

const DOORMAN_DIRECTORY = '.DoormanDownload';

shell.exec(`rm -r ${DOORMAN_DIRECTORY}`);

shell.exec(`git clone https://github.com/jerber/DoormanDownload.git ${DOORMAN_DIRECTORY}`);

shell.exec(`pwd && cd ${DOORMAN_DIRECTORY}/functions && npm i && firebase functions:config:set doorman.apiSecret="${apiSecret}"`);

try {
	const data = fs.readFileSync(`${DOORMAN_DIRECTORY}/.firebaserc_before`, 'utf8');
	const afterData = data.replace(REPLACE_TEXT, projectId);
	fs.writeFileSync(`${DOORMAN_DIRECTORY}/.firebaserc`, afterData);
} catch (err) {
	console.error(err);
}
// shell.exec(`sed 's/${replaceText}/${projectId}/' DoormanDownload/.firebaserc_before > DoormanDownload/.firebaserc`);

const LOCATION_OUTPUT = 'firebaseUploadingLogs';

shell.exec(`pwd && cd ${DOORMAN_DIRECTORY}/functions && firebase deploy --token "${token}" --only functions:doormanPhoneLogic > ${LOCATION_OUTPUT}`);

temp = fs.readFileSync(`${DOORMAN_DIRECTORY}/functions/${LOCATION_OUTPUT}`, 'utf8');
let location = temp.substring(temp.lastIndexOf('doormanPhoneLogic('));
location = location.substring(0, location.indexOf(')'));
location = location.trim().replace(/\r?\n|\r/g, '');
location = location.replace('doormanPhoneLogic(', '').replace(')', '');
console.log('PARSED LOCATION', location);
const final_location = location || givenLocation;
if (final_location !== 'us-central1') console.log('REGIION IS NOT USE CENTRAL***');
const ENDPOINT = `https://${final_location}-${projectId}.cloudfunctions.net/doormanPhoneLogic`;
console.log('ENDPOINT FOR FUNCTION', ENDPOINT);
