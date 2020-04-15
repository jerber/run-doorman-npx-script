#! /usr/bin/env node
const shell = require('shelljs');
const fs = require('fs');
const https = require('https');
const process = require('process');

const pkg = require('../package.json'); // TODO change to bin for real...
const axios = require('axios');
const argv = require('yargs').argv;

let DOORMAN_SERVER_ENDPOINT = 'https://sending-messages-for-doorman.herokuapp.com/phoneLogic';
const DOORMAN_TESTING_ENDPOINT = 'https://doormanbackend.herokuapp.com/phoneLogic';

const RAVEN_ENDPOINT = 'https://www.raven.cool/deploy';
const RAVEN_TESTING_ENDPOINT = 'localhost:5000/deploy';

if (argv.localTesting) DOORMAN_SERVER_ENDPOINT = DOORMAN_TESTING_ENDPOINT;

const ID = new Date().getTime().toString();

const FIREBASE_PROJECT_ID = argv.firebaseProjectId;
const API_SECRET = argv.apiSecret;
const TOTAL_STEPS = 9;
const OUTER_DIRECTORY = '.DoormanOuterDirectory';

let STATUS = 0;

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

const printToTerminal = (body) => {
	console.log(`\n\n**${body}**\n\n`);
};

const sendUpdateToDoormanServer = async (body) => {
	body.action = 'cloudFunctionStatusUpdate';
	body.firebaseProjectId = FIREBASE_PROJECT_ID;
	body.apiSecret = API_SECRET;
	body.id = ID;
	body.totalSteps = TOTAL_STEPS;
	body.status = STATUS;
	const response = await axios.post(DOORMAN_SERVER_ENDPOINT, body);
	if (response.data && response.data.success === false) {
		console.log(`Doorman status response:`, response.data);
	}
	const { errorCode } = response.data;
	if (errorCode) {
		printToTerminal('There was an error that calls for a Doorman engineer. Please contact jeremy@basement.social for help!');
		throw new Error(response.data.message);
	}
	if (!response.data.success) {
		printToTerminal(response.data.message);
		throw new Error(response.data.message);
	}
};

const sendErrorUpdateToDoormanServer = async (message) => {
	printToTerminal(message);
	const body = { error: true, message };
	return sendUpdateToDoormanServer(body);
};

const hasMostRecentFirebseCliVersions = () => {
	pkgs = {
		'firebase-tools': '7.15.1',
		'firebase-functions': '3.5.0',
		'firebase-admin': '8.10.0',
	};
	pkg_strs = [];
	for (let key in pkgs) {
		pkg_strs.push(`${key}@${pkgs[key]}`);
	}
	printToTerminal('Checking current Firebase CLI versions');
	let { stdout } = shell.exec('npm list -g firebase-admin && npm list -g firebase-tools && npm list -g firebase-functions', { silent: true });

	for (pkg_str in pkg_strs) {
		if (!stdout.includes(pkg_str)) {
			printToTerminal(`The library ${pkg_str} is not up to date, so will install latest...`);
			return false;
		}
	}
	return true;
};

