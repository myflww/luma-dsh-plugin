import { PERSONAL_BEDROOMS } from './bedroom-personal-layouts.ts'
import { mapShopBedrooms } from './bedroom-shop-layouts.ts'
import { isShopBedroomId } from '../shared/shop-bedrooms.ts'
import type { BedroomRoom } from './bedroom-floor.ts'
import shopImages from './shop-bedroom-images.generated.json' with { type:'json' }
// Bedroom image URLs. Import personal-room PNG replacements with scripts/import-bedroom-themes.mjs.
export const CLASSIC_BEDROOM_ART = {
  "size": [
    1600,
    1000
  ],
  "head": [
    561,
    464
  ],
  "feet": [
    433,
    537
  ],
  "stand": [
    826,
    744
  ],
  "day": "/luma-office/luma-plugin-art/bedroom-classic-day.86dc77f52d3f.png",
  "night": "/luma-office/luma-plugin-art/bedroom-classic-night.1d3b7e9ed5f7.png"
} as const
export const BEDROOM_ART = {
  "shan": {
    size:[1586,992],
    head:PERSONAL_BEDROOMS['shan'].head, feet:PERSONAL_BEDROOMS['shan'].feet, stand:PERSONAL_BEDROOMS['shan'].stops.center,
    "day": "/luma-office/luma-plugin-art/bedroom-shan-day.c0159526fdb4.png",
    "night": "/luma-office/luma-plugin-art/bedroom-shan-night.d553718911a5.png"
  },
  "bai-shuangming": {
    size:[1586,992],
    head:PERSONAL_BEDROOMS['bai-shuangming'].head, feet:PERSONAL_BEDROOMS['bai-shuangming'].feet, stand:PERSONAL_BEDROOMS['bai-shuangming'].stops.center,
    "day": "/luma-office/luma-plugin-art/bedroom-bai-shuangming-day.d033fee7015c.png",
    "night": "/luma-office/luma-plugin-art/bedroom-bai-shuangming-night.ebbcad22db84.png"
  },
  "lu-mi": {
    size:[1586,992],
    head:PERSONAL_BEDROOMS['lu-mi'].head, feet:PERSONAL_BEDROOMS['lu-mi'].feet, stand:PERSONAL_BEDROOMS['lu-mi'].stops.center,
    "day": "/luma-office/luma-plugin-art/bedroom-lu-mi-day.5a3d7661c703.png",
    "night": "/luma-office/luma-plugin-art/bedroom-lu-mi-night.7b557158ded4.png"
  },
  "jingyuniang": {
    "size": [
      1586,
      992
    ],
    "head": [
      361,
      451
    ],
    "feet": [
      551,
      523
    ],
    "stand": [
      1160,
      512
    ],
    "day": "/luma-office/assets/bedroom-jingyuniang-noon.10b1d293c65b.png",
    "night": "/luma-office/assets/bedroom-jingyuniang-night.d3d29defc4c6.png"
  },
  "longmama": {
    "size": [
      1586,
      992
    ],
    "head": [
      355,
      482
    ],
    "feet": [
      483,
      538
    ],
    "stand": [
      1158,
      539
    ],
    "day": "/luma-office/assets/bedroom-longmama-noon.5ce044c0af68.png",
    "night": "/luma-office/assets/bedroom-longmama-night.aa05da14180c.png"
  },
  "claude": {
    "size": [
      1586,
      992
    ],
    "head": [
      363,
      493
    ],
    "feet": [
      550,
      579
    ],
    "stand": [
      1248,
      710
    ],
    "day": "/luma-office/assets/bedroom-claude-noon.c97d7feea497.png",
    "night": "/luma-office/assets/bedroom-claude-night.2a993e141bc6.png"
  },
  "gemini": {
    "size": [
      1585,
      992
    ],
    "head": [
      350,
      454
    ],
    "feet": [
      528,
      528
    ],
    "stand": [
      1163,
      611
    ],
    "day": "/luma-office/assets/bedroom-gemini-noon.0019a8ec58a6.png",
    "night": "/luma-office/assets/bedroom-gemini-night.5451fa1db07f.png"
  },
  "grok": {
    "size": [
      1586,
      992
    ],
    "head": [
      354,
      447
    ],
    "feet": [
      545,
      538
    ],
    "stand": [
      1146,
      563
    ],
    "day": "/luma-office/assets/bedroom-grok-noon.48c47341447f.png",
    "night": "/luma-office/assets/bedroom-grok-night.bcaad21affe0.png"
  }
} as const
export const BEDROOM_SLEEP = {
  "shan": {
    "url": "/luma-office/luma-plugin-art/bedroom-shan-sleep.24cd5a1c94dc.png",
    "head": [
      0.752,
      0.236
    ],
    "feet": [
      0.22,
      0.88
    ]
  },
  "bai-shuangming": {
    "url": "/luma-office/luma-plugin-art/bedroom-bai-shuangming-sleep.9e9d91ed7cd8.png",
    "head": [
      0.762,
      0.2
    ],
    "feet": [
      0.218,
      0.89
    ]
  },
  "lu-mi": {
    "url": "/luma-office/luma-plugin-art/bedroom-lu-mi-sleep.f437b32e305d.png",
    "head": [
      0.748,
      0.235
    ],
    "feet": [
      0.229,
      0.861
    ]
  },
  "jingyuniang": {
    "url": "/luma-office/luma-plugin-art/bedroom-jingyuniang-sleep.ceecf1194df8.png",
    "head": [
      0.715,
      0.225
    ],
    "feet": [
      0.179,
      0.91
    ]
  },
  "longmama": {
    "url": "/luma-office/luma-plugin-art/bedroom-longmama-sleep.2dfd5ccbc480.png",
    "head": [
      0.766,
      0.265
    ],
    "feet": [
      0.242,
      0.884
    ]
  },
  "claude": {
    "url": "/luma-office/luma-plugin-art/bedroom-claude-sleep.4293ab7b5a01.png",
    "head": [
      0.721,
      0.263
    ],
    "feet": [
      0.234,
      0.867
    ]
  }
} as const

export const SHOP_BEDROOM_ART = mapShopBedrooms((layout,id)=>{
  const image=shopImages[id]
  return {size:[image.width,image.height] as const,head:layout.head,feet:layout.feet,stand:layout.stops.center,
    day:image.day,night:image.night}
})
export function getBedroomArt(room:BedroomRoom) {
  if (room==='classic') return CLASSIC_BEDROOM_ART
  return isShopBedroomId(room)?SHOP_BEDROOM_ART[room]:BEDROOM_ART[room]
}
