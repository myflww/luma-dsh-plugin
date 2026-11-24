/** Uniform per-cell scale about the registered foot point, in thousandths.
 * These ten authored strips have discontinuities in the original drawing scale.
 * Small phase-dependent changes in silhouette and travel are retained. */
export const WALK_FRAME_FIT: Readonly<Record<string, {
  readonly foot: readonly [number, number]
  readonly scale: readonly number[]
}>> = {
  // employee.bai-shuangming.walk.right.v4
  '81b46f942cf8523f6100a991d1534f4770dfe54aed2af8a1d60ef4a7c75f74f2': {
    foot: [296.0, 701.0],
    scale: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 967, 963, 967, 999, 1000, 1000, 1000, 1000, 999, 971, 967, 967, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
  },
  // employee.claude.walk.left.v1
  '07a0cb67438329f9ff77aec50a0b2ac112898fafe89dfa6c8890987368c591a6': {
    foot: [296.0, 699.0],
    scale: [988, 976, 984, 984, 984, 984, 988, 984, 984, 984, 996, 1000, 1002, 1002, 1002, 1002, 1000, 1002, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 996],
  },
  // employee.claude.walk.up.v1
  '6f6da398601ac48d715d8af784074e6467ea434ab2f4fb0118002ccfd2d0dd63': {
    foot: [296.0, 699.0],
    scale: [964, 953, 976, 984, 992, 964, 972, 972, 1000, 1025, 1044, 1025, 1030, 1039, 1003, 1021, 1000, 953],
  },
  // employee.gemini.skin.v1.walk.left
  '0b2dbcd82535dfb16c956aaa3b408eedcd015b86c1c86c881dc39b793984dcec': {
    foot: [265.0, 674.0],
    scale: [965, 972, 976, 984, 980, 984, 988, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 988, 1000, 1000, 1000, 1000, 1000, 1003, 1012, 1007, 1007, 1000, 1000, 1000, 1000, 988, 997, 984, 972],
  },
  // employee.gemini.skin.v1.walk.right
  '09cd5ac92027ba813401b9c150881182309729d5e7ed6ad7f76f3f654b2c376f': {
    foot: [323.0, 679.0],
    scale: [998, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1003, 1016, 1007, 1003, 1000, 1000, 1000, 1000, 1000, 994, 1000, 1000, 994, 982, 994, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 986, 982, 990, 986],
  },
  // employee.gemini.skin.v1.walk.up
  'c1b2067699d8408cca6a083b3186e5da48607f59c3cba91488d01c356454785e': {
    foot: [296.0, 678.0],
    scale: [1000, 1000, 1000, 1009, 1009, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 996, 996, 1000, 1013, 1000, 1000],
  },
  // employee.grok.skin.v1.walk.down
  'b7c827d3b9c27f56d1b892fc6f3b471c01a3aa3f790e3f56a1363ff832e21512': {
    foot: [292.0, 682.0],
    scale: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1016, 1000, 991, 987, 991, 1000, 1012, 1004, 1000],
  },
  // employee.grok.skin.v1.walk.right
  'c225bcb2835c5b765e5739a00f3ae171dbeb3adbf74b352e2afaab1846ebb53e': {
    foot: [296.0, 682.0],
    scale: [1001, 1000, 1000, 992, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 996, 1000, 1000, 1010, 1000, 984, 984, 980, 980, 980, 980, 1000],
  },
  // employee.jingyuniang.skin.v1.walk.down
  'd925c42ecc681feda64efe57d3f44917e9f02e0faf8e995a949662673f123f1b': {
    foot: [322.0, 700.0],
    scale: [991, 991, 987, 987, 999, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1009, 1009, 1013, 1017, 1000, 991],
  },
  // employee.jingyuniang.skin.v1.walk.left
  '6885c3080ab5ba9bc9767a02ab224d45a6a2c27c25edbcdd86b60d3fb64069b4': {
    foot: [240.0, 670.0],
    scale: [951, 951, 951, 954, 954, 954, 954, 951, 951, 951, 954, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 947],
  },
}
