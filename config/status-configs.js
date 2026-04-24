const Config = require('../config.json');

const Status = {
        Nodes: {
            "Performance Nodes": {
                pnode1: {
                    Name: "PNode 1",
                    serverID: "2dadcc36",
                    IP: Config.Nodes.PNode1,
                    ID: "38",
                    Location: Config.Ping.UK,
                    MaxLimit: 450
                }
            },

            "Donator Nodes": {
                dono01: {
                    Name: "Dono-01",
                    serverID: "bd9d3ad6",
                    IP: Config.Nodes.Dono1,
                    ID: "34",
                    Location: Config.Ping.UK,
                    MaxLimit: 1500
                },
                dono02: {
                    Name: "Dono-02",
                    serverID: "ca6dba5a",
                    IP: Config.Nodes.Dono2,
                    ID: "31",
                    Location: Config.Ping.UK,
                    MaxLimit: 700
                },
                dono03: {
                    Name: "Dono-03",
                    serverID: "c23f92cb",
                    IP: Config.Nodes.Dono3,
                    ID: "33",
                    Location: Config.Ping.UK,
                    MaxLimit: 2000
                },
                dono04: {
                    Name: "Dono-04",
                    serverID: "c095a2cb",
                    IP: Config.Nodes.Dono4,
                    ID: "46",
                    Location: Config.Ping.UK,
                    MaxLimit: 400
                },
                dono05: {
                    Name: "Dono-05",
                    serverID: "ac3e6fbe",
                    IP: Config.Nodes.Dono5,
                    ID: "51",
                    Location: Config.Ping.UK,
                    MaxLimit: 100
                }
            },

            "Private Nodes": {
                privatenode1: {
                    Name: "Private Node 1",
                    serverID: "e0a6b98f",
                    IP: Config.Nodes.PrivateNode1,
                    ID: "50",
                    Location: Config.Ping.UK,
                    MaxLimit: 100
                }
            }
        },

        "VPS Hosting": {
            us1: {
                name: "United States 1",
                IP: Config.Servers.US1,
                Location: Config.Ping.UK
            },
            us2: {
                name: "United States 2",
                IP: Config.Servers.US2,
                Location: Config.Ping.UK
            },
            pus1: {
                name: "Ryzen - United States 1",
                IP: Config.Servers.PUS1,
                Location: Config.Ping.UK
            }
        },

        "Misc": {
            pterodactylPublic: {
                name: "[Pterodactyl](https://panel.danbot.host)",
                IP: Config.Services.pteropublic,
                Location: Config.Ping.UK
            },
            billingPanel: {
                name: "[Billing Panel](https://billing.danbot.host)",
                IP: Config.Services.billingpanel,
                Location: Config.Ping.UK
            },
            mailService: {
                name: "[Mail Service](https://mail.danbot.host)",
                IP: Config.Services.mailserver,
                Location: Config.Ping.UK
            },
            vpsPanel: {
                name: "[VPS Panel](https://vps.danbot.cloud)",
                IP: Config.Services.vpspanel,
                Location: Config.Ping.UK
            },
            dediPanel: {
                name: "[Dedi Panel](https://manager.danbot.cloud)",
                IP: Config.Services.dedipanel,
                Location: Config.Ping.UK
            }
        }
}

module.exports = Status;
