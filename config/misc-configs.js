const misc = {
    // Users who are authorized to process donations.
    staffPremium: [
        "137624084572798976", //Dan
        "737603315722092544", //Sarah
        "459025800633647116", //Avix
        "757296951925538856"  //DIBSTER
    ],

    // Staff who can make code drops.
    codeDrops: [
        "137624084572798976", //Dan
        "737603315722092544", //Sarah
        "757296951925538856", //DIBSTER
        "459025800633647116"  //Avixity
    ],

    //Staff who can run eval and exec.
    botCommands: [
        "137624084572798976", //Dan
        "757296951925538856", //DIBSTER
        "459025800633647116"  //Avixity
    ],

    // Channels where the bot reacts with up and down.
    suggestionChannels: [
        "980595293768802327", // Staff Suggestions
        "976371313901965373", // VPN Suggestions
    ],

    // Staff that can DM the bot.
    dmAllowedUsers: [
        "137624084572798976", // Dan
        "757296951925538856"  // DIBSTER
    ],

    // Channels where users can run the bot commands.
    allowedChannels: [
        "898041850890440725",  // #commands - Community
        "898041866589700128",  // #commands - Donators
        "898041878447013948",  // #commands - Beta Testers
        "1217536336181854258", // #commands - Staff
        "898041906599178240",  // #private - Staff
    ],

    // Categories where users can run the bot commands.
    allowedCategories: [
        "1160713638743658577", // High Priority Tickets
        "1160713549685989406", // Medium Priority Tickets
        "1160710296986460171", // Low Priority Tickets
        "1160716485065445406", // Unknown Priority Tickets
    ],

    // Channels for different commands.
    changelogs: "960242064338092202",       //Staff - Changelogs.
    github:     "898041843902742548",       //Staff - Update, Autopull
    nodestatus: "898041845878247487",       //General - Node Status
    donations:  "898041841939783732",       //General - Donations
    donatorlogs: "898041923544162324",      //Staff - Donator Logs
    serverStatus: "898327108898684938",     //General - Server Status
    modLogs:    "898041830924462858",       //Staff - Mod Logs
    normalCommands: "898041850890440725",   //General - Commands
    donatorCommands: "898041866589700128",  //General - Donator Commands
    betaCommands: "898041878447013948",     //General - Beta Commands
    accountLinked: "1168034234179539044",   //Staff - Account Linked

    // Account purge category.
    accounts: "898041816367128616",         //General - Account Creation Channels
}

module.exports = misc;
