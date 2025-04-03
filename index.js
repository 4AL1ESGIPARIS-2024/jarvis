import {
	Client,
	GatewayIntentBits,
	Partials,
	EmbedBuilder,
	PermissionsBitField,
	REST,
	Routes,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	ButtonBuilder,
	ButtonStyle,
	SlashCommandBuilder,
} from "discord.js";
import { handleSocialCredit } from "./commands/social_credit_tracker.js";
import { initVoteMute, handleVoteMute, handleMuteVoteButton } from "./commands/vote_mute.js";
import { getAllMessages, storeMessage } from "./commands/get_all_messages.js";
import dotenv from "dotenv";
import { sendNewGrades } from "./grades.js";
dotenv.config();

const requiredEnvVariables = [
	"DISCORD_BOT_TOKEN",
	"CLIENT_ID",
	"GUILD_ID",
	"BOT_VERSION",
	"MYGES_API_USERNAME",
	"MYGES_API_PASSWORD",
	"GRADES_CHANNEL_ID",
];
if (!requiredEnvVariables.every((variable) => process.env[variable])) {
	console.error(
		"Please make sure to create a .env file with the following variables:",
		requiredEnvVariables.join(", "),
	);
	process.exit(1);
}

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.MessageContent,
	],
	partials: [Partials.Channel, Partials.Message, Partials.User],
});

initVoteMute(client);

const electionData = {
	candidates: [],
	votes: {},
	usersWhoVoted: new Set(),
	votesPerUser: 1,
	roleId: null,
	eligibleMembers: new Set(),
	voteHistory: [],
	pendingVotes: {},
	announcementMessageId: null,
	announcementChannelId: null,
};

