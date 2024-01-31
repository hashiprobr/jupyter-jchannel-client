module.exports = {
    module: {
        rules: [
            {
                resolve: {
                    fullySpecified: false,
                },
            },
        ],
    },
    devServer: {
        headers: {
            'Access-Control-Allow-Origin': 'http://localhost:8888',
            'Access-Control-Allow-Methods': 'GET',
        },
    },
    output: {
        library: 'jchannel',
    },
};
