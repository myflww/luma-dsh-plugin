type Offset = readonly [x: number, y: number]

// Source pixel translations relative to the first painted seated frame. Values were
// measured on textured head/hair landmarks and checked across the full chair and torso.
// Content addressing keeps replacement art from inheriting a previous costume's offsets.
const offsets: Readonly<Record<string, readonly Offset[]>> = {
  '91b680686e7da34b1231179275a2f5cf6dc0a7fdda0ddb147114a1ba4f42e29e': [[0, 0], [-1, 0], [0, -1], [-2, -1]], // employee.bai-shuangming.skin.v1.typing.back
  'e8903b9c142a87d1dfbfd9f8e73158886e53d955f9a3ad51b07b44eb9ccae199': [[0, 0], [10, 0], [0, -4], [10, -5]], // employee.bai-shuangming.skin.v1.typing.back-left
  '4d190fd07c0bbc2ef199734ab10a1abf6d0f500a2bca8a9dbcf05b9676b72b0a': [[0, 0], [-1, 0], [0, -3], [-3, -3]], // employee.bai-shuangming.skin.v1.typing.back-right
  '165f0125a2f9e28f3fdca6a5117450ece6eb4467f432ecd9ecf3af8600f0e66d': [[0, 0], [-1, 0], [0, -3], [-4, -4]], // employee.bai-shuangming.skin.v1.typing.front
  'a38dbb5f5267524474984d1191b4e9352385ca55137425cf2f798b8bf315bb0f': [[0, 0], [0, -1], [-1, -1], [1, 0]], // employee.bai-shuangming.typing.back-left.plugin-r1
  'ab3677e7082cda665ebd751ce29ea398c4cc66f2057a763089a4b071df3d2e0f': [[0, 0], [2, 0], [2, 0], [3, 0]], // employee.bai-shuangming.typing.back-right.v2
  '54f701a3a0a245b558f4cf8a33f3b16ff2389ffd5ae633af46565b7cbc9b5cb6': [[0, 0], [-3, 0], [1, -1], [-2, -1]], // employee.bai-shuangming.typing.back.plugin-r1
  'e6432fbca549a4e0e2c482865f9f43093166fa01821ff58a98e454e4462bdeac': [[0, 0], [-1, 0], [1, 0], [0, 0]], // employee.bai-shuangming.typing.front.plugin-r1
  '783f5980c465745eea4a10d88d180d628acd23ff76fa33e57965fa092ac0301b': [[0, 0], [35, 0], [0, 1], [35, 0]], // employee.claude.skin.v1.typing.back
  '0dc57f677fd13dc2364fb448142fb749b8d2f623e1ab6ba6987c2e5f3a54fe37': [[0, 0], [43, 0], [0, -4], [43, -5]], // employee.claude.skin.v1.typing.back-left
  'd682b9260ed30c3aa3f52f3a77bec175f6d4880bbc64ccb1b698ba2147f5dfa6': [[0, 0], [82, 1], [-2, -4], [74, -4]], // employee.claude.skin.v1.typing.back-right
  'd8bd9dca746d9ea9443a81b89234b7f03811e6554e6ee069e41655375f61c585': [[0, 0], [32, 0], [-4, 0], [32, 3]], // employee.claude.skin.v1.typing.front
  'c14639f22a2160294ad6356cb54e139bf6edf360ffe391aab56dbfd683d23feb': [[0, 0], [5, 0], [29, 0], [42, 0]], // employee.claude.typing.back-left.v1
  '9a4186765fa9ec7ade7f2e849fbd3090633ec9380eb27d1d3660a7f73c7aa4bc': [[0, 0], [-1, 0], [-2, 0], [-3, 0]], // employee.claude.typing.back-right.v1
  '613ce89a32070e604940dd175c4716f02d9d1ff1d0cd3bd647fe6c776afee970': [[0, 0], [-7, 0], [-13, 0], [-15, 1]], // employee.claude.typing.back.v1
  'dccfd8c3116f6907900235d8c377c42d508281cc7609a51da72f669e7059d5c5': [[0, 0], [8, 0], [14, 0], [18, 0]], // employee.claude.typing.front.v1
  'c88da9315ab115ad2c9606e95f496296f4c3cf30cf5d0e6527602ea6dc97e511': [[0, 0], [-3, 1], [-2, 4], [1, 3]], // employee.duanmu-yan.typing.back-left.plugin-r1
  '751c11dc3fd458b6187cf08a96df2fc1a946f0b77a31a8310f3f344d23a4191c': [[0, 0], [-6, 0], [1, 0], [2, 0]], // employee.duanmu-yan.typing.back-right.v1
  '2e164d0a28021583aa1c7280851ba1dd8fe1d43993a769508d406a76c1fab41c': [[0, 0], [1, 0], [0, 1], [0, 0]], // employee.duanmu-yan.typing.back.plugin-r1
  '07ca498d664b3a8257f4c3a9fdd16879f21c725da02ca017c8e537d7a21c94bf': [[0, 0], [0, 0], [0, 0], [0, 0]], // employee.duanmu-yan.typing.front.plugin-r1
  '5672f2154cd47b4ce190260e241278722f2ddde0086645b2227f2b2e2f4a03a8': [[0, 0], [16, 0], [-3, 6], [17, 7]], // employee.gemini.skin.v1.typing.back
  '0ea1dd204f8bb39efc03965de780ca1a69e6b35999de81239a9dfff8a7f9e10d': [[0, 0], [11, -5], [0, 10], [7, 9]], // employee.gemini.skin.v1.typing.back-left
  '505026db82226f671e79440c78b8a248c843906b2d5860c63e1d117471a3e610': [[0, 0], [23, -2], [-4, 14], [30, 14]], // employee.gemini.skin.v1.typing.back-right
  '0ffabe76fe7df7a79c598e68feae0fad3be4fcfe33f7089296743f83490732d8': [[0, 0], [25, -2], [6, 8], [16, 9]], // employee.gemini.skin.v1.typing.front
  'e86241962e3ae1707ccd4414aba8d4ea9f451bbebd1f98f26a7823d80f72e99a': [[0, 0], [3, -4], [6, 15], [11, 14]], // employee.grok.skin.v1.typing.back
  '1790885bced75ea3ffe367cd05f66ce537eb4a117469634e5dbd578b815f6175': [[0, 0], [9, 0], [-3, -4], [9, -12]], // employee.grok.skin.v1.typing.back-left
  'c2e9dcd794793ffee3e9b58ab12ee08972653e4770276a8610de99a4fde8da00': [[0, 0], [-8, -5], [-3, 15], [6, 14]], // employee.grok.skin.v1.typing.back-right
  'dd374216764a96beca4c8ee8a7e3b5cafe071046678cb257c141864e8481bd6c': [[0, 0], [0, 1], [-2, -9], [1, -5]], // employee.grok.skin.v1.typing.front
  '4655690f2405c6528acf7ee9c3e5a42802064f656ef7e9cfac61c7929c1e9342': [[0, 0], [-4, -13], [-19, -10], [-14, -21]], // employee.jingyuniang.skin.v1.typing.back
  '74122ef4a6792095471040ec52c80e1b9924970e3ca932df30fe3ead39afd3d7': [[0, 0], [0, 0], [-1, 1], [0, 0]], // employee.jingyuniang.skin.v1.typing.back-left
  '60c81e9518fecd11129426453fe702768fc5a5cc190a625d03daf75afd9365a0': [[0, 0], [13, 0], [0, 0], [10, 1]], // employee.jingyuniang.skin.v1.typing.back-right
  '3e8dc0acd9afed6496d195b6d6f4a898537f6c798bc8cb7392a841e17afe0dd6': [[0, 0], [-13, 0], [-1, -11], [-19, -9]], // employee.jingyuniang.skin.v1.typing.front
  'e1f3421ad27c37f22b895799a597ab0b67a02c0cdc83e470f3bc964eb0077bc4': [[0, 0], [0, 0], [0, 0], [-1, 0]], // employee.jingyuniang.typing.back-left.v1
  '222382597abea9654458f86e749e48c2864c89721df330294c8b177cb75e78a1': [[0, 0], [1, 0], [0, 0], [1, 0]], // employee.jingyuniang.typing.back-right.v1
  '6de0fda03a227f5f550db3c38c0c1b2fe7bc4f29452e984532887b9ce7619080': [[0, 0], [-1, 0], [-5, 0], [-8, 0]], // employee.jingyuniang.typing.back.v1
  'c294213a5643cdbd87f05998ef8ab46c895ad3317128a1dc7e8e7e2a8d046dad': [[0, 0], [0, 0], [0, 0], [0, 0]], // employee.jingyuniang.typing.front.v1
  '0c8993f517a1d2fcc060b378a4617530ec2f4b957948678848f9363297796970': [[0, 0], [16, 0], [0, -2], [16, -2]], // employee.longmama.skin.v1.typing.back
  '2f8a39d87d790e0af8c26069395a9b1879501ef83792c7d7559bb96a0787c24a': [[0, 0], [14, 0], [-1, 0], [14, 0]], // employee.longmama.skin.v1.typing.back-left
  'f00ede20d7ae1502a1536cae28c1e798f8160d5c59fa36479a4f4108fd240614': [[0, 0], [54, 0], [0, 1], [53, 1]], // employee.longmama.skin.v1.typing.back-right
  '6344aa9aee57ea7e97cf947b189e99af69275a1549e5e542332d5e0e1fccdfa7': [[0, 0], [61, 0], [0, 4], [60, 4]], // employee.longmama.skin.v1.typing.front
  '39fe0724b9d8de9c8a55ee11916fd7f2c92795858fa273d845e1dee3e86e2b03': [[0, 0], [17, 1], [35, 0], [51, 0]], // employee.longmama.typing.back-left.v1
  '23b0510d95ee0b63e6e4dae4b76266186d758de6dd9e9607020dc152ea410382': [[0, 0], [0, 0], [0, 0], [1, 0]], // employee.longmama.typing.back-right.v1
  '6d5cbfd16381482028f169b6ecb6cdb60ec1ab19e054f560cbbdef33d86573f2': [[0, 0], [4, 0], [15, 0], [23, 0]], // employee.longmama.typing.back.v1
  '0861525ee9dde0306b815b7c22401b9307fb9d5c11da2b53bda12474e5e2816f': [[0, 0], [-1, 0], [-1, 0], [0, 0]], // employee.longmama.typing.front.v1
  '0bcd599c420fb38efa4c8b40afa91504f8bf3d9d9f81bddaa804199eb521b843': [[0, 0], [55, -1], [-6, 7], [48, 2]], // employee.lu-mi.skin.v1.typing.back
  '64cb113de8582fa743d89f5285e2df1d686d7625c60748b54f3b7bb48bfdb958': [[0, 0], [41, 0], [0, 0], [40, 0]], // employee.lu-mi.skin.v1.typing.back-left
  '6afac10897a884be4156d498bb323d1431212aef3d52d015058965164c755f4b': [[0, 0], [18, 0], [1, 1], [14, 0]], // employee.lu-mi.skin.v1.typing.back-right
  '283972e692f4f83910daccbb948f58479623c93f76bd9b8e65dabf5b5ad60fc0': [[0, 0], [32, 0], [-1, 0], [31, 0]], // employee.lu-mi.skin.v1.typing.front
  '964ac3b26668f8f3ea8577d1c4bbc5707b59ed76824ff490c91dabfceeaa6968': [[0, 0], [3, -2], [2, -4], [1, -2]], // employee.lu-mi.typing.back-left.plugin-r1
  'b955187a85b3db753c9f20ba95fafc3451bb84f1506d00539b3b8d42e1b92bfb': [[0, 0], [0, 0], [0, -2], [0, -1]], // employee.lu-mi.typing.back-right.plugin-r1
  '2ea41b62b3d8f6257ff6cb643710bacd34cb4e59375d7767a13de81b361038d2': [[0, 0], [1, -3], [-1, -7], [1, -3]], // employee.lu-mi.typing.back.plugin-r1
  '2f78430655923f263aa03af36278de8b4b8b932bc509742a101c0ece51e873e9': [[0, 0], [2, 0], [2, -1], [1, -1]], // employee.lu-mi.typing.front.plugin-r1
  'e69be089989e30cbd6ea921a87de4a7e436895709a29bce7f962bd98bcc489dd': [[0, 0], [44, 0], [-2, 5], [39, 2]], // employee.shan.skin.v1.typing.back
  'b9ba210b28c0d4c7b456656e55b18a7c061800cb0269255add898459abd2cf86': [[0, 0], [27, -3], [-3, -2], [27, -4]], // employee.shan.skin.v1.typing.back-left
  '962ce759710094411a9411a8082da6bbf99c9ccad43107018e56e4ff83e64919': [[0, 0], [49, -1], [2, -1], [49, 1]], // employee.shan.skin.v1.typing.back-right
  'db9da98c8e12c2c2edfab4df67c05db340731604e9e2067a88cea87eb844ba81': [[0, 0], [17, 0], [-3, 0], [17, -1]], // employee.shan.skin.v1.typing.front
}

/** Correction in original cell pixels. A positive X/Y moves the drawing right/down. */
export function deskFrameRegistration(sourceSha: string, frame: number): Offset | undefined {
  return offsets[sourceSha]?.[frame]
}
