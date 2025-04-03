import {
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    EmbedBuilder,

} from "discord.js";

// Structure pour stocker les données des votes de mute
const muteVotes = new Map();
let clientInstance = null;

// Fonction pour initialiser le client
export function initVoteMute(client) {
    clientInstance = client;
}

export async function handleVoteMute(interaction) {
    const targetUser = interaction.options.getUser("utilisateur");
    const targetMember = await interaction.guild.members.fetch(targetUser.id);
    if (!targetMember) {
        await interaction.reply({
            content: "Utilisateur introuvable.",
            ephemeral: true,
        });
        return;
    }
    // Récupérer la durée du sondage (par défaut: 1 minute)
    const pollDuration = (interaction.options.getInteger("duree") || 1) * 60000;

    // Vérifier si un vote est déjà en cours pour cet utilisateur
    if (muteVotes.has(targetUser.id)) {
        await interaction.reply({
            content: `Un vote pour muter ${targetUser.username} est déjà en cours.`,
            ephemeral: true,
        });
        return;
    }

    // Créer un nouvel objet pour stocker les votes
    const voteData = {
        yes: new Set(),
        no: new Set(),
        initiator: interaction.user.id,
        endTime: Date.now() + pollDuration,
        messageId: null,
        channelId: interaction.channelId
    };

    muteVotes.set(targetUser.id, voteData);

    // Créer les boutons pour voter
    const yesButton = new ButtonBuilder()
        .setCustomId(`mute_yes_${targetUser.id}`)
        .setLabel("Oui")
        .setStyle(ButtonStyle.Success);

    const noButton = new ButtonBuilder()
        .setCustomId(`mute_no_${targetUser.id}`)
        .setLabel("Non")
        .setStyle(ButtonStyle.Danger);

    const buttonRow = new ActionRowBuilder().addComponents(yesButton, noButton);

    // Créer l'embed pour le sondage
    const embed = new EmbedBuilder()
        .setTitle(`Vote pour muter ${targetUser.username}`)
        .setDescription(`Voulez-vous muter ${targetUser} pendant 2 minutes?`)
        .setColor(0xFF9900)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: 'Oui', value: '0', inline: true },
            { name: 'Non', value: '0', inline: true }
        )
        .setFooter({ text: `Le vote se termine dans ${pollDuration / 60000} minute(s)` });

    // Envoyer le message du sondage
    const message = await interaction.reply({
        embeds: [embed],
        components: [buttonRow],
        fetchReply: true
    });

    voteData.messageId = message.id;

    // Configurer le timer pour terminer le vote
    setTimeout(() => endMuteVote(targetUser.id), pollDuration);
}

// Ajouter ces gestionnaires au switch dans la section isButton de l'interactionCreate
export async function handleMuteVoteButton(interaction) {
    const [action, vote, userId] = interaction.customId.split('_');

    if (action !== 'mute' || !['yes', 'no'].includes(vote) || !userId) {
        return;
    }

    const voteData = muteVotes.get(userId);
    if (!voteData) {
        await interaction.reply({
            content: "Ce vote n'existe plus.",
            ephemeral: true
        });
        return;
    }

    // Empêcher les doubles votes
    if (voteData.yes.has(interaction.user.id) || voteData.no.has(interaction.user.id)) {
        await interaction.reply({
            content: "Vous avez déjà voté pour ce sondage.",
            ephemeral: true
        });
        return;
    }

    // Enregistrer le vote
    voteData[vote].add(interaction.user.id);


    // Mettre à jour l'embed
    try {
        const channel = await clientInstance.channels.fetch(voteData.channelId);
        const message = await channel.messages.fetch(voteData.messageId);

        const embed = EmbedBuilder.from(message.embeds[0]);
        embed.setFields(
            { name: 'Oui', value: voteData.yes.size.toString(), inline: true },
            { name: 'Non', value: voteData.no.size.toString(), inline: true }
        );

        await message.edit({ embeds: [embed] });

        await interaction.reply({
            content: `Votre vote (${vote === 'yes' ? 'Oui' : 'Non'}) a été enregistré.`,
            ephemeral: true
        });
    } catch (error) {
        console.error("Erreur lors de la mise à jour du vote de mute:", error);
    }
}

export async function endMuteVote(userId) {
    const voteData = muteVotes.get(userId);
    if (!voteData) return;

    try {
        const channel = await clientInstance.channels.fetch(voteData.channelId);
        const message = await channel.messages.fetch(voteData.messageId);
        const guild = channel.guild;
        const targetMember = await guild.members.fetch(userId);

        const embed = EmbedBuilder.from(message.embeds[0]);

        // Vérifier les résultats
        const yesVotes = voteData.yes.size;
        const noVotes = voteData.no.size;
        let result;

        if (yesVotes > noVotes) {
            // Mute l'utilisateur
            try {
                await targetMember.timeout(120000, "Mute par vote de la communauté");
                result = `**Résultat:** ${targetMember.user.username} a été mute pendant 2 minutes (Oui: ${yesVotes}, Non: ${noVotes})`;
            } catch (error) {
                console.error("Erreur lors du mute:", error);
                result = `**Résultat:** Impossible de muter ${targetMember.user.username} (Oui: ${yesVotes}, Non: ${noVotes})`;
            }
        } else if (noVotes >= yesVotes) {
            result = `**Résultat:** ${targetMember.user.username} ne sera pas mute (Oui: ${yesVotes}, Non: ${noVotes})`;
        }

        // Mettre à jour l'embed avec les résultats
        embed.setDescription(result);
        embed.setColor(yesVotes > noVotes ? 0xFF0000 : 0x00FF00);
        embed.setFooter({ text: "Vote terminé" });

        await message.edit({
            embeds: [embed],
            components: [] // Supprimer les boutons
        });
    } catch (error) {
        console.error("Erreur lors de la fin du vote de mute:", error);
    }

    // Supprimer le vote de la Map
    muteVotes.delete(userId);
}