/*
    ____              ____        __     __  __           __  _
   / __ \____ _____  / __ )____  / /_   / / / /___  _____/ /_(_)___  ____ _
  / / / / __ `/ __ \/ __  / __ \/ __/  / /_/ / __ \/ ___/ __/ / __ \/ __ `/
 / /_/ / /_/ / / / / /_/ / /_/ / /_   / __  / /_/ (__  ) /_/ / / / / /_/ /
/_____/\__,_/_/ /_/_____/\____/\__/  /_/ /_/\____/____/\__/_/_/ /_/\__, /
Free Hosting forever!                                            /____/
*/

;(async () => {
    const fs = require("fs");
    const Discord = require("discord.js");
    const Sentry = require("@sentry/node");
    //const { nodeProfilingIntegration } = require("@sentry/profiling-node");

    const Config = require("./config.json");
    const { initDB } = require("./src/database.js");

    //Starting MySQL Database and initialising tables.
    await initDB();

    global.moment = require("moment");

    //Sentry.io Error Tracking.
    await Sentry.init({
        dsn: Config.SentryLogging.dsn,
        // integrations: [
        //   nodeProfilingIntegration(),
        // ],
        tracesSampleRate: 1.0, //  Capture 100% of the transactions.
        // Keep the Sentry v10 data collection defaults (sendDefaultPii off). v11 collects everything unless set.
        dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: {
                request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
                response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
            },
            httpBodies: [],
            urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
            genAI: { inputs: false, outputs: false },
            databaseQueryData: false,
            graphQL: { document: false, variables: false },
            frameContextLines: 7,
        },
    });

    module.exports.Sentry = Sentry;

    process.on("unhandledRejection", (Error) => Sentry.captureException(Error));

    //Discord Bot:
    const client = new Discord.Client({
        intents: [
            Discord.GatewayIntentBits.Guilds,
            Discord.GatewayIntentBits.GuildMembers,
            Discord.GatewayIntentBits.GuildModeration,
            Discord.GatewayIntentBits.GuildIntegrations,
            Discord.GatewayIntentBits.GuildPresences,
            Discord.GatewayIntentBits.GuildMessages,
            Discord.GatewayIntentBits.GuildMessageReactions,
            Discord.GatewayIntentBits.GuildMessageTyping,
            Discord.GatewayIntentBits.DirectMessages,
            Discord.GatewayIntentBits.DirectMessageReactions,
            Discord.GatewayIntentBits.DirectMessageTyping,
            Discord.GatewayIntentBits.MessageContent
        ],
        partials: [
            Discord.Partials.Channel,
            Discord.Partials.Message,
            Discord.Partials.Reaction
        ],
        presence: {
            activities: [
                {
                    name: "Managing DanBot Hosting"
                }
            ]
        }
    });

    //Event Handler.
    fs.readdir("./src/events/", (err, files) => {
        files = files.filter((f) => f.endsWith(".js"));
        files.forEach((f) => {
            const event = require(`./src/events/${f}`);
            client.on(f.split(".")[0], event.bind(null, client));
            delete require.cache[require.resolve(`./src/events/${f}`)];
        });
    });

    //Server Creation:
    await require('./createData_Prem.js').initialStart();
    await require('./createData.js').initialStart();
    await require('./createData_Private.js').initialStart();

    client.login(Config.DiscordBot.Token);
})();