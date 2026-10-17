const Discord = require("discord.js");
const Config = require('../../config.json');
const db = require('../database.js');

exports.data = new Discord.SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Privately shows the panel account information linked to your Discord account.");

/**
 *
 * @param {Discord.Client} client
 * @param {Discord.ChatInputCommandInteraction} interaction
 * @returns void
 */
exports.run = async (client, interaction) => {
    const userAccount = await db.getUserData(interaction.user.id);

    if (userAccount == null) {
        return interaction.reply({
            content: `You do not have a panel account linked, please create or link an account.\n\`${Config.DiscordBot.Prefix}user new\` - Create an account\n\`${Config.DiscordBot.Prefix}user link\` - Link an account`,
            flags: Discord.MessageFlags.Ephemeral,
        });
    }

    const epoch = Math.round(userAccount.epoch_time ?? userAccount.epochTime ?? 0);

    const Embed = new Discord.EmbedBuilder()
        .setColor(`Green`)
        .setTitle("Your Linked Account")
        .setDescription(`**Note:** This information may be out of sync. Run \`${Config.DiscordBot.Prefix}user sync\` before running this command for the most up to date information.`)
        .addFields(
            { name: "__**Username**__", value: userAccount.username.toString(), inline: false },
            { name: "__**Email**__", value: userAccount.email.toString(), inline: false },
            { name: "__**Discord ID**__", value: (userAccount.discord_id ?? userAccount.discordID ?? "").toString(), inline: false },
            { name: "__**Console ID**__", value: (userAccount.console_id ?? userAccount.consoleID ?? "").toString(), inline: false },
            { name: "__**Date (YYYY/MM/DD)**__", value: (userAccount.link_date ?? userAccount.linkDate ?? "").toString(), inline: false },
            { name: "__**Time**__", value: (userAccount.link_time ?? userAccount.linkTime ?? "").toString(), inline: false },
            { name: "__**Linked At**__", value: "<t:" + epoch + ":f> (" + "<t:" + epoch + ":R>)", inline: false },
        )
        .setTimestamp()
        .setFooter({ text: client.user.displayName, iconURL: client.user.avatarURL() });

    await interaction.reply({ embeds: [Embed], flags: Discord.MessageFlags.Ephemeral });
};
