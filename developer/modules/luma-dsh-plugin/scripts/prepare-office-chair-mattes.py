"""Compile reviewed rear-pose alpha mattes so illustrated offices retain their own chairs."""
import hashlib
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

plugin = Path(__file__).resolve().parents[1]
registry = plugin.parents[1] / 'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/sceneChairMattes.generated.json'
manifest = plugin / 'lib/asset-manifest.json'
sources = {
    '2e164d0a28021583aa1c7280851ba1dd8fe1d43993a769508d406a76c1fab41c': 'shan',
    'e69be089989e30cbd6ea921a87de4a7e436895709a29bce7f962bd98bcc489dd': 'shan',
    '54f701a3a0a245b558f4cf8a33f3b16ff2389ffd5ae633af46565b7cbc9b5cb6': 'bai-shuangming',
    '91b680686e7da34b1231179275a2f5cf6dc0a7fdda0ddb147114a1ba4f42e29e': 'bai-shuangming',
    '2ea41b62b3d8f6257ff6cb643710bacd34cb4e59375d7767a13de81b361038d2': 'lu-mi',
    '0bcd599c420fb38efa4c8b40afa91504f8bf3d9d9f81bddaa804199eb521b843': 'lu-mi',
    '6de0fda03a227f5f550db3c38c0c1b2fe7bc4f29452e984532887b9ce7619080': 'jingyuniang',
    '4655690f2405c6528acf7ee9c3e5a42802064f656ef7e9cfac61c7929c1e9342': 'jingyuniang',
    '6d5cbfd16381482028f169b6ecb6cdb60ec1ab19e054f560cbbdef33d86573f2': 'longmama',
    '0c8993f517a1d2fcc060b378a4617530ec2f4b957948678848f9363297796970': 'longmama',
    '613ce89a32070e604940dd175c4716f02d9d1ff1d0cd3bd647fe6c776afee970': 'claude',
    '783f5980c465745eea4a10d88d180d628acd23ff76fa33e57965fa092ac0301b': 'claude',
    '5672f2154cd47b4ce190260e241278722f2ddde0086645b2227f2b2e2f4a03a8': 'gemini',
    'e86241962e3ae1707ccd4414aba8d4ea9f451bbebd1f98f26a7823d80f72e99a': 'grok',
}
backrest_top = {'shan':.38, 'bai-shuangming':.405, 'lu-mi':.62, 'jingyuniang':.47,
                'longmama':.49, 'claude':.56, 'gemini':.44, 'grok':.46}


def matte_for(cell, role):
    left, top, right, bottom = cell.getchannel('A').point(lambda a: 255 if a > 64 else 0).getbbox()
    x, y = np.meshgrid((np.arange(cell.width)-left)/(right-left), (np.arange(cell.height)-top)/(bottom-top))
    rgb = np.asarray(cell, dtype=np.int16)[:,:,:3]
    brightest = rgb.max(axis=2)
    upholstery = (brightest-rgb.min(axis=2) < 20+.13*brightest) & (brightest < 182)
    start = backrest_top[role]
    if role == 'lu-mi':
        # Preserve the dark hair over the middle of the chair.
        start = .52+.16*(1-np.minimum(1,abs(2*x-1)))**.6
    casters = (y>.865) & (abs(x-.5)<.45)
    remove = Image.fromarray(np.uint8(((y>start)&upholstery)|casters)*255)
    return remove.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.5)).point(lambda a:255-a)


rows = json.loads(manifest.read_text(encoding='utf8'))
lookup = {row['sha256']: row['path'] for row in rows}
new_rows, mapping = {}, {}
for source, role in sources.items():
    raw = (plugin/'public'/lookup[source]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != source:
        raise ValueError('Seated artwork changed: ' + lookup[source])
    with Image.open(io.BytesIO(raw)) as bitmap:
        strip = bitmap.convert('RGBA')
    assert strip.size == (2048,860)
    output = Image.new('LA', strip.size, (255,255))
    for frame in range(4):
        box=(512*frame,0,512*(frame+1),860)
        alpha=matte_for(strip.crop(box),role)
        cell=Image.new('LA',alpha.size,(255,255));cell.putalpha(alpha)
        output.paste(cell,box)
    file=io.BytesIO();output.save(file,format='PNG',optimize=True)
    result=file.getvalue()
    rel='luma-office/luma-plugin-art/office-chair-mattes/'+source[:16]+'.png'
    digest=hashlib.sha256(result).hexdigest()
    for directory in [plugin/'public',plugin/'art/release-assets']:
        dest=directory/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(result)
    new_rows[rel]={'path':rel,'bytes':len(result),'sha256':digest}
    mapping[source]={'path':'/'+rel,'sha256':digest}
# Pick up any unrelated release changes while the image pass was running.
current={row['path']:row for row in json.loads(manifest.read_text(encoding='utf8'))}
current.update(new_rows)
manifest.write_text(json.dumps([current[k] for k in sorted(current)],ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
registry.write_text(json.dumps(mapping,indent=2)+'\n',encoding='utf8',newline='\n')
