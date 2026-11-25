/** One purchase unlocks the room design for every resident in this profile. */
export const SHOP_BEDROOMS = [
  {id:'bedroom.shop.rose-sketchbook.v1', name:'蔷薇画房', price:120},
  {id:'bedroom.shop.sapphire-music.v1', name:'宝蓝琴房', price:120},
  {id:'bedroom.shop.alpine-library.v1', name:'雪原书斋', price:120},
  {id:'bedroom.shop.camellia-pavilion.v1', name:'山茶花亭', price:180},
  {id:'bedroom.shop.blue-rose-gallery.v1', name:'蓝晶蔷薇廊', price:180},
  {id:'bedroom.shop.frostwing-glasshouse.v1', name:'霜蝶玻璃馆', price:180},
] as const
export type ShopBedroom = (typeof SHOP_BEDROOMS)[number]
export type ShopBedroomId = ShopBedroom['id']
export function shopBedroom(id:unknown) { return SHOP_BEDROOMS.find(room=>room.id===id) }
export function isShopBedroomId(value:unknown):value is ShopBedroomId { return !!shopBedroom(value) }
