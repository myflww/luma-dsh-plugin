// Esbuild's readable output inserts input filenames as comments, including
// absolute paths when a dependency is resolved across drives. Omit those at
// print time so literal strings, legal notices and source-map offsets are
// handled by the JavaScript printer itself.
export const nativeBundleOptions = {
  minifyWhitespace: true,
  legalComments: 'eof',
}
