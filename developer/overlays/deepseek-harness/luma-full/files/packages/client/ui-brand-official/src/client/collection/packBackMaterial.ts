/** Shared, demand-rendered pack-back surface. The original PNG remains the ink layer.
 * Region estimates and shallow normals add texture-space optical relief; they do
 * not invent a volumetric crystal model or replace the source composition. */
export interface PackLighting { azimuth: number; elevation: number; intensity: number }
export type PackBackFamily = 'first-meeting-journey' | 'dawn-prelude' | 'blue-rose-echo' | 'moon-collection' | 'egg-channel'
export interface PackBackSurfaceSettings { lighting?: PackLighting; yaw?: number; pitch?: number }
export interface PackBackSurfaceHandle {
  update(settings?: PackBackSurfaceSettings): boolean
  dispose(): void
  readonly ready: boolean
}
export interface PackBackSurfaceOptions {
  url: string
  packId: PackBackFamily
  onReady?(canvas: HTMLCanvasElement): void
  onError?(error: unknown): void
}
export const DEFAULT_PACK_LIGHTING: Readonly<PackLighting> = Object.freeze({ azimuth: -35, elevation: 40, intensity: 1.15 })
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))
const finite = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback
export function normalizePackLighting(raw?: unknown): PackLighting {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return { azimuth: clamp(finite(input.azimuth, DEFAULT_PACK_LIGHTING.azimuth), -180, 180),
    elevation: clamp(finite(input.elevation, DEFAULT_PACK_LIGHTING.elevation), 10, 80),
    intensity: clamp(finite(input.intensity, DEFAULT_PACK_LIGHTING.intensity), .35, 2) }
}
const families: Readonly<Record<string, PackBackFamily>> = { '端木嫣': 'dawn-prelude', '陆弥': 'blue-rose-echo', '白霜命': 'moon-collection',
  '鲸鱼娘': 'first-meeting-journey', '龙妈妈': 'first-meeting-journey', '克劳德': 'first-meeting-journey',
  '吉米': 'first-meeting-journey', '绯洛': 'first-meeting-journey' }
export function packBackFamilyForCard(card: { workId?: string; character?: string } | null | undefined): PackBackFamily | null {
  return ['LR-01', 'RH-05', 'MOON-ASTROLABE'].includes(card?.workId ?? '') ? 'egg-channel' : families[card?.character?.trim() ?? ''] ?? null
}
/** Back-local directions. At yaw=180 the back faces the viewer. Pitch follows
 * the React card's rotateX(-pitch); native engines pass the inverse actual X. */
export function packBackLightingVectors(lighting?: unknown, yaw = 180, pitch = 0): { light: [number, number, number]; view: [number, number, number] } {
  const settings = normalizePackLighting(lighting), rad = Math.PI / 180
  const az = settings.azimuth * rad, el = settings.elevation * rad
  const y = (finite(yaw, 180) - 180) * rad, x = clamp(finite(pitch, 0), -89, 89) * rad
  const local = ([vx, vy, vz]: [number, number, number]): [number, number, number] => {
    const py = Math.cos(x) * vy - Math.sin(x) * vz, pz = Math.sin(x) * vy + Math.cos(x) * vz
    return [Math.cos(y) * vx - Math.sin(y) * pz, py, Math.sin(y) * vx + Math.cos(y) * pz]
  }
  return { light: local([Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]), view: local([0, 0, 1]) }
}

