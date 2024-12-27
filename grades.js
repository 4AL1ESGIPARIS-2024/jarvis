import fs from 'node:fs';
import { client } from './index.js';
const JSON_FILE = './gradesData.json';

async function getToken() {
	const username = process.env.USERNAME?.trim() || 'username';
	const password = process.env.PASSWORD?.trim() || 'password';
	const loginUrl =
		process.env.LOGIN_MYGES_URL?.trim() ||
		'https://authentication.kordis.fr/oauth/authorize?response_type=token&client_id=skolae-app';

	const userpass = Buffer.from(`${username}:${password}`).toString('base64');

	try {
		const response = await fetch(loginUrl, {
			method: 'GET',
			headers: {
				Authorization: `Basic ${userpass}`,
			},
			redirect: 'manual',
		});

		const locationHeader = response.headers.get('location');
		if (!locationHeader) {
			throw new Error('No location header found');
		}

		const match = locationHeader.match(/comreseaugesskolae:\/oauth2redirect#access_token=(.*)&token_type=bearer/);
		if (!match) {
			throw new Error('Token not found in location header');
		}

		return match[1];
	} catch (error) {
		console.error('Error fetching token:', error);
		throw error;
	}
}

async function getGrades(years, header) {
	const url = `https://api.kordis.fr/me/${years}/grades`;

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: header,
		});

		if (!response.ok) {
			throw new Error(`HTTP error! Status: ${response.status}`);
		}

		return await response.json();
	} catch (error) {
		console.error('Error fetching grades:', error);
		throw error;
	}
}

function loadPreviousGrades() {
	const gradesFilePath = JSON_FILE;
	if (fs.existsSync(gradesFilePath)) {
		const data = fs.readFileSync(gradesFilePath, 'utf8');
		return JSON.parse(data);
	}
	return {};
}

function saveGradesData(gradesData) {
	const gradesFilePath = JSON_FILE;
	fs.writeFileSync(gradesFilePath, JSON.stringify(gradesData, null, 2), 'utf8');
}

async function checkGradesAndUpdate() {
	try {
		const token = await getToken();
		const bearerHeader = {
			Authorization: `Bearer ${token}`,
		};

		const currentYear = new Date().getFullYear();
		const grades = await getGrades(currentYear, bearerHeader);
		const courses = grades.result;
		const previousGrades = loadPreviousGrades();
		const coursesWithNewGrades = [];

		const currentGradesMap = {};
		courses.forEach((course) => {
			currentGradesMap[course.course] = course.grades;
		});

		const isFirstRun = Object.keys(previousGrades).length === 0;
		if (isFirstRun || currentGradesMap === previousGrades) {
			saveGradesData(currentGradesMap);
			return;
		}

		courses.forEach((course) => {
			const courseName = course.course;
			const newGrades = course.grades;
			const previousCourseGrades = previousGrades[courseName] || [];

			if (newGrades.length > previousCourseGrades.length) {
				coursesWithNewGrades.push(courseName);
			}
		});

		if (coursesWithNewGrades.length > 0 && process.env.GRADES_CHANNEL_ID) {
			const isMultiple = coursesWithNewGrades.length > 1;
			const message = `Nouvelle${isMultiple ? 's' : ''} note${isMultiple ? 's' : ''} disponible${isMultiple ? 's' : ''} sur myges :\n- ${coursesWithNewGrades.join('\n- ')}`;

			const channel = await client.channels.fetch(process.env.GRADES_CHANNEL_ID);
			if (channel) {
				await channel.send(message);
			}
		}

		saveGradesData(currentGradesMap);
	} catch (error) {
		console.error('Error in checkGradesAndUpdate:', error);
	}
}

export async function handleCheckGrades(interaction = null) {
	try {
		await checkGradesAndUpdate();
		if (interaction) {
			await interaction.reply('Vérification des notes sur myges effectuée.');
		}
	} catch (error) {
		console.error('Error checking grades:', error);
		if (interaction) {
			await interaction.reply('Erreur lors de la vérification des notes sur myges.');
		}
	}
}
