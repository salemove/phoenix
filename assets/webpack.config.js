const path = require('path')

module.exports = {
  entry: './js/phoenix.js',
  output: {
    filename: 'phoenix.js',
    path: path.resolve(__dirname, '../priv/static'),
    library: 'Phoenix',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  plugins: []
}
