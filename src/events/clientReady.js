const Discord = require("discord.js");
const Chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const Util = require('util');
const execPromise = Util.promisify(exec);


const ServerStatus = require("../serverStatus.js");
const Config = require('../../config.json');
const MiscConfigs = require('../../config/misc-configs.js');

/**
 * @param {Discord.Client} client 
 */
module.exports = async (client) => {
    const guild = client.guilds.cache.get(Config.DiscordBot.MainGuildId);

    let checkNicks = () => {
        guild.members.cache
            .filter((member) => member.displayName.match(/^[a-z0-9]/i) == null)
            .forEach((x) => {
                x.setNickname("I love Dan <3");
            });
    };

    checkNicks();

    // Register slash commands to the main guild.
    try {
        const slashCommands = fs.readdirSync(path.join(__dirname, "../slashCommands"))
            .filter((f) => f.endsWith(".js"))
            .map((f) => require(`../slashCommands/${f}`).data.toJSON());

        await guild.commands.set(slashCommands);
        console.log(Chalk.magenta("[DISCORD] ") + Chalk.green(`Registered ${slashCommands.length} slash command(s).`));
    } catch (Error) {
        console.error(Chalk.red("[DISCORD] ") + Chalk.redBright("Failed to register slash commands: " + Error.message));
    }

    console.log(
        Chalk.magenta("[DISCORD] ") + Chalk.green(client.user.username + " has logged in!"),
    );

    // Cloes all accounts channels that are older than 30 minutes.
    guild.channels.cache
    .filter((x) => x.parentId === MiscConfigs.accounts && Date.now() - x.createdAt.getTime() > 30 * 60 * 1000)
    .forEach((x) => x.delete());

    //Automatic GitHub Update (30 seconds intervals).
    setInterval(async () => {
        try {
            const { stdout } = await execPromise('git pull');
    
            if (!stdout.includes("Already up to date.")) {
                await client.channels.cache
                    .get(MiscConfigs.github)
                    .send(
                        `<t:${Math.floor(Date.now() / 1000)}:f> Automatic update from GitHub, pulling files.\n\`\`\`${stdout}\`\`\``,
                    );
                setTimeout(() => {
                    process.exit();
                }, 5000);
            }
        } catch (Error) {
        }
    }, 30 * 1000);
    
    if (Config.Enabled.nodestatsChecker == true) {

        console.log(Chalk.magenta("[NODE CHECKER] ") + Chalk.greenBright("Enabled"));

        await ServerStatus.startNodeChecker(); //Start the Node Checker.
        ServerStatus.startCleanupTask(); //Cleanup stale DB entries on startup and every 24h.

        // Node Status Embed.
        const channel = client.channels.cache.get(MiscConfigs.nodestatus);

        try {
            setInterval(async () => {
                const embed = await ServerStatus.getEmbed();

                let messages = await channel.messages.fetch({
                    limit: 10,
                }).catch((Error) => {});

                messages = messages.filter((x) => x.author.id === client.user.id).last();

                if (messages == null) channel.send({embeds: [embed]});
                else messages.edit({embeds: [embed]});
            }, 30 * 1000);
        } catch (Error) {
            console.error(Chalk.red("[NODE CHECKER] ") + Chalk.redBright("Error while sending embed: " + Error.message));
        }
    } else {
        console.log(Chalk.magenta("[NODE CHECKER] ") + Chalk.redBright("Disabled"));
    }
};
