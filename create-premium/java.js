module.exports = {
    isGameServer: false,
    isDisabled: false,
    subCategory: "Languages",
    createServer: createServer
}

function createServer(ServerName, UserID){
    return {
        name: ServerName,
        user: UserID,
        nest: 5,
        egg: 25,
        docker_image: "ghcr.io/parkervcp/yolks:java_17",
        startup: "${STARTUP_CMD}",
        limits: {
            memory: 2048,
            swap: -1,
            disk: 10240,
            io: 500,
            cpu: 200,
        },
        environment: {
            STARTUP_CMD: "bash",
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