const vertex = `#version 300 es
in vec2 position;out vec2 vUv;
void main(){vUv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`
export const PACK_BACK_MATERIAL_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uInk;uniform vec2 uSize;uniform vec3 uLight,uView;uniform float uIntensity,uFamily;
in vec2 vUv;out vec4 outColor;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 ink(vec2 uv){return texture(uInk,clamp(uv,vec2(.001),vec2(.999))).rgb;}
void main(){
 vec2 uv=vUv,px=1./uSize;
 vec3 base=ink(uv);if(uFamily<0.){outColor=vec4(base,1.);return;}
 float value=lum(base),hi=max(base.r,max(base.g,base.b)),lo=min(base.r,min(base.g,base.b));
 float sat=(hi-lo)/max(hi,.03);
 // Conservative color/material coverage. Dark enamel remains predominantly ink.
 vec2 p=(uv-.5)*vec2(uSize.x/uSize.y,1.);
 float center=1.-smoothstep(.16,.39,length(p));
 float colored=smoothstep(.19,.46,sat)*smoothstep(.08,.3,value);
 float cool=smoothstep(.015,.11,max(base.b,base.g)-base.r);
 float crystal=colored*cool*center*(uFamily==1.?0.:1.);
 // The blue family has cobalt roses as well as a sapphire: limit hard facets
 // to the central diamond, so petals retain soft printed relief.
 if(uFamily==2.){
  bool wide=uSize.x>uSize.y;
  vec2 q=(uv-vec2(.5,wide?.52:.56))/vec2(wide?.105:.18,wide?.15:.125);
  crystal*=1.-smoothstep(.8,1.05,abs(q.x)+abs(q.y));
 }
 if(uFamily==0.)crystal*=1.-smoothstep(.85,1.2,length((uv-.5)/vec2(.24,.20)));
 float warm=smoothstep(-.015,.09,base.r-base.b);
 float detail=abs(lum(ink(uv+vec2(px.x*2.,0.)))-lum(ink(uv-vec2(px.x*2.,0.))))
  +abs(lum(ink(uv+vec2(0.,px.y*2.)))-lum(ink(uv-vec2(0.,px.y*2.))));
 float metal=smoothstep(.025,.12,detail)*smoothstep(.18,.55,value)*(1.-crystal*.85);
 metal=max(metal,warm*smoothstep(.2,.6,value)*.6)*(uFamily==1.?.8:1.);
 // Ivory petals are not metal: champagne-gold chroma identifies the dawn
 // engraving, while low-chroma pearl and rose surfaces keep softer normals.
 if(uFamily==1.)metal*=smoothstep(.13,.32,sat)*smoothstep(.005,.09,base.r-base.b);
 float pearl=(1.-smoothstep(.1,.32,sat))*smoothstep(.4,.82,value)*(uFamily==1.?1.:.23)*(1.-metal*.75);
 float gx=lum(ink(uv+vec2(px.x*2.,0.)))-lum(ink(uv-vec2(px.x*2.,0.)));
 float gy=lum(ink(uv+vec2(0.,px.y*2.)))-lum(ink(uv-vec2(0.,px.y*2.)));
 // Shallow etched relief follows printed edges. Crystal facets stay local.
 float a=atan(p.y,p.x),stepAngle=6.283185/10.;float facet=floor((a+3.141593)/stepAngle)*stepAngle-3.141593+stepAngle*.5;
 float facetSlope=mix(.48,.84,step(.11,mod(length(p),.22)));
 vec2 cut=vec2(cos(facet),sin(facet))*facetSlope*crystal;
 float normalStrength=mix(1.4,5.5,clamp(metal+crystal,0.,1.));
 normalStrength=mix(normalStrength,1.5,pearl*.85);
 vec3 N=normalize(vec3(clamp(-gx*normalStrength,-1.2,1.2),clamp(-gy*normalStrength,-1.2,1.2),1.)+vec3(cut,0.));
 vec3 L=normalize(uLight),V=normalize(uView),H=normalize(L+V);
 float ndl=max(dot(N,L),0.),ndv=max(abs(dot(N,V)),.06),fres=pow(1.-ndv,4.);
 // Refraction samples a few nearby texels, including subtle dispersion, never
 // samples another picture or displaces the outer border.
 vec2 shift=(N.xy+V.xy*.5)*px*14.*crystal;
 vec3 refracted=vec3(ink(uv+shift*1.14).r,ink(uv+shift).g,ink(uv+shift*.88).b);
 vec3 color=mix(base,refracted,crystal*.3);
 float relief=clamp(dot(N,L)-max(L.z,0.),-.6,.6);
 color*=clamp(1.+relief*(metal*.65+pearl*.25+crystal*.8)*uIntensity,.66,1.5);
 // Directional metallic reflection is confined to identified ornament detail.
 float spec=pow(max(dot(N,H),0.),12.);
 float softbox=smoothstep(.64,.97,dot(reflect(-V,N),L));
 float streak=pow(max(dot(normalize(vec3(N.x*.35,N.y,1.)),H),0.),28.);
 vec3 metalTint=mix(vec3(.76,.86,1.),vec3(1.,.83,.55),warm);
 vec3 shine=metalTint*metal*(spec*.4+softbox*.2+streak*.08);
 float crystalSpec=pow(max(dot(N,H),0.),18.);
 shine+=vec3(.78,.92,1.)*crystal*(crystalSpec*.44+softbox*.16+fres*.12);
 vec3 nacre=.5+.5*cos(vec3(.1,2.2,4.3)+(dot(N,L)*4.2+L.x*uv.x*3.+dot(V,N)*7.));
 shine+=pearl*(vec3(.045)+nacre*.055)*pow(max(dot(N,H),0.),6.);
 // Broad exposure has a small bounded range; white ink keeps highlight headroom.
 float exposure=clamp(.97+(uIntensity-1.)*.11,.90,1.08);
 color=color*exposure+shine*uIntensity*(1.-base*.74);
 outColor=vec4(clamp(color,0.,1.),1.);
}`

export function createPackBackSurface(canvas: HTMLCanvasElement, { url, packId, onReady, onError }: PackBackSurfaceOptions): PackBackSurfaceHandle {
  let disposed = false, ready = false, lastDraw = ''
  let gl: WebGL2RenderingContext | null = null, program: WebGLProgram | null = null
  let texture: WebGLTexture | null = null, buffer: WebGLBuffer | null = null, image: HTMLImageElement | undefined
  const shaders: WebGLShader[] = []
  const uniforms: Record<'uInk' | 'uSize' | 'uLight' | 'uView' | 'uIntensity' | 'uFamily', WebGLUniformLocation | null> =
    { uInk: null, uSize: null, uLight: null, uView: null, uIntensity: null, uFamily: null }
  let pending = { lighting: normalizePackLighting(), yaw: 180, pitch: 0 }
  const family = ['first-meeting-journey', 'dawn-prelude', 'blue-rose-echo', 'moon-collection'].indexOf(packId)
  function dispose() {
    if (disposed) return
    disposed = true; ready = false
    canvas?.removeEventListener?.('webglcontextlost', contextLost)
    if (image) { image.onload = image.onerror = null; image.src = '' }
    if (gl) {
      if (texture) gl.deleteTexture(texture)
      if (buffer) gl.deleteBuffer(buffer)
      if (program) gl.deleteProgram(program)
      for (const shader of shaders) gl.deleteShader(shader)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
  function fail(error: unknown): void { if (disposed) return; dispose(); onError?.(error instanceof Error ? error : new Error(String(error))) }
  function contextLost(event: Event): void { event.preventDefault(); fail(new Error('卡背材质渲染暂不可用')) }
  function update(next: PackBackSurfaceSettings = {}): boolean {
    if (disposed) return false
    pending = { lighting: next.lighting === undefined ? pending.lighting : normalizePackLighting(next.lighting),
      yaw: finite(next.yaw, pending.yaw), pitch: clamp(finite(next.pitch, pending.pitch), -89, 89) }
    if (!ready || !gl || !program) return false
    const key = JSON.stringify(pending)
    if (key === lastDraw) return false
    try {
      const vectors = packBackLightingVectors(pending.lighting, pending.yaw, pending.pitch)
      gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(program)
      gl.uniform3fv(uniforms.uLight, vectors.light); gl.uniform3fv(uniforms.uView, vectors.view)
      gl.uniform1f(uniforms.uIntensity, pending.lighting.intensity)
      gl.drawArrays(gl.TRIANGLES, 0, 6); lastDraw = key
      return true
    } catch (error) { fail(error); return false }
  }
  try {
    if (!canvas || typeof url !== 'string' || !url) throw new Error('卡背材质缺少完整图像')
    const context = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false })
    if (!context) throw new Error('卡背材质需要 WebGL2')
    gl = context
    canvas.addEventListener('webglcontextlost', contextLost)
    const compile = (type: number, source: string): WebGLShader => {
      const shader = context.createShader(type)
      if (!shader) throw new Error('卡背材质无法分配着色器')
      shaders.push(shader); context.shaderSource(shader, source); context.compileShader(shader)
      if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) throw new Error(context.getShaderInfoLog(shader) || '卡背材质编译失败')
      return shader
    }
    const linkedProgram = context.createProgram()
    if (!linkedProgram) throw new Error('卡背材质无法分配程序')
    program = linkedProgram
    context.attachShader(linkedProgram, compile(context.VERTEX_SHADER, vertex)); context.attachShader(linkedProgram, compile(context.FRAGMENT_SHADER, PACK_BACK_MATERIAL_FRAGMENT)); context.linkProgram(linkedProgram)
    if (!context.getProgramParameter(linkedProgram, context.LINK_STATUS)) throw new Error(context.getProgramInfoLog(linkedProgram) || '卡背材质连接失败')
    context.useProgram(linkedProgram); buffer = context.createBuffer(); context.bindBuffer(context.ARRAY_BUFFER, buffer)
    context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), context.STATIC_DRAW)
    const location = context.getAttribLocation(linkedProgram, 'position'); context.enableVertexAttribArray(location); context.vertexAttribPointer(location, 2, context.FLOAT, false, 0, 0)
    for (const name of Object.keys(uniforms) as (keyof typeof uniforms)[]) uniforms[name] = context.getUniformLocation(linkedProgram, name)
    const inkTexture = context.createTexture(); texture = inkTexture
    context.activeTexture(context.TEXTURE0); context.bindTexture(context.TEXTURE_2D, inkTexture)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR); context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE); context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
    const sourceImage = new Image(); image = sourceImage; sourceImage.decoding = 'async'
    sourceImage.onload = () => {
      if (disposed) return
      try {
        canvas.width = sourceImage.naturalWidth; canvas.height = sourceImage.naturalHeight
        if (!canvas.width || !canvas.height) throw new Error('卡背图像尺寸无效')
        context.useProgram(linkedProgram); context.activeTexture(context.TEXTURE0); context.bindTexture(context.TEXTURE_2D, inkTexture)
        context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true); context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, sourceImage)
        context.uniform1i(uniforms.uInk, 0); context.uniform2f(uniforms.uSize, canvas.width, canvas.height); context.uniform1f(uniforms.uFamily, family)
        ready = true; update(); if (!disposed) onReady?.(canvas)
      } catch (error) { fail(error) }
    }
    sourceImage.onerror = () => fail(new Error('卡背图像暂时无法加载')); sourceImage.src = url
  } catch (error) { queueMicrotask(() => fail(error)) }
  return { update, dispose, get ready() { return ready && !disposed } }
}
