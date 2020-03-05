#! /usr/bin/env node

var shell = require('shelljs');
const fs = require('fs');
const pkg = require('../package.json');

const givenProjectId = process.argv[2];
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

shell.exec(`pwd && cd ${DOORMAN_DIRECTORY}/functions && npm i`);

try {
	const data = fs.readFileSync(`${DOORMAN_DIRECTORY}/.firebaserc_before`, 'utf8');
	const afterData = data.replace(REPLACE_TEXT, projectId);
	fs.writeFileSync(`${DOORMAN_DIRECTORY}/.firebaserc`, afterData);
} catch (err) {
	console.error(err);
}
// shell.exec(`sed 's/${replaceText}/${projectId}/' DoormanDownload/.firebaserc_before > DoormanDownload/.firebaserc`);

shell.exec(`pwd && cd DoormanDownload/functions && firebase deploy --token "${token}" --only functions:doormanPhoneLogic`);
