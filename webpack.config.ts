const path = require('path');

module.exports = {
    entry: './src/js/browser/index.ts',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    node: {Buffer: false},
    target: "web",
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'lib/browser/'),
        library: 'spellchecker-wasm',
        libraryTarget: 'umd'
    },
};