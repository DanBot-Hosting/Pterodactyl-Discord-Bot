const Discord = require("discord.js");
const Config = require('../../../config.json');
const MiscConfigs = require('../../../config/misc-configs.js');
const db = require('../../database.js');

exports.roleRequirement = Config.DiscordBot.Roles.BotAdmin;
exports.description = "Shows if an account is linked.";

/**
 * 
 * @param {Discord.Client} client
 * @param {Discord.Message} message
 * @param {Array} args
 * @returns void
 */
exports.run = async (client, message, args) => {
    if (!message.member.roles.cache.has(Config.DiscordBot.Roles.Admin)) return;

    if (args[1] == null) {
        await message.reply(
            "Please send a users discord ID to see if they are linked with an account on the host.",
        );
    } else {
        var userAccount = await db.getUserData(args[1].replace("<@", "").replace(">", "").replace("!", ""));

        if (userAccount == null) {
            await message.reply("That account is not linked with a console account.");
        } else {
            const Embed = new Discord.EmbedBuilder()
                .setColor(`Green`)
                .addFields(
                    { name: "__**Username**__", value: userAccount.username.toString(), inline: false },
                    { name: "__**Email**__", value: userAccount.email.toString(), inline: false },
                    { name: "__**Discord ID**__", value: (userAccount.discord_id ?? userAccount.discordID ?? "").toString(), inline: false },
                    { name: "__**Console ID**__", value: (userAccount.console_id ?? userAccount.consoleID ?? "").toString(), inline: false },
                    { name: "__**Date (YYYY/MM/DD)**__", value: (userAccount.link_date ?? userAccount.linkDate ?? "").toString(), inline: false },
                    { name: "__**Time**__", value: (userAccount.link_time ?? userAccount.linkTime ?? "").toString(), inline: false },
                    { name: "__**Linked At**__", value: "<t:" + Math.round(userAccount.epoch_time ?? userAccount.epochTime ?? 0) + ":f> (" + "<t:" + Math.round(userAccount.epoch_time ?? userAccount.epochTime ?? 0) + ":R>)", inline: false },
                )
                .setTimestamp()
                .setFooter({ text: client.user.displayName, iconURL: client.user.avatarURL() });

            await message.reply({content: "That account is linked. Heres some data: ", embeds: [Embed]});
        }
    }
};
