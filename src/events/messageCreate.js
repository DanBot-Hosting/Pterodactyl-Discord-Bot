const Discord = require("discord.js");
const Chalk = require("chalk");
const fs = require('fs');
const path = require('path');

const cap = require("../util/cap");
const Config = require('../../config.json');
const MiscConfigs = require('../../config/misc-configs.js');
const { Sentry } = require('../../index.js');

const categoriesPath = path.join(__dirname, '../commands');
const categories = new Set(
    fs.readdirSync(categoriesPath).filter(x => fs.statSync(path.join(categoriesPath, x)).isDirectory())
);

/**
 * 
 * @param {Discord.Client} client 
 * @param {Discord.Message} message 
 * @returns void
 */
module.exports = async (client, message) => {

    // Add reactions to suggestion channels.
    if (MiscConfigs.suggestionChannels.some((channel) => channel == message.channel.id)) {
        if (!message.content.startsWith(">")) {
            await message.react("👍");
            await message.react("👎");
        }
    }

    // Staff that can invoke the bot for DMs.
    if (message.channel.type === Discord.ChannelType.DM) {
        // Allow users to send messages on behalf of the bot if they are allowed
        if (MiscConfigs.dmAllowedUsers.includes(message.author.id)) {
            const args = message.content.trim().split(/ +/g);

            try {
                const msg = await client.channels.cache
                    .get(args[0])
                    .send(cap(message.content.split(" ").slice(1).join(" "), 2000));
                message.reply(msg.url);
            } catch (err) {
                message.channel.send({content: `\`\`\`${err.message}\`\`\``});
            }
        }
    };

    if (message.author.bot) return; // Stop bots from running commands.
    if (message.channel.type === Discord.ChannelType.DM) return; // Stop commands in DMs.

    const prefix = Config.DiscordBot.Prefix;
    if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const commandargs = message.content.split(" ").slice(1).join(" ");
    const command = args.shift().toLowerCase();

    console.log(
        Chalk.magenta("[DISCORD] ") +
            Chalk.yellow(
                `[${message.author.username}] [${message.author.id}] >> ${prefix}${command} ${commandargs}`,
            ),
    );

    try {

        // Checks if the command is allowed in the channel or category.
        // Staff bypass channel requirements.
        if (
            !MiscConfigs.allowedChannels.includes(message.channel.id) &&                            // Channel is not present in allowedChannels.
            !MiscConfigs.allowedCategories.includes(message.channel.parentID) &&                    // Channel is not in allowed category.
            !message.member.roles.cache.find((x) => x.id === Config.DiscordBot.Roles.Staff) &&      // Making sure the user isn't staff.
            !message.member.roles.cache.find((x) => x.id === Config.DiscordBot.Roles.BotAdmin)      // Making sure the user isn't a bot Administrator.
        ) return;

        if (categories.has(command)) {
            if (!args[0]) {
                const helpFilePath = path.join(__dirname, `../commands/${command}/help.js`);
                try {
                    let commandFile = require(helpFilePath);
                    await commandFile.run(client, message, args);
                } catch (e) {
                    if (e.code === 'MODULE_NOT_FOUND') message.reply("Help command not found.");
                    else throw e;
                }
            } else {
                const commandFilePath = path.join(__dirname, `../commands/${command}/${args[0]}.js`);
                try {
                    let commandFile = require(commandFilePath);
                    await commandFile.run(client, message, args);
                } catch (e) {
                    if (e.code === 'MODULE_NOT_FOUND') message.reply("Sub-command not found.");
                    else throw e;
                }
            }
        } else {
            const commandFilePath = path.join(__dirname, `../commands/${command}.js`);
            try {
                let commandFile = require(commandFilePath);
                await commandFile.run(client, message, args);
            } catch (e) {
                if (e.code === 'MODULE_NOT_FOUND') await message.reply("Command not found.").catch(Error => {});
                else throw e;
            }
        }
    } catch (Error) {
        Sentry.captureException(Error);
    }
};