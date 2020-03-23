#! /usr/bin/env node
const shell = require('shelljs');
const fs = require('fs');
const https = require('https');
const process = require('process');

const pkg = require('../package.json'); // TODO change to bin for real...
const axios = require('axios');
const argv = require('yargs').argv;

const DOORMAN_SERVER_ENDPOINT = 'https://sending-messages-for-doorman.herokuapp.com/phoneLogic';
const ID = new Date().getTime().toString();

const FIREBASE_PROJECT_ID = argv.firebaseProjectId;
const API_SECRET = argv.apiSecret;
const TOTAL_STEPS = 6;

const doInputsExist = () => {
	console.log(`Firebase Project Id: ${FIREBASE_PROJECT_ID}`);
	if (!FIREBASE_PROJECT_ID) {
		console.log('no given project id');
		return false;
	}
	if (!API_SECRET) {
		console.log('no given api secret');
		return false;
	}
	return true;
};

const printToTerminal = body => {
	console.log(`\n\n**${body}**\n\n`);
};

const sendUpdateToDoormanServer = async body => {
	body.action = 'cloudFunctionStatusUpdate';
	body.firebaseProjectId = FIREBASE_PROJECT_ID;
	body.apiSecret = API_SECRET;
	body.id = ID;
	body.totalSteps = TOTAL_STEPS;
	const response = await axios.post(DOORMAN_SERVER_ENDPOINT, body);
	console.log(`Doorman status response:`, response.data);
	const { errorCode } = response.data;
	if (errorCode) {
		printToTerminal('There was an error that calls for a Doorman engineer. Please contact jeremy@basement.social for help!');
		throw new Error(response.data.message);
	}
};

const hasMostRecentFirebseCliVersions = () => {
	pkgs = {
		'firebase-tools': '7.15.1',
		'firebase-functions': '3.5.0',
		'firebase-admin': '8.10.0'
	};
	pkg_strs = [];
	for (let key in pkgs) {
		pkg_strs.push(`${key}@${pkgs[key]}`);
	}
	printToTerminal('Checking current Firebase CLI versions');
	const { stdout } = shell.exec('npm list -g firebase-admin && npm list -g firebase-tools && npm list -g firebase-functions', { silent: true });

	for (pkg_str in pkg_strs) {
		if (!stdout.includes(pkg_str)) {
			printToTerminal(`The library ${pkg_str} is not up to date, so will isntall latest...`);
			return false;
		}
	}
	return true;
};

const installFirebaseCLI = async () => {
	const mostRecent = hasMostRecentFirebseCliVersions();
	if (mostRecent) {
		printToTerminal('Firebase CLI was up to date');
	} else {
		printToTerminal('Installing latest Firebase CLI...');
		shell.exec('npm install -g firebase-tools && npm install -g firebase-functions@latest firebase-admin@latest --save');
		printToTerminal('Installed the latest Firebase CLI');
	}
	await sendUpdateToDoormanServer({
		status: 2,
		message: 'Installed Firebase CLI',
		installedNewVersions: !mostRecent
	});
};

const loginToFirebase = async () => {
	printToTerminal('Starting Firebase Login');

	const { stdout } = shell.exec(`firebase login:ci --interactive`);

	let token = stdout.substring(stdout.lastIndexOf('1//'));
	token = token.substring(0, token.indexOf('[') - 1);
	token = token.trim().replace(/\r?\n|\r/g, '');

	const message = 'Logged into Firebase';
	printToTerminal(message);

	await sendUpdateToDoormanServer({
		status: 3,
		message,
		tokeSlice: token.slice(0, 10)
	});

	return token;
};

