const Discord = require("discord.js");
const Chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const { Sentry } = require("../../index.js");

const slashCommands = new Map();
fs.readdirSync(path.join(__dirname, "../slashCommands"))
    .filter((f) => f.endsWith(".js"))
    .forEach((f) => {
        const command = require(`../slashCommands/${f}`);
        slashCommands.set(command.data.name, command);
    });

/**
 * @param {Discord.Client} client
 * @param {Discord.Interaction} interaction
 */
module.exports = async (client, interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = slashCommands.get(interaction.commandName);
    if (!command) return;

    console.log(
        Chalk.magenta("[DISCORD] ") +
            Chalk.yellow(`[${interaction.user.username}] [${interaction.user.id}] >> /${interaction.commandName}`),
    );

    try {
        await command.run(client, interaction);
    } catch (Error) {
        Sentry.captureException(Error);
        console.error(Chalk.red("[SLASH COMMAND] ") + Error);

        const reply = { content: "An error occurred while running this command.", flags: Discord.MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
    }
};