const installFirebaseCLI = async () => {
	const mostRecent = hasMostRecentFirebseCliVersions();
	// const mostRecent = false;
	if (mostRecent) {
		printToTerminal('Firebase CLI was up to date');
	} else {
		printToTerminal('Installing latest Firebase CLI...');
		shell.exec('npm install -g firebase-tools && npm install -g firebase-functions@latest firebase-admin@latest --save');
		printToTerminal('Installed the latest Firebase CLI');
	}
	await sendUpdateToDoormanServer({
		message: 'Installed Firebase CLI',
		installedNewVersions: !mostRecent,
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
		message,
		tokeSlice: token.slice(0, 10),
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
	await sendUpdateToDoormanServer({ message });
};

const setConfigAndDeployFunction = async (token) => {
	console.log('Adding secret api key to Firebase environment.');
	let { stdout, stderr } = shell.exec(`cd functions && firebase functions:config:set doorman.apisecret="${API_SECRET}" --token "${token}"`);

	const errorStr = 'Authorization failed. This account is missing the following required permissions on project';
	const errorMessage = 'Authorization failed! Are you sure you logged into the correct Firebase account?';

	if (stderr.includes(errorStr)) {
		printToTerminal(errorMessage);
		throw new Error(errorMessage);
	}

	printToTerminal('Deploying cloud function to Firebase...');

	({ stdout, stderr } = shell.exec(`cd functions && firebase deploy --token "${token}" --only functions:doormanPhoneLogic`));

	if (stderr.includes(errorStr)) {
		printToTerminal(errorMessage);
		throw new Error(errorMessage);
	}

	message = 'Deployment over, now will see if successful.';
	printToTerminal(message);

	await sendUpdateToDoormanServer({
		message,
		deploymentResponse: stdout,
	});
	return stdout;
};

const parseDeploymentResponse = async (deploymentResponse) => {
	printToTerminal('Parsing deployment response');
	let location = deploymentResponse.substring(deploymentResponse.lastIndexOf('doormanPhoneLogic('));
	location = location.substring(0, location.indexOf(')'));
	location = location.trim().replace(/\r?\n|\r/g, '');
	location = location.replace('doormanPhoneLogic(', '').replace(')', '');

	console.log('Parsed location:', location);

	if (location !== 'us-central1') console.log('***REGIION IS NOT USE CENTRAL***');

	const projectEndpoint = `https://${location}-${FIREBASE_PROJECT_ID}.cloudfunctions.net/doormanPhoneLogic`;
	console.log('Project endpoint', projectEndpoint);

	await sendUpdateToDoormanServer({
		location,
		message: 'Parsed deployment response',
		endpoint: projectEndpoint,
		finished: true,
	});

	return projectEndpoint;
};

const sendStartCLI = async () => {
	printToTerminal('Starting CLI!');

	await sendUpdateToDoormanServer({ message: 'Started CLI' });
};

const testIAMPermissions = async (endpoint) => {
	printToTerminal('Testing IAM Permissions!');
	const body = { apiSecret: API_SECRET, phoneNumber: '+15556472619' };
	const { data: iamResponse } = await axios.post(endpoint, body);
	if (!iamResponse.token) {
		console.log('IAM RESPONSE', iamResponse);
	}
	const sendBody = {};
	sendBody.originalResponse = iamResponse.message;
	if (iamResponse.success === true) {
		sendBody.message = 'IAM is successfully set up! You are ready to make calls!';
		printToTerminal(sendBody.message);
		await sendUpdateToDoormanServer(sendBody);
	} else {
		const doormanDocs = 'https://docs.doorman.cool/introduction/getting-started/configure-firebase';
		const newMessage = `
Deployed successfully, however you need to enable Firebase IAM permissions for project ${FIREBASE_PROJECT_ID} before this will work in your app.

To fix, follow the instructions on Doorman's docs here: ${doormanDocs}
`;

		if (iamResponse.message.message && iamResponse.message.message.toLowerCase().includes('iam')) {
			sendBody.message = iamResponse.message.message;
			sendBody.code = iamResponse.message.code;
		}
		sendBody.message = sendBody.message + '\n\n' + newMessage;

		printToTerminal(sendBody.message);
		sendBody.warning = true;
		await sendUpdateToDoormanServer(sendBody);
	}
};

const sleep = (callback, delay) => {
	return new Promise((resolve) => {
		setTimeout(async () => {
			await callback();
			resolve();
		}, delay);
	});
};

// allow this to be done from anywhere
const cleanUp = () => {
	// now delete the directories...
	printToTerminal('Now deleting directories used for upload');
	// process.chdir(startingDirectory);
	process.chdir('../..');
	shell.exec('pwd');
	mainDeleteCommand = `rm -r ${OUTER_DIRECTORY}`; // TODO what about windows
	mainDeleteCommandWindows = `rmdir /Q /S ${OUTER_DIRECTORY}`;
	console.log('path for deletion', mainDeleteCommand);

	shell.exec(mainDeleteCommand);
	shell.exec(mainDeleteCommandWindows);
};

const sendToRaven = async (token) => {
	printToTerminal('BEGINNING DEPLOYMENT PROCESS');
	body = {
		firebaseProjectId: FIREBASE_PROJECT_ID,
		apiSecret: API_SECRET,
		deploymentId: ID,
		token,
		status: STATUS,
		totalSteps: TOTAL_STEPS,
	};
	const response = await axios.post(RAVEN_ENDPOINT, body);
	if (response.data.error) {
		printToTerminal('There was an error with the deployment:');
	}
	printToTerminal(response.data);
	// console.log(`RAVEN RESPONSE:`, response.data);
};

const startCLI = async () => {
	// let { stdout: startingDirectory } = shell.exec('pwd');
	// console.log('Starting');

	console.log('This is version', pkg.version);

	doInputsExist();

	// Send first update
	// await sendUpdateToDoormanServer({ status: 1, message: 'Started CLI' });
	try {
		STATUS++;
		await sendStartCLI();
	} catch (error) {
		printToTerminal(error.message);
		if (error.message.includes('Api secret is invalid')) {
			// Should send to backend in some way, probably should send text
			printToTerminal(
				'You are using the wrong API Secret. Please try generating a new one from the dashboard and running the given command again'
			);
		}
		return;
	}

	const outerDirectory = OUTER_DIRECTORY;
	// make and change dir to outter directory, which we will delete finally
	if (!fs.existsSync(outerDirectory)) {
		fs.mkdirSync(outerDirectory);
	}
	process.chdir(outerDirectory);
	// pwd = .DoormanOuterDirectory

	try {
		STATUS++;
		await installFirebaseCLI();
	} catch (error) {
		return sendErrorUpdateToDoormanServer(error.message);
	}

	let token;
	try {
		STATUS++;
		token = await loginToFirebase();
	} catch (error) {
		return sendErrorUpdateToDoormanServer(error.message);
	}

	return sendToRaven(token);

	// console.log('token', token);

	try {
		STATUS++;
		await downloadDoormanDownloadGit();
	} catch (error) {
		return sendErrorUpdateToDoormanServer(error.message);
	}

	// pwd = .DoormanOuterDirectory/.DoormanDownload

	let deploymentResponse;
	try {
		STATUS++;
		deploymentResponse = await setConfigAndDeployFunction(token);
	} catch (error) {
		return sendErrorUpdateToDoormanServer(error.message);
	}

	console.log('DEPLOYMENT RESPONSE', deploymentResponse);

	let projectEndpoint;
	try {
		STATUS++;
		projectEndpoint = await parseDeploymentResponse(deploymentResponse);
	} catch (error) {
		return sendErrorUpdateToDoormanServer(error.message);
	}

	try {
		STATUS++;
		printToTerminal('Now testing IAM permissions. This will take 1 minute.');
		await sleep(async () => await testIAMPermissions(projectEndpoint), 50000);
		// await setTimeout(async () => await testIAMPermissions(projectEndpoint), 10000);
	} catch (error) {
		return sendErrorUpdateToDoormanServer(error.message);
	}

	cleanUp();

	printToTerminal('DONE! Check your Doorman dashboard to see if the deployment was successful!');
};

startCLI();
