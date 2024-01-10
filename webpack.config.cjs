module.exports = {
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
