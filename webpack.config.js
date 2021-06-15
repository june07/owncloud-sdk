module.exports = {
    entry: './browser/toBundle.js',
    output: {
        path: __dirname + '/browser/',
        filename: 'owncloud.js',
    },
    resolve: {
        fallback: {
            fs: require.resolve('fs'),
            tls: false,
            net: false,
            path: false,
            zlib: false,
            http: false,
            https: false,
            stream: false,
            crypto: false,
            util: false,
            buffer: false,
            'crypto-browserify': false,
        },
    }
}
