const Discord = require('discord.js');
const axios = require("axios");
const validator = require("validator");

const Config = require('../../../config.json');
const MiscConfigs = require('../../../config/misc-configs.js');

const generatePassword = require('../../util/generatePassword.js');
const generateCode = require('../../util/generateCode.js');
const sendMail = require('../../util/sendEmail.js');
const db = require('../../database.js');

exports.description = "Create a new panel account.";

/**
 * 
 * @param {Discord.Client} client 
 * @param {Discord.Message} message 
 * @param {Array} args 
 * @returns void
 */
exports.run = async (client, message, args) => {
    //return message.reply("User account creation is now disabled via the bot. Do not create a ticket. See this announcement: https://discord.com/channels/639477525927690240/898050443446464532/1376647936884080742");

    const userAccount = await db.getUserData(message.author.id);
    
    if (userAccount != null) {
        message.reply("You already have a `panel account` linked to your discord account.");
        return;
    }

    //A verification code has to be emailed part way through, so the mail server is
    //checked before the user is asked anything.
    const EmailStatus = await sendMail.verify();

    if (!EmailStatus.Ok) {
        console.error("[USER CREATION] Email could not be sent: " + EmailStatus.Reason);

        message.reply(`Account creation is temporarily unavailable. ${EmailStatus.Reason}\n\nPlease try again later.`);
        return;
    }

    let questions = [
        {
            id: "tos",
            question:
                "https://danbot.host/tos\nPlease read our Terms of Service, do you accept? (**yes or no**)", // The questions...
            filter: (m) => m.author.id === message.author.id, // Filter to use...
            afterChecks: [
                {
                    check: (msg) => msg.toLowerCase() == "yes",
                    errorMessage: "You must accept our Terms of Service!",
                },
            ],
            time: 1000 * 60 * 10, // how much time a user has to answer the question before it times out
            value: null, // The user's response.
        },
        {
            id: "username",
            question:
                "What should your username be? (**Please don't use spaces or special characters**)", // The questions...
            filter: (m) => m.author.id === message.author.id, // Filter to use...
            afterChecks: [
                {
                    check: (msg) => msg.trim().split(" ").length == 1,
                    errorMessage: "Username must not contain any spaces.",
                },
                {
                    check: (msg) => msg.trim().length <= 100,
                    errorMessage: "Username must not exceed 100 characters.",
                },
            ],
            time: 30000, // how much time a user has to answer the question before it times out
            value: null, // The user's response.
        },
        {
            id: "email",
            question: "What's your email? *(must be a valid email)*",
            filter: (m) => m.author.id === message.author.id,
            afterChecks: [
                {
                    check: (msg) => validator.isEmail(msg.toLowerCase().trim()),
                    errorMessage: "The email must be valid.",
                },
            ],
            time: 30000,
            value: null,
        },
    ];

    server = message.guild;

    // Locate the account creation category
    const category = server.channels.cache.find((c) => c.id === MiscConfigs.accounts && c.type === Discord.ChannelType.GuildCategory);

    if (!category) throw new Error("Category channel does not exist.");

    // Create the channel in which the user will use to create his account
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
        reason: "User creating their account."
    });

    await channel.setParent(category, { lockPermissions: false });

    // Tell the user to check the channel.
    message.reply(`Please check <#${channel.id}> to create an account.`);

    // Send the initial question.
    let msg = null;

    ///////////////////// Below is the converted Discord V14 Code //////////////

    for (const question of questions) {
        if (msg == null) {
            msg = await channel.send({
                content: message.member.toString(),
                embeds: [
                    new Discord.EmbedBuilder()
                        .setColor("Green")
                        .setDescription(question.question)
                        .setFooter({
                            text: "You can type 'cancel' to cancel the request.",
                            iconURL: client.user.avatarURL(),
                        })
                        .setTimestamp(),
                ],
            });
        } else {
            await msg.edit({
                content: message.member.toString(),
                embeds: [
                    new Discord.EmbedBuilder(msg.embeds[0])
                        .setDescription(question.question)
                ],
            });
        }

        let collectedMessages;
        try {
            collectedMessages = await channel.awaitMessages({
                filter: question.filter,
                max: 1,
                time: question.time,
                errors: ['time']
            });
        } catch (error) {
            channel.send("User failed to provide an input!\nAccount creation cancelled!");
            setTimeout(() => {
                channel.delete();
            }, 5000);
            return;
        }

        question.value = collectedMessages.first().content.trim();

        await collectedMessages.first().delete();

        if (question.value.toLowerCase() === "cancel") {
            msg.delete();
            channel.send("Cancelled!");
            setTimeout(() => {
                channel.delete();
            }, 5000);
            return;
        }

        for (const afterCheck of question.afterChecks) {
            if (!afterCheck.check(question.value)) {
                channel.send(afterCheck.errorMessage);
                channel.send("Account creation cancelled!");
                setTimeout(() => {
                    channel.delete();
                }, 5000);
                return;
            }
        }

        if (question.id === "email") {
            const verificationCode = generateCode().toString();

            try {
                await sendMail(question.value, "Your Verification Code", `<p>Your verification code is: <b>${verificationCode}</b></p>`);
            } catch (Error) {
                console.error("[USER CREATION] Email could not be sent: " + (Error.userMessage || Error.message));

                //Without the code the user cannot continue, so the request is stopped here.
                channel.send(`${Error.userMessage || "The email service is currently unavailable."}\nYour verification code could not be sent.\nAccount creation cancelled!`);
                setTimeout(() => {
                    channel.delete();
                }, 5000);
                return;
            }

            questions.push({
                id: "verification",
                question: "Please enter the 10-digit verification code sent to your email:",
                filter: (m) => m.author.id === message.author.id,
                afterChecks: [
                    {
                        check: (msg) => msg === verificationCode,
                        errorMessage: "Invalid verification code. Account creation cancelled.",
                    },
                ],
                time: 1000 * 60 * 10, // 10 minutes
                value: null,
            });
        }
    }

    await msg.edit({
        content: message.member.toString(),
        embeds: [
            new Discord.EmbedBuilder(msg.embeds[0])
                .setDescription(
                    "Attempting to create an account for you...\n\n>>> " +
                    questions
                        .map((question) => `**${question.id}:** ${question.value.toLowerCase()}`)
                        .join("\n")
                )
                .setFooter(null)
                .setTimestamp(),
        ],
    });

    const data = {
        username: questions.find((question) => question.id == "username").value.toLowerCase(),
        email: questions.find((question) => question.id == "email").value.toLowerCase(),
        first_name: questions.find((question) => question.id == "username").value,
        last_name: ".",
        password: generatePassword(),
        root_admin: false,
        language: "en",
    };

    axios({
        url: Config.Pterodactyl.hosturl + "/api/application/users",
        method: "POST",
        followRedirect: true,
        maxRedirects: 5,
        headers: {
            Authorization: "Bearer " + Config.Pterodactyl.apikey,
            "Content-Type": "application/json",
            Accept: "Application/vnd.pterodactyl.v1+json",
        },
        data: data,
    })
        .then(async (user) => {
            await db.setUserData(message.author.id, {
                consoleID: user.data.attributes.id,
                email: user.data.attributes.email,
                username: user.data.attributes.username,
                linkTime: moment().format("HH:mm:ss"),
                linkDate: moment().format("YYYY-MM-DD"),
                domains: [],
                epochTime: Date.now() / 1000,
            });

            msg.edit({
                content: message.member.toString(),
                embeds: [
                    new Discord.EmbedBuilder()
                        .setTitle("Account Created! Account Information:")
                        .setColor("Green")
                        .setDescription(
                            "Panel URL: " +
                            Config.Pterodactyl.hosturl +
                            "\nUsername: `" +
                            data.username +
                            "\n`Email: `" +
                            data.email +
                            "\n`Password: `" +
                            data.password +
                            "`"
                        )
                        .setFooter({
                            text: "Please note: It is recommended that you change the password.",
                            iconURL: client.user.avatarURL(),
                        })
                        .setTimestamp(),
                ],
            });

            channel.send(
                "**You have 30 minutes to keep note of this info before the channel is deleted.**",
            );
            message.guild.members.cache.get(message.author.id).roles.add(Config.DiscordBot.Roles.Client);

            setTimeout(() => {
                channel.delete();
            }, 1800000);
        })
        .catch((err) => {
            const errors = err.response?.data?.errors;
            if (errors) {
                msg.edit({
                    content: '',
                    embeds: [
                        new Discord.EmbedBuilder()
                            .setColor("Red")
                            .setTitle("An error has occurred:")
                            .setDescription(
                                "**ERRORS:**\n\n- " +
                                errors.map((error) => error.detail.replace("\n", " ")).join("\n- ")
                            )
                            .setTimestamp()
                            .setFooter({
                                text: "Deleting in 30 seconds...",
                            }),
                    ],
                });
                setTimeout(() => {
                    channel.delete();
                }, 30000);
            } else {
                channel.send("An unexpected error has occurred, please try again later...");
                setTimeout(() => {
                    channel.delete();
                }, 30000);
            }
        });
};
