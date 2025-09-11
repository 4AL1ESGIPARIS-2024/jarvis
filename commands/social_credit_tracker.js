import { readFileSync } from "node:fs";
import { CACHE_PATH } from "./get_all_messages.js";
import { INSULTS } from "./insults.js";

const BASE_CREDIT = 100;

const normalizeString = (str) => {
	return str
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();
}

const insultRegex = new RegExp(
	INSULTS.map((insult) => normalizeString(insult)).join("|"),
	"g",
)

const images = {
	perfect:
		"https://images.steamusercontent.com/ugc/1874060099622312925/B6030AC366ABC8133394A09D1229ECFC07EF5675/?imw=5000&imh=5000&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false",
	good: "https://www.diggitmagazine.com/sites/default/files/styles/content_image_fluid_md/public/DCS%2520SoCS%2520Meme%2520Original%2520r%2520scm.jpg.webp?itok=Ou07fCZm",
	okay: "https://www.diggitmagazine.com/sites/default/files/styles/content_image_fluid_md/public/DCS%2520SoCS%2520Meme%2520Cena%2520BingChiling%2520r%2520memes.jpg.webp?itok=3gJD1BIy",
	bad: "https://media.tenor.com/idNGiIHv6cgAAAAe/social-credit-score-social.png",
	disastrous:
		"https://i.pinimg.com/736x/3e/93/df/3e93df19c2a27b3b1fe3d482d47e2940.jpg",
};

export async function handleSocialCredit(interaction) {
	try {
		await interaction.deferReply();

		const targetUser = interaction.options.getUser("utilisateur");
		if (!targetUser) {
			await interaction.followUp({
				content: "Utilisateur introuvable.",
				ephemeral: true,
			});
			return;
		}

		const data = readFileSync(CACHE_PATH, "utf8");
		const insultsCount = JSON.parse(data);

		const userInsults = insultsCount[targetUser.id];

		const sortedInsults = Object.entries(userInsults).sort((a, b) => b[1] - a[1]);
		const totalInsults = sortedInsults.reduce((sum, [_, count]) => sum + count, 0);

		const tableRows = sortedInsults.map(([insult, count]) => {
			const countStr = count.toString().padStart(5);
			return `${countStr} │ ${insult}`;
		});

		const maxCountLength = sortedInsults.reduce((max, [_, count]) => {
			return Math.max(max, count.toString().length);
		}, 0);

		const header = "Compt. │ Insulte";
		const divider = `${"─".repeat(7 + maxCountLength)}${"─".repeat(30)}`;
		const socialCredits = BASE_CREDIT - totalInsults;
		let socialCreditStatus;

		if (socialCredits >= 75) {
			socialCreditStatus = images.perfect;
		} else if (socialCredits >= 50) {
			socialCreditStatus = images.good;
		} else if (socialCredits >= 25) {
			socialCreditStatus = images.okay;
		} else if (socialCredits >= 0) {
			socialCreditStatus = images.bad;
		} else {
			socialCreditStatus = images.disastrous;
		}

		const embed = {
			color: 0xff0000,
			title: `Calculateur crédits sociaux pour ${targetUser.username}`,
			description: [
				`**Crédit sociaux restants:** ${socialCredits}`,
				"",
				"```",
				header,
				divider,
				...tableRows,
				"```",
			].join("\n"),
			thumbnail: {
				url: socialCreditStatus,
			},
			timestamp: new Date(),
		};

		await interaction.followUp({ embeds: [embed] });
	} catch (error) {
		console.error("Error in insult tracker:", error);
		await interaction.followUp({
			content: "Une erreur s'est produite lors de la recherche d'insultes.",
			ephemeral: true,
		});
	}
}

export const getInsultsInMessage = (message) => {
	if (!message.content) return false;
	if (message.author.bot) return false;
	const content = normalizeString(message.content);
	const insultsInMessage = content.match(insultRegex);
	if (!insultsInMessage) return [];
	return insultsInMessage;
};