const downloadDoormanDownloadGit = async () => {
	printToTerminal('Starting Doorman Download process');

	const REPLACE_TEXT = '<your-project-name>';
	const DOORMAN_DIRECTORY = '.DoormanDownload';

	shell.exec(`rm -r ${DOORMAN_DIRECTORY}`); // TODO what about windows
	shell.exec(`rmdir /Q /S ${DOORMAN_DIRECTORY}`);

	console.log('Downloading cloud function to deploy.');

	shell.exec(`git clone https://github.com/jerber/DoormanDownload.git ${DOORMAN_DIRECTORY}`);

	process.chdir(`${DOORMAN_DIRECTORY}`);
	shell.exec('cd functions && npm i');

	const data = fs.readFileSync(`.firebaserc_before`, 'utf8');
	const afterData = data.replace(REPLACE_TEXT, FIREBASE_PROJECT_ID);
	fs.writeFileSync(`.firebaserc`, afterData);
	const message = 'Downloaded and NPMd Doorman Download';
	printToTerminal(message);
	await sendUpdateToDoormanServer({ status: 4, message });
};

const setConfigAndDeployFunction = async token => {
	console.log('Adding secret api key to Firebase environment.');
	shell.exec(`cd functions && firebase functions:config:set doorman.apisecret="${API_SECRET}" --token "${token}"`);

	console.log('Deploying cloud function to Firebase...');

	const { stdout } = shell.exec(`cd functions && firebase deploy --token "${token}" --only functions:doormanPhoneLogic`);

	message = 'Deployment over, now will see if successfull';
	console.log(message);
	await sendUpdateToDoormanServer({
		status: 5,
		message,
		deploymentResponse: stdout
	});
	return stdout;
};

const parseDeploymentResponse = async deploymentResposne => {
	printToTerminal('Parsing deployment response');
	let location = deploymentResposne.substring(deploymentResposne.lastIndexOf('doormanPhoneLogic('));
	location = location.substring(0, location.indexOf(')'));
	location = location.trim().replace(/\r?\n|\r/g, '');
	location = location.replace('doormanPhoneLogic(', '').replace(')', '');

	console.log('Parsed location:', location);

	if (location !== 'us-central1') console.log('***REGIION IS NOT USE CENTRAL***');

	const projectEndpoint = `https://${location}-${FIREBASE_PROJECT_ID}.cloudfunctions.net/doormanPhoneLogic`;
	console.log('Project endpoint', projectEndpoint);

	await sendUpdateToDoormanServer({
		status: 6,
		location,
		message: 'Parsed deployment response',
		endpoint: projectEndpoint,
		finished: true
	});

	return projectEndpoint;
};

const startCLI = async () => {
	const { stdout: startingDirectory } = shell.exec('pwd');

	console.log('this is version', pkg.version);
	doInputsExist();

	// Send first update
	await sendUpdateToDoormanServer({ status: 1, message: 'Started CLI' });

	const outerDirectory = '.DoormanOuterDirectory';
	// make and change dir to outter directory, which we will delete finally
	if (!fs.existsSync(outerDirectory)) {
		fs.mkdirSync(outerDirectory);
	}
	process.chdir(outerDirectory);
	// pwd = .DoormanOuterDirectory

	await installFirebaseCLI();

	const token = await loginToFirebase();
	console.log('token', token);

	await downloadDoormanDownloadGit();
	// pwd = .DoormanOuterDirectory/.DoormanDownload

	const deploymentResponse = await setConfigAndDeployFunction(token);

	console.log('DEPLOYEMT RESPONSE', deploymentResponse);

	const projectEndpoint = await parseDeploymentResponse(deploymentResponse);

	// now delete the directories...
	printToTerminal('Now deleting directories used for upload');
	// process.chdir(startingDirectory);
	process.chdir('../..');
	shell.exec('pwd');
	mainDeleteCommand = `rm -r ${outerDirectory}`; // TODO what about windows
	mainDeleteCommandWindows = `rmdir /Q /S ${outerDirectory}`;
	console.log('path for deletion', mainDeleteCommand);

	shell.exec(mainDeleteCommand);
	shell.exec(mainDeleteCommandWindows);

	printToTerminal('DONE! Check your Doorman dashboard to see if the deployment was successful!');
};

startCLI();
