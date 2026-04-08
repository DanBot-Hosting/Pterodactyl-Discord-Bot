# Performance & Reliability Review

> A breakdown of identified issues in the codebase, why they occur, and resources to read further.
> No changes have been made — this is reference material only.

---

## Table of Contents

1. [Synchronous Filesystem Reads on Every Message](#1-synchronous-filesystem-reads-on-every-message)
2. [fs.existsSync on Every Message](#2-fsexistssync-on-every-message)
3. [Sequential Node Pings With No Overlap Guard](#3-sequential-node-pings-with-no-overlap-guard)
4. [Sequential Database Reads Inside Loops](#4-sequential-database-reads-inside-loops)
5. [Fetching 10 Messages Every 30 Seconds to Find One](#5-fetching-10-messages-every-30-seconds-to-find-one)
6. [Git Auto-Pull Kills Active User Sessions](#6-git-auto-pull-kills-active-user-sessions)
7. [Incomplete Member Cache for Nickname Checks](#7-incomplete-member-cache-for-nickname-checks)
8. [Sequential Server Deletions](#8-sequential-server-deletions)
9. [Unawaited Promises Swallow Errors](#9-unawaited-promises-swallow-errors)
10. [moment.js as a Global Variable](#10-momentjs-as-a-global-variable)
11. [Unused High-Bandwidth Gateway Intents](#11-unused-high-bandwidth-gateway-intents)
12. [Bot-Message Check Runs Too Late](#12-bot-message-check-runs-too-late)
13. [Redundant Array.find() Calls](#13-redundant-arrayfind-calls)
14. [Sentry tracesSampleRate: 1.0 in Production](#14-sentry-tracessamplerate-10-in-production)

---

## 1. Synchronous Filesystem Reads on Every Message

**File:** `src/events/messageCreate.js`, lines 72–73

```js
const categoriesPath = path.join(__dirname, '../commands');
const categories = fs.readdirSync(categoriesPath).filter(x => fs.statSync(path.join(categoriesPath, x)).isDirectory());
```

### What is happening

Every time any message is sent anywhere in the server — even messages that will never trigger a command — the bot calls `fs.readdirSync()` and `fs.statSync()`. These are **synchronous, blocking** filesystem calls.

### Why it is a problem

Node.js runs on a single thread using an event loop. Synchronous I/O calls like `readdirSync` and `statSync` do not use that event loop — they completely pause it. While the OS is reading the directory from disk, Node.js cannot process any other events: no incoming messages, no resolved promises, no timer callbacks. Every message to the bot causes a full disk read.

The command directory does not change at runtime (the bot restarts after a git pull). There is no reason to re-read it on every message. The correct approach is to read the directory once at startup, store the result in a `Set` or `Map`, and do an `O(1)` lookup on every message.

### Further reading

- [Node.js Docs — `fs.readdirSync`](https://nodejs.org/api/fs.html#fsreaddirsyncpath-options)
- [Node.js Docs — The Event Loop](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick)
- [Node.js Best Practices — Avoid blocking the event loop](https://nodejs.org/en/docs/guides/dont-block-the-event-loop)
- [MDN — Concurrency model and event loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop)

---

## 2. fs.existsSync on Every Message

**File:** `src/events/messageCreate.js`, lines 86, 95

```js
if (fs.existsSync(commandFilePath)) {
    let commandFile = require(commandFilePath);
```

### What is happening

Even though `require()` caches modules after the first load, `fs.existsSync()` is still called on every command invocation to check whether the file exists before requiring it.

### Why it is a problem

`fs.existsSync` is synchronous (same event loop concern as #1). Additionally, this check is redundant after the first time a command is loaded — if the file was there the first time, it will be there until the process restarts. The more efficient approach is to build a lookup map at startup (`{ commandName: requirePath }`) and simply check `if (commandMap.has(command))`. If it is not in the map, it does not exist.

As a secondary note: the Node.js module system already handles non-existent requires by throwing an error (`MODULE_NOT_FOUND`), which can be caught, removing the need for a pre-check entirely.

### Further reading

- [Node.js Docs — `fs.existsSync`](https://nodejs.org/api/fs.html#fsexistssyncpath)
- [Node.js Docs — `require()` and the module cache](https://nodejs.org/api/modules.html#requireid)
- [Node.js Docs — Modules caching](https://nodejs.org/api/modules.html#caching)

---

## 3. Sequential Node Pings With No Overlap Guard

**File:** `src/serverStatus.js`, lines 20–78

```js
setInterval(async () => {
    for (const [, nodes] of Object.entries(Status.Nodes)) {
        for (const [node, data] of Object.entries(nodes)) {
            const [, fetchError] = await safePromise(ping.ping({ host: data.IP, port: 8080 }));
            // awaits before moving to the next node
            const [serverCountRes] = await safePromise(axios({ ... }));
            await db.setNodeServers(node, { ... });
        }
    }
}, 5 * 1000);
```

### What is happening

Two separate problems compound each other here.

**Problem A — Sequential awaits in a loop:** Each node is checked one at a time. Node 2 does not start until node 1 fully completes (ping + Pterodactyl API call + DB write). With 10 nodes and each check potentially taking 1–3 seconds (especially on failure, where TCP waits for a timeout), the total loop time can far exceed the 5-second interval.

**Problem B — No overlap guard:** Because `setInterval` fires on a fixed clock regardless of whether the previous invocation has finished, when the loop takes longer than 5 seconds, a second invocation begins while the first is still running. Both are now writing to the database for the same nodes simultaneously, which can cause inconsistent data or wasted work.

### The fix concept

1. Use `Promise.all()` to fire all node pings at the same time instead of sequentially.
2. Add a simple boolean lock (`let isRunning = false`) that prevents a new invocation from starting if the previous one is not done yet.

### Further reading

- [MDN — `Promise.all()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
- [MDN — `await` in loops (and why it serializes)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await)
- [Node.js Docs — `setInterval`](https://nodejs.org/api/timers.html#setintervalcallback-delay-args)
- [JavaScript.info — Promise API](https://javascript.info/promise-api)

---

## 4. Sequential Database Reads Inside Loops

**File:** `src/serverStatus.js`, lines 85–131 (`parseStatus`)

```js
// Per-node: these two are parallelized (good)
const [nodeStatusData, nodeServerData] = await Promise.all([
    db.getNodeStatus(nodeKey.toLowerCase()),
    db.getNodeServers(nodeKey.toLowerCase()),
]);

// But each NODE is still awaited one at a time (bad)
// And services are fully sequential:
const serviceStatusData = await db.getNodeStatus(name.toLowerCase()); // line 121
```

### What is happening

`parseStatus()` is called every 30 seconds to build the status embed. While each node's two DB queries are parallelized against each other, all nodes are still processed sequentially. With 10 nodes that is 10 sequential round-trips to MySQL, each one waiting for the previous before starting.

The services loop is even simpler — each service's DB read is awaited individually.

### Why it is a problem

Each `await db.getNodeStatus(...)` is a full round-trip: Node.js → TCP → MySQL server → MySQL executes query → TCP → Node.js. On a local network this might be 1–5ms, but multiplied across 10+ nodes sequentially in a function called every 30 seconds it adds unnecessary latency to every embed update. The entire set of reads could be replaced with two bulk queries (`WHERE node_key IN (...)`) which fetch all required rows in a single round-trip.

### Further reading

- [MDN — `Promise.all()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
- [mysql2 Docs — Pool usage](https://github.com/sidorares/node-mysql2#using-connection-pools)
- [JavaScript.info — Async/await pitfalls with loops](https://javascript.info/async-await#error-handling)

---

## 5. Fetching 10 Messages Every 30 Seconds to Find One

**File:** `src/events/clientReady.js`, lines 70–77

```js
let messages = await channel.messages.fetch({ limit: 10 }).catch((Error) => {});
messages = messages.filter((x) => x.author.id === client.user.id).last();

if (messages == null) channel.send({ embeds: [embed] });
else messages.edit({ embeds: [embed] });
```

### What is happening

Every 30 seconds, the bot asks Discord's API for the last 10 messages in the status channel, filters them down to find the bot's own message, then edits it.

### Why it is a problem

This is an unnecessary HTTP request to Discord's API on a regular interval. Discord rate-limits API calls — the Messages endpoint is limited to 5 requests per 5 seconds per channel. Doing this every 30 seconds is not a crisis, but it is wasteful: you are fetching up to 10 message objects, deserializing the JSON, and filtering them just to get one reference you already had.

The solution is to store the sent message object in a variable when it is first created (`const statusMessage = await channel.send(...)`), then call `statusMessage.edit(...)` directly on every subsequent interval. Zero fetches needed.

### Further reading

- [Discord.js Docs — Message caching](https://discordjs.guide/popular-topics/collectors.html)
- [Discord API Docs — Rate limits](https://discord.com/developers/docs/topics/rate-limits)
- [Discord.js Docs — `MessageManager.fetch()`](https://discord.js.org/docs/packages/discord.js/main/MessageManager:Class#fetch)

---

## 6. Git Auto-Pull Kills Active User Sessions

**File:** `src/events/clientReady.js`, lines 38–54

```js
setInterval(async () => {
    const { stdout } = await execPromise('git pull');

    if (!stdout.includes("Already up to date.")) {
        await client.channels.cache.get(MiscConfigs.github).send(`...`);
        setTimeout(() => {
            process.exit();
        }, 5000);
    }
}, 30 * 1000);
```

### What is happening

Every 30 seconds the bot runs `git pull`. If there is a new commit, it posts a message and exits the process after 5 seconds.

### Why it is a problem

**Problem A — Active sessions are killed silently:** A user may be mid-flow — for example, inside `user new` which uses `channel.awaitMessages()` waiting for the user to type. When `process.exit()` fires, the collector is destroyed with no notification to the user. The temporary account-creation channel is never cleaned up. The user receives no message explaining what happened.

**Problem B — `process.exit()` is not graceful:** `process.exit()` terminates the Node.js process immediately. It does not wait for pending promises, does not flush any write buffers, and does not fire `'exit'` event handlers properly. Any in-flight database writes or HTTP requests at the time of exit may be left incomplete.

**Problem C — The 5-second `setTimeout` is not a guarantee:** This delay gives the bot time to send the GitHub notification message, but it offers no guarantee that other in-flight operations complete. It is an arbitrary magic number.

The general pattern for graceful restarts is to stop accepting new work, wait for in-flight work to finish, then exit using a process manager (like PM2) which handles restarts cleanly.

### Further reading

- [Node.js Docs — `process.exit()`](https://nodejs.org/api/process.html#processexitcode)
- [Node.js Docs — `process` signal events](https://nodejs.org/api/process.html#signal-events)
- [PM2 Docs — Graceful shutdown](https://pm2.keymetrics.io/docs/usage/signals-clean-restart/)
- [Node.js Best Practices — Graceful shutdown](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/errorhandling/gracefulshutdown.md)

---

## 7. Incomplete Member Cache for Nickname Checks

**File:** `src/events/clientReady.js`, lines 18–24

```js
let checkNicks = () => {
    guild.members.cache
        .filter((member) => member.displayName.match(/^[a-z0-9]/i) == null)
        .forEach((x) => { x.setNickname("I love Dan <3"); });
};
checkNicks();
```

### What is happening

On startup, the bot iterates `guild.members.cache` to find members whose display names start with a non-alphanumeric character and renames them.

### Why it is a problem

`guild.members.cache` is not the full member list — it is a partial, in-memory cache that only contains members who have interacted with the bot or been loaded during the current process lifetime. Discord.js does not fetch all guild members automatically (doing so for large guilds is expensive). When the bot starts fresh, this cache is mostly empty.

The fix is to call `await guild.members.fetch()` before accessing `.cache`, which forces Discord.js to request the complete member list from Discord's API. Without this, the nickname check silently does nothing for the majority of members.

Note: `GuildMembers` is a privileged intent and must be enabled in the Discord Developer Portal for `fetch()` to return the full list.

### Further reading

- [Discord.js Docs — `GuildMemberManager.fetch()`](https://discord.js.org/docs/packages/discord.js/main/GuildMemberManager:Class#fetch)
- [Discord.js Guide — Caching](https://discordjs.guide/additional-info/changes-in-v14.html)
- [Discord API Docs — Guild Members intent (privileged)](https://discord.com/developers/docs/events/gateway#privileged-intents)

---

## 8. Sequential Server Deletions

**File:** `src/commands/server/delete.js`, lines 110–131

```js
for (const server of serversToDelete) {
    try {
        await Axios({
            url: `${Config.Pterodactyl.hosturl}/api/application/servers/${server.attributes.id}/force`,
            method: "DELETE",
            ...
        });
        // waits for response before deleting the next server
    }
}
```

### What is happening

When a user deletes multiple servers at once, each DELETE request to the Pterodactyl API is sent and awaited sequentially. Server 2 is not deleted until server 1's response comes back.

### Why it is a problem

These are entirely independent HTTP requests. There is no logical reason server 2 must wait for server 1 to finish. With `Promise.all()`, all delete requests can be sent at the same time and the bot waits for all of them simultaneously. Deleting 5 servers would take the same wall-clock time as deleting 1.

The only consideration when using `Promise.all()` here is error handling: `Promise.all()` rejects on the first failure. Using `Promise.allSettled()` instead lets you collect the results of all deletions — both successes and failures — and report them individually to the user.

### Further reading

- [MDN — `Promise.all()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
- [MDN — `Promise.allSettled()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)
- [JavaScript.info — Promise API comparison](https://javascript.info/promise-api)

---

## 9. Unawaited Promises Swallow Errors

**Files:** `src/commands/server/create.js:84`, `src/commands/user/new.js:226`

```js
// create.js — the async function returns here, promise is floating
Creation.createServer(ServerCreationSettings)
    .then(async (Response) => {
        await message.reply({ embeds: [Embed] });
    })
    .catch(async (Error) => {
        // error handling...
        await message.reply({ embeds: [ErrorEmbed] }).catch(Error => {});
    });
// nothing is returned or awaited after this point
```

### What is happening

Both `server/create.js` and `user/new.js` are declared as `async` functions, but the Pterodactyl API calls inside them use `.then()/.catch()` chaining instead of `await`. Critically, the resulting promise is not returned or awaited — it is "fire and forget."

### Why it is a problem

**Problem A — Errors escape the outer try/catch:** In `messageCreate.js`, all command calls are wrapped in a `try/catch` that sends errors to Sentry:

```js
try {
    await commandFile.run(client, message, args);
} catch (Error) {
    Sentry.captureException(Error);
}
```

Because the Axios promise inside `create.js` is not awaited, `commandFile.run()` returns before the API call finishes. Any error thrown inside `.then()` or `.catch()` happens after `commandFile.run()` has already resolved — the outer `try/catch` is long gone and can no longer catch it.

**Problem B — Unhandled promise rejections:** If the `.catch()` callback itself throws (which can happen, for example, if `message.reply()` fails because the message was deleted), the error becomes an unhandled promise rejection. Node.js treats unhandled rejections as fatal in newer versions.

**The fix:** `await` the entire call, and use a single `try/catch` around it. This ensures all errors flow through a single, predictable path.

### Further reading

- [MDN — `async`/`await`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)
- [Node.js Docs — Unhandled promise rejections](https://nodejs.org/api/process.html#event-unhandledrejection)
- [JavaScript.info — Error handling with promises](https://javascript.info/promise-error-handling)
- [Node.js Best Practices — Handle async errors](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/errorhandling/returningpromises.md)

---

## 10. moment.js as a Global Variable

**Files:** `index.js:22`, `src/commands/user/new.js:243-244`

```js
// index.js
global.moment = require("moment");

// user/new.js — used implicitly via global
linkTime: moment().format("HH:mm:ss"),
linkDate: moment().format("YYYY-MM-DD"),
```

### What is happening

`moment` is attached to the `global` object in `index.js` and then accessed without any import statement in `user/new.js`.

### Two separate problems

**Problem A — Global variable as a module system substitute:**
Assigning to `global` bypasses Node.js's module system entirely. Any file can now read or overwrite `global.moment` without declaring a dependency. This makes code harder to reason about — you cannot look at the top of `user/new.js` and understand what it depends on. If `moment` is ever removed from `index.js`, the error will surface in `user/new.js` at runtime with no static indication of where the dependency came from.

**Problem B — moment.js is deprecated and large:**
The moment.js maintainers officially recommend against using it in new projects. It is a large library (~230KB minified), it is mutable (modifying a moment object affects clones), and it does not support tree-shaking. Both uses in this codebase — formatting a date and a time string — can be replaced with native JavaScript's `Intl.DateTimeFormat` or a simple `new Date().toISOString()` with no external dependency.

### Further reading

- [moment.js — Project Status (deprecation notice)](https://momentjs.com/docs/#/-project-status/)
- [You Don't Need Moment.js](https://github.com/you-dont-need/You-Dont-Need-Momentjs)
- [MDN — `Intl.DateTimeFormat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [Node.js Docs — `global` object](https://nodejs.org/api/globals.html)
- [Node.js Best Practices — Avoid globals](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/codeStyle/avoid-global-scope.md)

---

## 11. Unused High-Bandwidth Gateway Intents

**File:** `index.js`, lines 39–51

```js
const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.GuildPresences,      // fires for every member status change
        Discord.GatewayIntentBits.GuildMessageTyping,  // fires every few seconds per typing user
        Discord.GatewayIntentBits.DirectMessageTyping, // same, for DMs
        // ...
    ]
});
```

### What is happening

The bot subscribes to three intents that are not used anywhere in the codebase.

### Why it is a problem

Discord's gateway pushes events to the bot for every intent it subscribes to. These three are particularly high-volume:

- **`GuildPresences`:** Fires for every guild member whenever their presence changes: online/offline/idle, game started, activity changed, etc. In a server with thousands of members this is a constant stream of events, all of which Discord.js processes, deserializes, and caches — work that is thrown away immediately since nothing listens to it.

- **`GuildMessageTyping`:** Discord sends a `typingStart` event approximately every 10 seconds for every user who is actively typing in any channel. This is also high-volume.

- **`DirectMessageTyping`:** Same as above, for DMs.

Each event consumes CPU to deserialize and memory to represent. `GuildPresences` is a privileged intent and also populates the presence cache with data the bot has no use for. Removing unused intents is one of the recommended first steps in Discord.js performance guides.

### Further reading

- [Discord.js Guide — Gateway Intents](https://discordjs.guide/additional-info/changes-in-v13.html#gateway-intents)
- [Discord API Docs — Gateway Intents](https://discord.com/developers/docs/events/gateway#gateway-intents)
- [Discord API Docs — Privileged Intents](https://discord.com/developers/docs/events/gateway#privileged-intents)
- [Discord.js Docs — `GatewayIntentBits`](https://discord.js.org/docs/packages/discord.js/main/GatewayIntentBits:Enum)

---

## 12. Bot-Message Check Runs Too Late

**File:** `src/events/messageCreate.js`, lines 20–44

```js
// Lines 20–25: runs BEFORE the bot check
if (MiscConfigs.suggestionChannels.some((channel) => channel == message.channel.id)) {
    if (!message.content.startsWith(">")) {
        await message.react("👍");
        await message.react("👎");
    }
}

// Line 44 — the bot check is here, too late
if (message.author.bot) return;
```

### What is happening

This is a logic error. The check `if (message.author.bot) return` is placed at line 44, after the suggestion channel reaction code at lines 20–25. The reaction code runs for every message in suggestion channels — including messages sent by other bots.

### Why it is a problem

If another bot (or this bot itself) posts in a suggestion channel, the reaction code fires unconditionally and adds 👍 and 👎 to it. This is almost certainly unintended behaviour. It also wastes two API calls per bot message in that channel.

The fix is simply moving `if (message.author.bot) return` to be the very first line in the handler, before any other logic.

### Further reading

- [Discord.js Guide — Handling commands](https://discordjs.guide/creating-your-bot/command-handling.html)
- [Discord.js Docs — `Message.author`](https://discord.js.org/docs/packages/discord.js/main/Message:Class#author)

---

## 13. Redundant Array.find() Calls

**File:** `src/commands/user/new.js`, lines 217–222

```js
const data = {
    username:   questions.find((question) => question.id == "username").value.toLowerCase(),
    email:      questions.find((question) => question.id == "email").value.toLowerCase(),
    first_name: questions.find((question) => question.id == "username").value, // same find again
```

### What is happening

`Array.find()` is called twice with identical arguments to locate the "username" question.

### Why it is a problem

`Array.find()` is `O(n)` — it iterates the array from the start until it finds a match. Here it is trivial because the array is small. However, the pattern of performing repeated linear searches instead of storing a result is a habit that causes real performance problems when applied to larger data sets elsewhere. The fix is a single variable assignment:

```js
const usernameQ = questions.find(q => q.id === "username");
const emailQ    = questions.find(q => q.id === "email");

const data = {
    username:   usernameQ.value.toLowerCase(),
    email:      emailQ.value.toLowerCase(),
    first_name: usernameQ.value,
    ...
};
```

### Further reading

- [MDN — `Array.prototype.find()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find)
- [MDN — Time complexity (Big O)](https://developer.mozilla.org/en-US/docs/Glossary/Time_complexity)

---

## 14. Sentry tracesSampleRate: 1.0 in Production

**File:** `index.js`, line 31

```js
await Sentry.init({
    dsn: Config.SentryLogging.dsn,
    tracesSampleRate: 1.0, // Capture 100% of the transactions.
});
```

### What is happening

`tracesSampleRate` controls what percentage of transactions (spans of work) Sentry captures for performance tracing. `1.0` means every single operation is instrumented and reported.

### Why it is a problem

Performance tracing is different from error capture. Error capture (what Sentry is most commonly used for) has low overhead and should remain at 100%. But tracing adds instrumentation overhead to every operation — wrapping function calls, measuring spans, serialising and sending timing data to Sentry's servers. In a busy production bot this adds CPU and network overhead to every command invocation.

Additionally, Sentry's paid plans charge by the number of transactions. At `1.0` in production you may be sending far more data than necessary and incurring unnecessary cost.

The standard recommendation is `0.1` (10%) or lower for `tracesSampleRate` in production environments. Error capture is controlled separately and remains unaffected.

### Further reading

- [Sentry Docs — `tracesSampleRate`](https://docs.sentry.io/platforms/javascript/configuration/sampling/)
- [Sentry Docs — Performance monitoring for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/performance/)
- [Sentry Docs — Sampling](https://docs.sentry.io/concepts/key-terms/sampling/)

---

## Summary

| # | File | Issue | Category | Severity |
|---|------|--------|----------|----------|
| 1 | `messageCreate.js:72` | `readdirSync`/`statSync` on every message | Performance | High |
| 2 | `messageCreate.js:86` | `fs.existsSync` on every message | Performance | High |
| 3 | `serverStatus.js:20` | Sequential node pings, no overlap guard | Performance | High |
| 4 | `serverStatus.js:85` | Sequential DB reads in embed build | Performance | Medium |
| 5 | `clientReady.js:70` | Fetches 10 messages every 30s to find 1 | Performance | Medium |
| 6 | `clientReady.js:38` | git pull kills active user sessions | Reliability | Medium |
| 7 | `clientReady.js:19` | Incomplete member cache for nickname check | Reliability | Medium |
| 8 | `delete.js:110` | Sequential server deletions | Performance | Medium |
| 9 | `create.js:84`, `new.js:226` | Unawaited promises swallow errors | Reliability | Medium |
| 10 | `index.js:22`, `new.js:243` | `moment` as global; deprecated library | Maintainability | Low |
| 11 | `index.js:39` | Unused high-bandwidth gateway intents | Performance | Medium |
| 12 | `messageCreate.js:20` | Bot check too late; reacts to other bots | Logic Bug | Low |
| 13 | `new.js:217` | Redundant `Array.find()` calls | Performance | Low |
| 14 | `index.js:31` | `tracesSampleRate: 1.0` in production | Performance | Low |
