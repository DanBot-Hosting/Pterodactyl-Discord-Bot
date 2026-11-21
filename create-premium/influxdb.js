module.exports = {
    isGameServer: false,
    isDisabled: false,
    subCategory: "Databases",
    createServer: createServer
}

function createServer(ServerName, UserID){
    return {
        name: ServerName,
        user: UserID,
        nest: 12,
        egg: 93,
        docker_image: "ghcr.io/parkervcp/yolks:debian",
        startup: "mkdir -p /home/container/tmp && export TMPDIR=/home/container/tmp TMP=/home/container/tmp TEMP=/home/container/tmp && exec ./influxd --http-bind-address 0.0.0.0:{{SERVER_PORT}}",
        limits: {
            memory: 2048,
            swap: -1,
            disk: 10240,
            io: 500,
            cpu: 200,
        },
        environment: {
            VERSION: "v2.4",
        },
        feature_limits: {
            databases: 2,
            allocations: 5,
            backups: 10,
        },
        deploy: {
            locations: botswebdbPREM,
            dedicated_ip: false,
            port_range: [],
        },
        start_on_completion: false,
    };
};