const guildCommands = [
	new SlashCommandBuilder()
		.setName("startelection")
		.setDescription("Démarre une nouvelle élection")
		.addStringOption((option) =>
			option
				.setName("titre")
				.setDescription("Nom de l'élection")
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("candidats")
				.setDescription("Noms des candidats, séparés par des virgules")
				.setRequired(true),
		)
		.addIntegerOption((option) =>
			option
				.setName("nombre_de_votes")
				.setDescription("Nombre de votes par utilisateur (1 ou 2)")
				.setRequired(true)
				.addChoices({ name: "1", value: 1 }, { name: "2", value: 2 }),
		)
		.addRoleOption((option) =>
			option
				.setName("role")
				.setDescription("Rôle des utilisateurs autorisés à voter")
				.setRequired(true),
		),
	new SlashCommandBuilder()
		.setName("endelection")
		.setDescription("Termine l'élection en cours et affiche les résultats"),
	new SlashCommandBuilder()
		.setName("historique")
		.setDescription("Affiche l'historique des votes (anonymisé)"),
	new SlashCommandBuilder()
		.setName("nonvotants")
		.setDescription("Affiche la liste des personnes qui n'ont pas encore voté"),
	new SlashCommandBuilder()
		.setName("relance")
		.setDescription("Mentionne chaque personne qui n'a pas encore voté"),
	new SlashCommandBuilder()
		.setName("social_credit")
		.setDescription("Vérifie le crédit social de l'utilisateur mentionné")
		.addUserOption((option) =>
			option
				.setName("utilisateur")
				.setDescription("Utilisateur à tracker")
				.setRequired(true),
		),
	new SlashCommandBuilder()
		.setName("vote_mute")
		.setDescription("Lance un vote pour muter un utilisateur")
		.addUserOption((option) =>
			option
				.setName("utilisateur")
				.setDescription("Utilisateur à potentiellement muter")
				.setRequired(true)
		)
		.addIntegerOption((option) =>
			option
				.setName("duree")
				.setDescription("Durée du sondage en minutes")
				.setRequired(false)
		),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(
	process.env.DISCORD_BOT_TOKEN,
);

(async () => {
	try {
		console.log("Début du rafraîchissement des commandes.");
		await rest.put(
			Routes.applicationGuildCommands(
				process.env.CLIENT_ID,
				process.env.GUILD_ID,
			),
			{ body: guildCommands },
		);
		console.log("Les commandes de serveur ont été enregistrées avec succès.");
	} catch (error) {
		console.error(error);
	}
})();

client.once("ready", () => {
	console.log(`Connecté en tant que ${client.user.tag}`);
	client.user.setPresence({
		activities: [{ name: `Version ${process.env.BOT_VERSION}` }],
		status: "online",
	});

	getAllMessages(client);

	try {
		sendNewGrades(client);
	} catch (e) {
		console.err("error checking for new grades");
		console.error(e);
	}

	const TEN_MINUTES_MILLISECONDS = 600000;
	setInterval(() => {
		try {
			sendNewGrades(client);
		} catch (e) {
			console.err("error checking for new grades");
			console.error(e);
		}
	}, TEN_MINUTES_MILLISECONDS);
});

client.on("interactionCreate", async (interaction) => {
	try {
		if (interaction.isChatInputCommand()) {
			const { commandName } = interaction;
			switch (commandName) {
				case "startelection":
					await handleStartElection(interaction);
					break;
				case "endelection":
					await handleEndElection(interaction);
					break;
				case "historique":
					await handleHistorique(interaction);
					break;
				case "nonvotants":
					await handleNonVotants(interaction);
					break;
				case "relance":
					await handleRelance(interaction);
					break;
				case "social_credit":
					await handleSocialCredit(interaction);
					break;
				case "vote_mute":
					await handleVoteMute(interaction);
					break;
				default:
					await interaction.reply({
						content: "Commande inconnue.",
						ephemeral: true,
					});
					break;
			}
		} else if (interaction.isButton()) {
			const customId = interaction.customId;
			if (customId.startsWith('mute_')) {
				await handleMuteVoteButton(interaction);
			} else {
				switch (customId) {
					case "start_vote":
						await handleStartVote(interaction);
						break;
					case "confirm_vote":
						await handleConfirmVote(interaction);
						break;
					case "cancel_vote":
						await handleCancelVote(interaction);
						break;
					default:
						await interaction.reply({
							content: "Action inconnue.",
							ephemeral: true,
						});
						break;
				}
			}
		} else if (interaction.isStringSelectMenu()) {
			const customId = interaction.customId;
			switch (customId) {
				case "vote_menu":
					await handleVoteMenu(interaction);
					break;
				default:
					await interaction.reply({
						content: "Menu inconnu.",
						ephemeral: true,
					});
					break;
			}
		}
	} catch (error) {
		console.error("Erreur lors du traitement de l'interaction :", error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content:
					"Une erreur est survenue lors du traitement de votre interaction.",
			});
		} else {
			await interaction.reply({
				content:
					"Une erreur est survenue lors du traitement de votre interaction.",
				ephemeral: true,
			});
		}
	}
});

client.on("messageCreate", async (message) => {
	if (message.author.bot) return;

	storeMessage(message, client);
})

