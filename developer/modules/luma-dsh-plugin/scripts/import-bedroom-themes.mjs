import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [input,edition] = process.argv.slice(2)
if (!input || !['shop','signature'].includes(edition)) throw Error('Usage: node import-bedroom-themes.mjs <art directory> <shop|signature>')
const root=fileURLToPath(new URL('..',import.meta.url)), supplied=resolve(input)
const prefix='luma-office/luma-plugin-art/'
const artModule=join(root,'src/client/bedroom-art.generated.ts')
const shopModule=join(root,'src/client/shop-bedroom-images.generated.json')
const manifestFile=join(root,'lib/asset-manifest.json')
const originalManifest=await readFile(manifestFile,'utf8'), originalCatalog=await readFile(artModule,'utf8')
const originalShop=existsSync(shopModule)?await readFile(shopModule,'utf8'):undefined
const manifest=JSON.parse(originalManifest), add=[], shop={}
let catalog=originalCatalog
const roleIds=['shan','lu-mi','bai-shuangming']
const shopSlugs=[['rose-sketchbook','sapphire-music','alpine-library'],['camellia-pavilion','blue-rose-gallery','frostwing-glasshouse']]
const rooms=edition==='signature'?roleIds.map(role=>({folder:'signature',role,stem:'bedroom-'+role})):
  shopSlugs.flatMap((slugs,index)=>slugs.map((slug,i)=>({folder:'shop-r'+(index+1),role:roleIds[i],stem:'bedroom-shop-'+slug,shopId:'bedroom.shop.'+slug+'.v1'})))
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
for(const room of rooms){
  const pair={}
  for(const phase of ['day','night']){
    const file=join(supplied,room.folder,room.role+'-'+phase+'.png'), bytes=await readFile(file)
    if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR')throw Error('Invalid PNG: '+file)
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20)
    if(width<1024||height<640||width<=height)throw Error('Expected a landscape illustration: '+file)
    if(pair.width && (width!==pair.width||height!==pair.height))throw Error('Day/night sizes differ: '+room.stem)
    pair.width=width;pair.height=height
    const sha256=digest(bytes), stem=prefix+room.stem+'-'+phase+'.', path=stem+sha256.slice(0,12)+'.png'
    const rows=manifest.filter(row=>row.path.startsWith(stem)&&row.path.endsWith('.png'))
    if(rows.length>1 || (!room.shopId && rows.length!==1))throw Error('Unexpected prior registrations: '+stem)
    const row=rows[0]
    if(!room.shopId) {
      if(!catalog.includes('/'+row.path)&&!catalog.includes('/'+path))throw Error('Missing room binding: '+row.path)
      catalog=catalog.replace('/'+row.path,'/'+path)
    }
    const entry={path,bytes:bytes.length,sha256}
    if(row)Object.assign(row,entry);else manifest.push(entry)
    add.push({file,path,sha256})
    pair[phase]='/'+path
  }
  if(room.shopId)shop[room.shopId]=pair
}
for(const asset of add)for(const location of ['art/release-assets','public']){
  const dst=join(root,location,asset.path)
  await mkdir(dirname(dst),{recursive:true})
  if(!existsSync(dst))await copyFile(asset.file,dst)
  if(digest(await readFile(dst))!==asset.sha256)throw Error('Different bytes at content-addressed path '+dst)
}
if(await readFile(manifestFile,'utf8')!==originalManifest || await readFile(artModule,'utf8')!==originalCatalog ||
     (existsSync(shopModule)?await readFile(shopModule,'utf8'):undefined)!==originalShop)throw Error('Asset catalogs changed during import. Re-run to retain adjacent edits.')
if(edition==='shop')await writeFile(shopModule,JSON.stringify(shop,null,2)+'\n')
else await writeFile(artModule,catalog)
await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n')
// Keep superseded textures in the development cache. The offline installer
// requires every file embedded under release-assets to have a current manifest row.
const registered=new Set(manifest.map(row=>row.path))
for(const name of await readdir(join(root,'art/release-assets',prefix))){
  const match=/^bedroom-(?:shan|lu-mi|bai-shuangming|shop-[a-z-]+)-(?:day|night)\.([0-9a-f]{12})\.png$/.exec(name)
  const path=prefix+name
  if(!match||registered.has(path)||!rooms.some(room=>name.startsWith(room.stem+'-')))continue
  const previous=join(root,'art/release-assets',path),sha256=digest(await readFile(previous))
  if(sha256.slice(0,12)!==match[1])throw Error('Previous art has changed: '+previous)
  const saved=join(root,'.runtime/previous-bedroom-themes',path)
  await mkdir(dirname(saved),{recursive:true})
  if(!existsSync(saved))await rename(previous,saved)
  else{
    if(digest(await readFile(saved))!==sha256)throw Error('Saved edition differs: '+saved)
    await unlink(previous)
  }
}
// The native Windows build imports this TypeScript catalog directly in Node 24.
const {BEDROOM_ART,SHOP_BEDROOM_ART}=await import(pathToFileURL(artModule).href)
for(const room of rooms){
  const pair=room.shopId?SHOP_BEDROOM_ART[room.shopId]:BEDROOM_ART[room.role]
  for(const phase of ['day','night'])if(!pair?.[phase]||!registered.has(pair[phase].slice(1)))throw Error('Native room catalog failed: '+room.stem+' '+phase)
}
console.log('Registered '+add.length+' textures for '+edition)
