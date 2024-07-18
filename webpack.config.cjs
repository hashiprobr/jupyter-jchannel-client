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
    output: {
        library: {
            name: 'jchannel',
            type: 'global',
            export: 'default',
        },
    },
};