async function handleNonVotants(interaction) {
	if (
		!interaction.guild ||
		!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
	) {
		await interaction.reply({
			content: "Vous n'avez pas les permissions pour exécuter cette commande.",
			ephemeral: true,
		});
		return;
	}

	if (electionData.candidates.length === 0) {
		await interaction.reply({
			content: "Aucune élection en cours.",
			ephemeral: true,
		});
		return;
	}

	const membersWhoHaveNotVoted = [...electionData.eligibleMembers].filter(
		(userId) => !electionData.usersWhoVoted.has(userId),
	);

	if (membersWhoHaveNotVoted.length === 0) {
		await interaction.reply({
			content: "Tous les membres éligibles ont voté.",
			ephemeral: true,
		});
		return;
	}

	const memberNames = membersWhoHaveNotVoted.map((userId) => `<@${userId}>`);

	const list = memberNames.join("\n");

	const embed = new EmbedBuilder()
		.setTitle("Membres n'ayant pas voté")
		.setDescription(list)
		.setColor(0xff0000);

	await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRelance(interaction) {
	if (
		!interaction.guild ||
		!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
	) {
		await interaction.reply({
			content: "Vous n'avez pas les permissions pour exécuter cette commande.",
			ephemeral: true,
		});
		return;
	}

	if (electionData.candidates.length === 0) {
		await interaction.reply({
			content: "Aucune élection en cours.",
			ephemeral: true,
		});
		return;
	}

	const membersWhoHaveNotVoted = [...electionData.eligibleMembers].filter(
		(userId) => !electionData.usersWhoVoted.has(userId),
	);

	if (membersWhoHaveNotVoted.length === 0) {
		await interaction.reply({
			content: "Tous les membres éligibles ont voté.",
			ephemeral: true,
		});
		return;
	}

	const mentions = membersWhoHaveNotVoted
		.map((userId) => `<@${userId}>`)
		.join(" ");

	await interaction.reply({
		content: `Les membres suivants n'ont pas encore voté : ${mentions}`,
		allowedMentions: { users: membersWhoHaveNotVoted },
	});
}

async function handleStartElection(interaction) {
	if (
		!interaction.guild ||
		!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
	) {
		await interaction.reply({
			content: "Vous n'avez pas les permissions pour exécuter cette commande.",
			ephemeral: true,
		});
		return;
	}

	const candidatesInput = interaction.options.getString("candidats");
	const electionTitle = interaction.options.getString("titre");
	const votesPerUser = interaction.options.getInteger("nombre_de_votes");
	const role = interaction.options.getRole("role");

	const candidates = candidatesInput
		.split(",")
		.map((c) => c.trim())
		.filter((c) => c);
	if (candidates.length < 2 || candidates.length > 25) {
		await interaction.reply({
			content: "Vous devez entrer entre 2 et 25 candidats.",
			ephemeral: true,
		});
		return;
	}

	await interaction.deferReply({ ephemeral: true });

	const guild = await client.guilds.fetch(process.env.GUILD_ID);
	await guild.members.fetch();
	const roleMembers = await guild.roles
		.fetch(role.id)
		.then((role) => role.members);
	if (roleMembers.size === 0) {
		await interaction.editReply({
			content: "Le rôle spécifié ne contient aucun membre.",
			ephemeral: true,
		});
		return;
	}

	electionData.candidates = candidates;
	electionData.votes = {};
	candidates.forEach((candidate) => {
		electionData.votes[candidate] = 0;
	});
	electionData.usersWhoVoted.clear();
	electionData.votesPerUser = votesPerUser;
	electionData.roleId = role.id;
	electionData.eligibleMembers = new Set(roleMembers.keys());
	electionData.voteHistory = [];
	electionData.pendingVotes = {};
	electionData.announcementChannelId = interaction.channel.id;

	const electionMode =
		votesPerUser === 1 ? "1 candidat par bulletin" : "2 candidats par bulletin";
	const candidateList = candidates.map((c) => `- ${c}`).join("\n");

	const embed = new EmbedBuilder()
		.setTitle(electionTitle)
		.setDescription(`Une élection a été lancée pour le rôle <@&${role.id}>.

**Mode d'élection** : ${electionMode}
**Nombre d'électeurs** : ${electionData.eligibleMembers.size}

**Candidats :** 
${candidateList}`)
		.setColor(0x00ae86)
		.setFooter({ text: `Votes : 0/${electionData.eligibleMembers.size}` });

	const voteButton = new ButtonBuilder()
		.setCustomId("start_vote")
		.setLabel("Voter")
		.setStyle(ButtonStyle.Primary);

	const buttonRow = new ActionRowBuilder().addComponents(voteButton);

	const announcementMessage = await interaction.channel.send({
		embeds: [embed],
		components: [buttonRow],
	});
	electionData.announcementMessageId = announcementMessage.id;

	await interaction.deleteReply();
}

async function handleEndElection(interaction) {
	if (
		!interaction.guild ||
		!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
	) {
		await interaction.reply({
			content: "Vous n'avez pas les permissions pour exécuter cette commande.",
			ephemeral: true,
		});
		return;
	}

	if (electionData.candidates.length === 0) {
		await interaction.reply({
			content: "Aucune élection en cours à terminer.",
			ephemeral: true,
		});
		return;
	}

	const channel = await client.channels.fetch(
		electionData.announcementChannelId,
	);
	await endElection(channel);
	await interaction.reply({
		content: "Élection terminée manuellement. Les résultats ont été publiés.",
		ephemeral: true,
	});
}

async function handleHistorique(interaction) {
	if (
		!interaction.guild ||
		!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
	) {
		await interaction.reply({
			content: "Vous n'avez pas les permissions pour exécuter cette commande.",
			ephemeral: true,
		});
		return;
	}

	if (electionData.voteHistory.length === 0) {
		await interaction.reply({
			content: "Aucun vote n'a été enregistré pour cette élection.",
			ephemeral: true,
		});
		return;
	}

	const historyMessages = electionData.voteHistory
		.map((vote, index) => {
			const date = new Date(vote.timestamp).toLocaleString();
			const candidates = vote.choices.map((c) => `**${c}**`).join(", ");
			return `Vote ${index + 1} - ${date} : ${candidates}`;
		})
		.join("\n");

	const embed = new EmbedBuilder()
		.setTitle("Historique des votes")
		.setDescription(historyMessages)
		.setColor(0x00ae86);

	await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStartVote(interaction) {
	if (!electionData.eligibleMembers.has(interaction.user.id)) {
		await interaction.reply({
			content: "Vous n'êtes pas autorisé à voter dans cette élection.",
			ephemeral: true,
		});
		return;
	}

	if (electionData.usersWhoVoted.has(interaction.user.id)) {
		await interaction.reply({
			content: "Vous avez déjà voté.",
			ephemeral: true,
		});
		return;
	}

	if (electionData.candidates.length === 0) {
		await interaction.reply({
			content: "Aucune élection en cours.",
			ephemeral: true,
		});
		return;
	}

	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId("vote_menu")
		.setPlaceholder("Sélectionnez votre(vos) candidat(s)")
		.addOptions(
			electionData.candidates.map((candidate) => ({
				label: candidate,
				value: candidate,
			})),
		)
		.setMinValues(electionData.votesPerUser)
		.setMaxValues(electionData.votesPerUser);

	const row = new ActionRowBuilder().addComponents(selectMenu);

	await interaction.reply({
		content: "Veuillez sélectionner votre(vos) candidat(s) ci-dessous :",
		components: [row],
		ephemeral: true,
	});
}

async function handleConfirmVote(interaction) {
	if (
		!electionData.pendingVotes ||
		!electionData.pendingVotes[interaction.user.id]
	) {
		await interaction.reply({
			content: "Aucun vote en attente de confirmation.",
			ephemeral: true,
		});
		return;
	}

	const pendingVote = electionData.pendingVotes[interaction.user.id];
	const choices = pendingVote.choices;

	choices.forEach((candidate) => {
		electionData.votes[candidate]++;
	});

	electionData.usersWhoVoted.add(interaction.user.id);
	electionData.voteHistory.push({
		choices,
		timestamp: pendingVote.timestamp,
	});

	delete electionData.pendingVotes[interaction.user.id];

	await interaction.update({
		content: "Votre vote a été enregistré. Merci !",
		embeds: [],
		components: [],
		ephemeral: true,
	});

	await updateAnnouncement();

	if (electionData.usersWhoVoted.size === electionData.eligibleMembers.size) {
		const channel = await client.channels.fetch(
			electionData.announcementChannelId,
		);
		await endElection(channel);
	}
}

async function handleCancelVote(interaction) {
	if (
		!electionData.pendingVotes ||
		!electionData.pendingVotes[interaction.user.id]
	) {
		await interaction.reply({
			content: "Aucun vote en attente d'annulation.",
			ephemeral: true,
		});
		return;
	}

	delete electionData.pendingVotes[interaction.user.id];

	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId("vote_menu")
		.setPlaceholder("Sélectionnez votre(vos) candidat(s)")
		.addOptions(
			electionData.candidates.map((candidate) => ({
				label: candidate,
				value: candidate,
			})),
		)
		.setMinValues(electionData.votesPerUser)
		.setMaxValues(electionData.votesPerUser);

	const row = new ActionRowBuilder().addComponents(selectMenu);

	await interaction.update({
		content: "Veuillez sélectionner votre(vos) candidat(s) ci-dessous :",
		embeds: [],
		components: [row],
		ephemeral: true,
	});
}

async function handleVoteMenu(interaction) {
	if (!electionData.eligibleMembers.has(interaction.user.id)) {
		await interaction.reply({
			content: "Vous n'êtes pas autorisé à voter dans cette élection.",
			ephemeral: true,
		});
		return;
	}

	if (electionData.usersWhoVoted.has(interaction.user.id)) {
		await interaction.reply({
			content: "Vous avez déjà voté.",
			ephemeral: true,
		});
		return;
	}

	const choices = interaction.values;

	if (choices.length !== electionData.votesPerUser) {
		await interaction.reply({
			content: `Vous devez sélectionner exactement ${electionData.votesPerUser} candidat(s).`,
			ephemeral: true,
		});
		return;
	}

	const confirmButton = new ButtonBuilder()
		.setCustomId("confirm_vote")
		.setLabel("Confirmer")
		.setStyle(ButtonStyle.Success);

	const cancelButton = new ButtonBuilder()
		.setCustomId("cancel_vote")
		.setLabel("Annuler")
		.setStyle(ButtonStyle.Danger);

	const buttonRow = new ActionRowBuilder().addComponents(
		confirmButton,
		cancelButton,
	);

	const embed = new EmbedBuilder()
		.setTitle("Confirmation du vote")
		.setDescription(
			`Vous avez sélectionné : ${choices.map((c) => `**${c}**`).join(", ")}\n\nCliquez sur **Confirmer** pour valider votre vote ou sur **Annuler** pour revenir en arrière.`,
		)
		.setColor(0x00ae86);

	await interaction.update({
		embeds: [embed],
		components: [buttonRow],
		ephemeral: true,
	});

	electionData.pendingVotes[interaction.user.id] = {
		choices,
		timestamp: Date.now(),
	};
}

async function modifyAndEndAnnouncement(options) {
	try {
		if (
			!electionData.announcementMessageId ||
			!electionData.announcementChannelId
		)
			return;

		const channel = await client.channels.fetch(
			electionData.announcementChannelId,
		);
		const message = await channel.messages.fetch(
			electionData.announcementMessageId,
		);

		const currentVotes = electionData.usersWhoVoted.size;
		const totalVotes = electionData.eligibleMembers.size;

		const embed = message.embeds[0];

		const updatedEmber = EmbedBuilder.from(embed)
			.setDescription(
				"L'élection est terminée. Les résultats sont affichés ci-dessous.",
			)
			.setFooter({ text: `Votes : ${currentVotes}/${totalVotes}` });

		await message.edit({ embeds: [updatedEmber], components: [] });
	} catch (error) {
		console.error("Erreur lors de la mise à jour de l'annonce :", error);
	}
}

async function updateAnnouncement() {
	try {
		if (
			!electionData.announcementMessageId ||
			!electionData.announcementChannelId
		)
			return;

		const channel = await client.channels.fetch(
			electionData.announcementChannelId,
		);
		const message = await channel.messages.fetch(
			electionData.announcementMessageId,
		);

		const embed = message.embeds[0];

		const currentVotes = electionData.usersWhoVoted.size;
		const totalVotes = electionData.eligibleMembers.size;

		const updatedEmbed = EmbedBuilder.from(embed).setFooter({
			text: `Votes : ${currentVotes}/${totalVotes}`,
		});

		await message.edit({
			embeds: [updatedEmbed],
			components: message.components,
		});
	} catch (error) {
		console.error("Erreur lors de la mise à jour de l'annonce :", error);
	}
}

async function endElection(channel) {
	const totalVotesCount = Object.values(electionData.votes).reduce(
		(a, b) => a + b,
		0,
	);
	const results = Object.entries(electionData.votes)
		.map(
			([candidate, votes]) =>
				`**${candidate}** - ${votes} vote(s) (${totalVotesCount > 0 ? Math.round((votes / totalVotesCount) * 100) : 0}%)`,
		)
		.join("\n");

	const embed = new EmbedBuilder()
		.setTitle("Résultats de l'élection")
		.setDescription(results)
		.setColor(0x00ae86);

	await channel.send({ embeds: [embed] });

	await modifyAndEndAnnouncement();

	// reset election data
	Object.assign(electionData, {
		candidates: [],
		votes: {},
		usersWhoVoted: new Set(),
		votesPerUser: 1,
		roleId: null,
		eligibleMembers: new Set(),
		voteHistory: [],
		pendingVotes: {},
		announcementMessageId: null,
		announcementChannelId: null,
	});
}

client.login(process.env.DISCORD_BOT_TOKEN);
