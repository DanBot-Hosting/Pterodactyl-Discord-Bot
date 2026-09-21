const Discord = require("discord.js");
const Axios = require("axios");

const generatePassword = require("../../util/generatePassword.js");
const sendMail = require('../../util/sendEmail.js');
const Config = require('../../../config.json');
const db = require('../../database.js');


exports.description = "Resets the password for the linked console account.";

/**
 * User password command. Resets the password for the linked console account.
 *
 * @param {Discord.Client} client
 * @param {Discord.Message} message
 * @param {Array} args
 * @returns void
 */
exports.run = async (client, message, args) => {
    //Generates a 16 digit random password.
    const password = await generatePassword();

    //Gets the user's data.
    const userAccount = await db.getUserData(message.author.id);

    if (userAccount == null) {
        message.reply("You do not have a console account linked with your discord account.");
        return;
    }

    //This Axios requests gets the initial details of the user account.
    await Axios({
        url: Config.Pterodactyl.hosturl + "/api/application/users/" + userAccount.consoleID,
        method: "GET",
        followRedirect: true,
        maxRedirects: 5,
        headers: {
            Authorization: "Bearer " + Config.Pterodactyl.apikey,
            "Content-Type": "application/json",
            Accept: "Application/vnd.pterodactyl.v1+json",
        },
    }).then((Fetch) => {
        //This data object is used to update the user account with the new password.
        const data = {
            email: Fetch.data.attributes.email,
            username: Fetch.data.attributes.username,
            first_name: Fetch.data.attributes.first_name,
            last_name: Fetch.data.attributes.last_name,
            password: password,
        };

        //This Axios request updates the user account with the new password.
        Axios({
            url: Config.Pterodactyl.hosturl + "/api/application/users/" + userAccount.consoleID,
            method: "PATCH",
            followRedirect: true,
            maxRedirects: 5,
            headers: {
                Authorization: "Bearer " + Config.Pterodactyl.apikey,
                "Content-Type": "application/json",
                Accept: "Application/vnd.pterodactyl.v1+json",
            },
            data: data,
        })
            .then(async (Response) => {
                //Sends the user a direct message containing their new password.
                client.users.cache
                    .get(message.author.id)
                    .send(`New password for DanBot Hosting: ||**${data.password}**||`).catch((Error) => console.log("[PASSWORD RESET] User does not have direct messages enabled."));

                //Formatting the email message.
                const EmailMessage = {
                    from: Config.Email.From,
                    to: data.email,
                    subject: "DanBot Hosting - Password Reset From Discord Bot",
                    html:
                        "Hello " + data.first_name + ",\n\n" +
                        "You have requested a password reset through the Discord bot.\n\n" +
                        "Panel Account Email:" + data.email + "\n" +
                        "Panel Account Username:" + data.username + "\n" +
                        "Panel Account Password:" + data.password + "\n" +
                        "Please keep this information safe and secure.\n\n" +

                        "If you did not request this password reset, please contact support immediately through Discord."
                };

                //The password has already been changed, so a failed email is reported
                //rather than treated as a failed reset.
                let EmailNotice = "An email has also been sent to your email connected to the console account.";

                try {
                    await sendMail(data.email, "DanBot Hosting - Password Reset From Discord Bot", EmailMessage.html);
                } catch (Error) {
                    console.log("[PASSWORD RESET] Email could not be sent: " + (Error.userMessage || Error.message));

                    EmailNotice =
                        "**The confirmation email could not be sent.** " +
                        (Error.userMessage || "The email service is currently unavailable.") + "\n" +
                        "Your password has still been reset, so please make sure you save the password from your direct messages.";
                }

                const Embed = new Discord.EmbedBuilder();
                Embed.setColor("Blue");
                Embed.setTitle("Password Reset Success");
                Embed.setDescription(
                    "The console account that is linked with the discord account has now been reset.\n" +
                    "Please check direct messages for the password. If you didn't recieve a message, you do not have direct messages enabled for this server.\n\n" +
                    EmailNotice
                );

                message.reply({embeds: [Embed]});
            }).catch((err) => {
                console.error(err.message);
            });
    }).catch((Error) => {
        if(Error.statusCode == 404) {
            message.channel.send("The account linked to your Discord account does not exist.\n\nUnlink your account using `" + Config.DiscordBot.Prefix + "user unlink` command.");
        };
    })
};
