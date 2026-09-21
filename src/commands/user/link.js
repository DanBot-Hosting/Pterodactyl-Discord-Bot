const Discord = require('discord.js');

const Config = require('../../../config.json');
const MiscConfigs = require('../../../config/misc-configs.js');

const getUser = require("../../util/getUser.js");
const generateCode = require("../../util/generateCode.js");
const sendEmail = require("../../util/sendEmail.js");
const db = require('../../database.js');

exports.description = "Link your console account to your Discord account.";

/**
 * 
 * @param {Discord.Client} client 
 * @param {Discord.Message} message 
 * @param {Array} args 
 */
exports.run = async (client, message, args) => {

    // The user does not have a panel account linked and would like to link one.
    const user = await db.getUserData(message.author.id);
    if (user != null) {

        const AlreadyLinkedEmbed = new Discord.EmbedBuilder()
        .setColor(`Green`)
        .addFields(
            { name: `**__Username__**`, value: user.username || '' },
            { name: `**__Linked Date (YYYY-MM-DD)__**`, value: user.link_date ?? '' },
            { name: `**__Linked Time__**`, value: user.link_time ?? '' },
            { name: `**__Relative Time__**`, value: "<t:" + Math.round(user.epoch_time ?? 0) + ":f> (" + "<t:" + Math.round(user.epoch_time ?? 0) + ":R>)" },
        )
        .setTimestamp()
        .setFooter({text: client.user.username, iconUrl: client.user.avatarURL()});

        message.reply({content: "This account is linked!", embeds: [AlreadyLinkedEmbed]});
    } else {
        const server = message.guild;

        const channel = await server.channels.create({
            name: message.author.username,
            type: Discord.ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: message.author.id,
                    allow: [Discord.PermissionFlagsBits.ViewChannel, Discord.PermissionFlagsBits.SendMessages, Discord.PermissionFlagsBits.ReadMessageHistory]
                },
                {
                    id: server.id,
                    deny: [Discord.PermissionFlagsBits.ViewChannel]
                }
            ],
            reason: "User linking their account."
        });

        message.reply(`Please check <#${channel.id}> to link your account.`);

        const category = server.channels.cache.find((c) => c.id === MiscConfigs.accounts && c.type === Discord.ChannelType.GuildCategory);

        if (!category) throw new Error("Category channel does not exist");

        await channel.setParent(category, { lockPermissions: false });

        const InitialEmbed = new Discord.EmbedBuilder()
        .setColor("Blue")
        .setTitle("Please enter your account email address:")
        .setDescription("You have 2 minutes to respond.\n\nThis will take a few seconds to find your account.")
        .setFooter(
            { text: "You can type 'cancel' to cancel the request.", iconURL: client.user.avatarURL() }
        );

        const msg = await channel.send({content: message.author.toString(), embeds: [InitialEmbed]});

        const EmailCollector = new Discord.MessageCollector(
            msg.channel,
            {
                "max": 1, //Collect 1 message max.
                "time": 2 * 60 * 1000, //Gives the user 2 minutes to respond.
                "idle": 2 * 60 * 1000, //If the user is idle for 2 minutes, the collector will end.
                "filter": (m) => m.author.id === message.author.id, //Only collect messages from the initial command user.
            }
        );

        EmailCollector.on("collect", async (MessageCollected) => {

            await MessageCollected.delete();

            if (MessageCollected.content.toLocaleLowerCase() === "cancel") {

                const CancelEmbed = new Discord.EmbedBuilder();
                CancelEmbed.setColor("Red");
                CancelEmbed.setDescription("Request to link your account canceled.");
                CancelEmbed.setTimestamp();
                CancelEmbed.setFooter({text: "This channel will be deleted in 10 seconds."});

                await msg.edit({content: "You cancelled this request.", embeds: [CancelEmbed]}); //Edits the message to show the user the ticket was cancelled.

                //Stops the collector.
                await EmailCollector.stop();

                setTimeout(async () => {
                    //Deletes the channel after 10 seconds.
                    await channel.delete("User cancelled the request.");

                }, 10 * 1000); 
            } else {
                await EmailCollector.stop();
            }
        });

        EmailCollector.once("end", async (MessageCollected, Reason) => {

            if(MessageCollected.size > 0 && MessageCollected.first().content.toLocaleLowerCase() === "cancel") return; //Already being handled.
            
            const CancelEmbed = new Discord.EmbedBuilder();
            CancelEmbed.setColor("Red");
            CancelEmbed.setDescription("Request to link your account canceled.");
            CancelEmbed.setTimestamp();
            CancelEmbed.setFooter({text: "This channel will be deleted in 10 seconds."});

            // No messages were collected.
            if(MessageCollected.size === 0) {
                await msg.edit({ content: "You did not provide an email address in time.", embeds: [CancelEmbed] });

                setTimeout(async () => {
                    await msg.channel.delete("User did not provide an email address in time.");
                }, 10 * 1000);
            };

            // A single message was collected.
            if (MessageCollected.size == 1) {
                const Email = MessageCollected.first().content;

                await EmailVerification(Email);
            }
        });

        // Tells the user the mail server is unavailable and closes the channel.
        async function EmailUnavailable(Reason) {
            const ErrorEmbed = new Discord.EmbedBuilder();
            ErrorEmbed.setColor("Red");
            ErrorEmbed.setDescription(`${Reason}\n\nA verification code cannot be sent right now, so this request has been cancelled. Please try again later.`);
            ErrorEmbed.setTimestamp();
            ErrorEmbed.setFooter({text: "This channel will be deleted in 10 seconds."});

            await msg.edit({content: "Account linking is temporarily unavailable.", embeds: [ErrorEmbed]});

            setTimeout(async () => {
                await channel.delete("The email service is unavailable.");
            }, 10 * 1000);
        }

        // Now we process the email verification.
        async function EmailVerification(Email) {

            //Checked before the account lookup so an outage is reported the same way
            //whether or not the email belongs to an existing account.
            const EmailStatus = await sendEmail.verify();

            if (!EmailStatus.Ok) {
                console.error("[ACCOUNT LINKING] Email could not be sent: " + EmailStatus.Reason);

                await EmailUnavailable(EmailStatus.Reason);
                return;
            }

            let Users = null;

            try {
                Users = await getUser(Email);
            } catch (Error) {
                // Do Nothing.
            }

            // Panel was not able to return such data.
            if (Users == null){
                const ErrorEmbed = new Discord.EmbedBuilder();
                ErrorEmbed.setColor("Red");
                ErrorEmbed.setDescription("An error occurred while fetching your account. Please try again later.");
                ErrorEmbed.setTimestamp();
                ErrorEmbed.setFooter({text: "This channel will be deleted in 10 seconds."});

                await msg.edit({content: "An error occurred while fetching your account.", embeds: [ErrorEmbed]});

                setTimeout(async () => {
                    await channel.delete("An error occurred while fetching the account.");
                }, 10 * 1000);
                return;
            }
            
            const User = Users.data.find((usr) =>
                usr.attributes ? usr.attributes.email === Email : false,
            );

            const Code = generateCode(10);
            
            //This will not send the verification code, that's it.
            if (!User) {
                message.guild.channels.cache.get(MiscConfigs.accountLinked).send(`User ${message.author.username} (${message.author.id}) tried to link their account but the email was not found in the database.`);
            } else {
                try {
                    await sendEmail(
                        Email,
                        "DanBot Hosting - Account Linking Verification",
                        `Hello, ${message.author.username} (ID: ${message.author.id}) just tried to link their Discord account with this console email address. Here is a verification code that is needed to link: ${Code}`
                    );
                } catch (Error) {
                    console.error("[ACCOUNT LINKING] Email could not be sent: " + (Error.userMessage || Error.message));

                    await EmailUnavailable(Error.userMessage || "The email service is currently unavailable.");
                    return;
                }
            }

            const VerificationEmbed = new Discord.EmbedBuilder();
            VerificationEmbed.setColor("Blurple");
            VerificationEmbed.setDescription("If an account exists, a code was sent to your email address. You have 10 minutes to provide a code.");
            VerificationEmbed.setFooter({text: "You can type 'cancel' to cancel the request.", iconURL: await client.user.avatarURL({extension: 'png'})});
            VerificationEmbed.setTimestamp();

            await msg.edit({content: msg.content.toString(), embeds: [VerificationEmbed]});

            const VerificationCollector = new Discord.MessageCollector(
                msg.channel,
                {
                    "max": 1, //Collect 1 message max.
                    "time": 10 * 60 * 1000, //Gives the user 10 minutes to respond.
                    "idle": 10 * 60 * 1000, //If the user is idle for 10 minutes, the collector will end.
                    "filter": (m) => m.author.id === message.author.id, //Only collect messages from the initial command user.
                }
            );

            VerificationCollector.on("collect", async (MessageCollected) => {

                await MessageCollected.delete();

                if (MessageCollected.content.toLocaleLowerCase() === "cancel") {
        
                    const CancelEmbed = new Discord.EmbedBuilder();
                    CancelEmbed.setColor("Red");
                    CancelEmbed.setDescription("Request to link your account canceled.");
                    CancelEmbed.setTimestamp();
                    CancelEmbed.setFooter({text: "This channel will be deleted in 10 seconds."});
        
                    await msg.edit({content: "You cancelled this request.", embeds: [CancelEmbed]}); //Edits the message to show the user the ticket was cancelled.
        
                    //Stops the collector.
                    await VerificationCollector.stop();
        
                    setTimeout(async () => {
                        //Deletes the channel after 10 seconds.
                        await channel.delete("User cancelled the request.");
        
                    }, 10 * 1000); 
                } else {
                    VerificationCollector.stop();
                }        
            });

            VerificationCollector.once("end", async (MessageCollected, Reason) => {

                if(MessageCollected.size > 0 && MessageCollected.first().content.toLocaleLowerCase() === "cancel") return; //Already being handled.

                const CancelEmbed = new Discord.EmbedBuilder();
                CancelEmbed.setColor("Red");
                CancelEmbed.setDescription("Request to link your account canceled.");
                CancelEmbed.setTimestamp();
                CancelEmbed.setFooter({text: "This channel will be deleted in 10 seconds."});

                // No messages were collected.
                if(MessageCollected.size === 0) {
                    msg.edit({ content: "You did not provide an verification in time.", embed: CancelEmbed });
                };

                // A single message was collected.
                if (MessageCollected.size == 1) {
                    const ResponseCode = MessageCollected.first().content;

                    if (Code === ResponseCode) {
                        const timestamp = `${moment().format("HH:mm:ss")}`;
                        const datestamp = `${moment().format("DD-MM-YYYY")}`;

                        await db.setUserData(message.author.id, {
                            consoleID: User.attributes.id,
                            email: User.attributes.email,
                            username: User.attributes.username,
                            linkTime: timestamp,
                            linkDate: datestamp,
                            domains: [],
                            epochTime: (Date.now() / 1000)
                        });

                        const StaffLogs = new Discord.EmbedBuilder();
                        StaffLogs.setColor("Green");
                        StaffLogs.setTitle("Account Linked:");
                        StaffLogs.addFields(
                            { name: "**Linked Discord Account:**", value: `${message.author.toString()} - (${message.author.id})`, inline: false },
                            { name: `**Linked Console account email:**`, value: "`" + User.attributes.email + "`", inline: false },
                            { name: `**Linked At: (TIME / DATE)**`, value: `${timestamp} / ${datestamp}`, inline: false },
                            { name: `**Linked Console ID:**`, value: `${User.attributes.id}`, inline: false },
                            { name: `**Linked Time [BETA]**`, value: `<t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false }
                        ); 

                        const FinalEmbed = new Discord.EmbedBuilder();
                        FinalEmbed.setColor("Green");
                        FinalEmbed.setDescription("**Account linked! Channel deleting in 10 seconds.**");
                        FinalEmbed.setTimestamp();
                        FinalEmbed.setFooter({text: client.user.username, iconURL: await client.user.avatarURL({extension: 'png'})});

                        await msg.edit({embeds: [FinalEmbed]}).then(async () => {
                            await client.channels.cache.get(MiscConfigs.accountLinked).send({content: `<@${message.author.id}> linked their account. Here's some info: `, embeds: [StaffLogs]});

                            //Deletes the channel after 10 seconds.
                            setTimeout(async () => {
                                await channel.delete();
                            }, 10 * 1000)
                        });

                    } else {
                        const InvalidEmbed = new Discord.EmbedBuilder();
                        InvalidEmbed.setColor("Red");
                        InvalidEmbed.setDescription("The code you provided is incorrect. Account linking cancelled.");
                        InvalidEmbed.setTimestamp();
                        InvalidEmbed.setFooter({text: "This channel will be deleted in 10 seconds."});

                        msg.edit({content: "The code you provided is incorrect.", embeds: [InvalidEmbed]});

                        //Deletes the channel after 10 seconds.
                        setTimeout(async () => {
                            await channel.delete();
                        }, 10 * 1000)
                    }
                }
            });
        }
    }
}
