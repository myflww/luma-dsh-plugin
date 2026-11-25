import { type ReactNode, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowUpRight, BookOpen, Cloud, Database, Download, Info, Monitor, Search, Settings2, Terminal, Upload, Users, X } from 'lucide-react'
import { MAX_PLUGIN_BACKUP_BYTES, SUPPORTED_BACKUP_LINES, PLUGIN_VERSION,
  type PluginBackupPreview, type PluginPreferencesRuntime, type PluginRestoreResult } from './plugin-backup-runtime.ts'
import './PluginSettingsPage.css'
import { CloudOfficeConnection } from './CloudOfficePanel.tsx'
import { CompanionSettingsPanel } from './CompanionPresence.tsx'
import { LoveHouseQuickConnect } from './LoveHouseQuickConnect.tsx'
import { SettingsRolePanel, type SettingsRoster } from './SettingsRolePanel.tsx'
import { StudioDesktopStatus } from './StudioDesktopPicker.tsx'
import { localClientCatalog } from '../shared/local-client-catalog.ts'

const pages = [
  {id: 'general', label: '通用', keywords:'动态 日常陪伴 主动来信 屏幕使用 宿主设置', Icon: Settings2},
  {id: 'roles', label: '角色与模型', keywords:'人格 API 服务 DSH 密钥 自定义端点', Icon: Users},
  {id: 'local', label: '本机 Harness', keywords:'订阅 账号 登录 AI CLI '+localClientCatalog.map(client=>client.name).join(' '), Icon: Terminal},
  {id: 'memory', label: '角色记忆', keywords:'用户画像 更正 遗忘 爱之屋', Icon: BookOpen},
  {id: 'computer', label: '工作室与电脑', keywords:'协作 窗口 辅助功能 agent-desktop 云办公 服务器', Icon: Monitor},
  {id: 'backup', label: '备份与恢复', keywords:'数据 导出 导入 迁移', Icon: Database},
  {id: 'about', label: '版本与帮助', keywords:'检查更新 安装 兼容', Icon: Info},
] as const
type SettingsPage = typeof pages[number]['id']
const groups=[
  {label:'工作室',ids:['general','computer']},
  {label:'角色与服务',ids:['roles','local','memory']},
  {label:'数据与版本',ids:['backup','about']},
]
const orderedPages=groups.flatMap(group=>group.ids.map(id=>pages.find(item=>item.id===id)!))

export interface PluginSettingsPageProps {
  readonly updates?: ReactNode
  readonly runtime: PluginPreferencesRuntime
  readonly roster?: SettingsRoster
  readonly onOpenNativeSettings?: () => void
}
export function PluginSettingsPage({ runtime, roster, onOpenNativeSettings, updates }: PluginSettingsPageProps) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const [busy, setBusy] = useState(false)
  const processing = useRef(false)
  const [page, setPage] = useState<SettingsPage>('general')
  const [query,setQuery]=useState('')
  const searchInput=useRef<HTMLInputElement>(null),heading=useRef<HTMLHeadingElement>(null)
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const options=orderedPages.filter(item=>terms.every(term=>(item.label+' '+item.keywords).toLowerCase().includes(term)))
  const currentPage=pages.find(item=>item.id===page)!
  function navigate(id:SettingsPage) { setPage(id);setQuery('') }
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { if (body.current) body.current.scrollTop = 0 }, [page])
  const [cloudOpen, setCloudOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<PluginBackupPreview>()
  const [selectedFileName, setSelectedFileName] = useState('')
  const [restored, setRestored] = useState<PluginRestoreResult>()
  const file = useRef<HTMLInputElement>(null)
  async function exportData() {
    if (processing.current) return
    processing.current = true
    setBusy(true); setMessage('')
    try {
      const document = await runtime.exportBackup()
      const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json' }))
      const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = `luma-plugin-backup-${document.createdAt.slice(0, 10)}.json`
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(`已导出 ${Object.keys(document.namespaces).length} 类插件设置。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败，请检查 DSH 连接。') }
    finally { processing.current = false; setBusy(false) }
  }
  async function previewFile(selected: File | undefined) {
    if (!selected) return
    if (processing.current) return
    if (file.current) file.current.value = ''
    setPreview(undefined); setRestored(undefined); setMessage('')
    setSelectedFileName(selected.name)
    if (selected.size > MAX_PLUGIN_BACKUP_BYTES) { setMessage('请选择不超过 8 MB 的备份文件。'); return }
    processing.current = true; setBusy(true)
    try { setPreview(await runtime.previewBackup(await selected.text())) }
    catch (error) { setMessage(error instanceof Error ? error.message : '备份无法读取。') }
    finally { processing.current = false; setBusy(false) }
  }
  async function restore() {
    if (!preview || processing.current || !state.writable || !preview.writable) return
    processing.current = true
    setBusy(true); setMessage('')
    try { setRestored(await runtime.restoreBackup(preview.token)); setPreview(undefined) }
    catch (error) { setMessage(error instanceof Error ? error.message : '恢复失败，未继续处理后续项目。') }
    finally { processing.current = false; setBusy(false) }
  }
  return <section className="lumaPluginSettings" aria-label="插件设置">
    <aside className="lumaSettingsIndex">
      <header><h1>插件设置</h1></header>
      <label className="lumaSettingsSearch"><Search size={15} aria-hidden="true"/><input ref={searchInput} type="search" aria-label="搜索设置分类" value={query}
        placeholder="搜索设置" onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{
          if(event.nativeEvent.isComposing)return
          if(event.key==='Enter' && options[0]){event.preventDefault();navigate(options[0].id);queueMicrotask(()=>heading.current?.focus({preventScroll:true}))}
          if(event.key==='Escape'){event.preventDefault();setQuery('')}
        }}/></label>
      <nav aria-label="设置分类">{groups.map(group=>{
        const matches=options.filter(item=>group.ids.includes(item.id))
        return matches.length ? <div className="lumaSettingsGroup" key={group.label}><h3>{group.label}</h3>{matches.map(({id,label,Icon})=><button key={id} type="button"
          aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon aria-hidden="true" size={16}/>{label}</button>)}</div>:null
      })}</nav>
      {!options.length && <div className="lumaSettingsNoMatch"><p role="status">没有匹配的设置分类</p><button type="button" onClick={()=>{setQuery('');searchInput.current?.focus()}}><X size={13}/>清除搜索</button></div>}
    </aside>
    <div className="lumaSettingsBody" ref={body}>
    <header className="lumaSettingsPageTitle"><span><currentPage.Icon size={19} aria-hidden="true"/></span><h2 ref={heading} tabIndex={-1}>{currentPage.label}</h2>
      {page==='about' && <small>Luma {PLUGIN_VERSION.replace(/-web\.\d+$/, '')}</small>}</header>
    {!state.writable && <p className="lumaSettingsReadOnly" role="status">当前 DSH 设置暂不可写。已保存的数据仍可浏览和导出。</p>}
    {page === 'general' && <><section className="lumaSettingsSplit" aria-labelledby="luma-motion-heading"><div><h2 id="luma-motion-heading">动态偏好</h2>
      <p>跟随系统偏好，或减少办公室里的动作播放。</p></div><label><span className="lumaSrOnly">办公室动态</span><select aria-label="办公室动态" value={state.preferences.reducedMotion} disabled={!state.writable || state.pending || busy}
        onChange={event => { void runtime.setReducedMotion(event.target.value as 'system' | 'reduce') }}>
        <option value="system">跟随系统</option><option value="reduce">减少动态</option>
      </select></label>
      {state.problem && <p role="status">{state.problem}</p>}
    </section>
    <CompanionSettingsPanel writable={state.writable}/>
    {onOpenNativeSettings && <section className="lumaSettingsSplit"><div><h2>DSH 设置</h2><p>管理宿主模型、连接与执行权限。</p></div>
      <button type="button" onClick={onOpenNativeSettings}>前往 DSH 设置入口 <ArrowUpRight size={14} aria-hidden="true"/></button></section>}</>}
    {(page === 'roles' || page === 'memory' || page === 'local') && <>
      {roster ? <SettingsRolePanel roster={roster} writable={state.writable} page={page}/> :
        <p role="status">当前入口未提供角色列表。请从 Luma 办公室打开插件设置。</p>}
      {page === 'memory' && <LoveHouseQuickConnect writable={state.writable}/>}</>}
    {page === 'computer' && <><StudioDesktopStatus/>
    <section aria-labelledby="luma-cloud-heading"><div className="lumaSettingsSplit"><div><h2 id="luma-cloud-heading">云办公服务器</h2>
      <p>为角色连接你自己的工作器，整理文档、制作任务表或使用云端模型写作。</p></div>
      <button type="button" aria-expanded={cloudOpen} onClick={()=>setCloudOpen(!cloudOpen)}><Cloud size={15} aria-hidden="true"/>{cloudOpen ? '收起服务器设置' : '配置云办公服务器'}</button></div>
      {cloudOpen && <CloudOfficeConnection writable={state.writable}/>}
    </section></>}
    {page === 'backup' && <section aria-labelledby="luma-backup-heading"><h2 id="luma-backup-heading">插件数据备份</h2>
      <p>导出办公室与衣装、角色设定、卡牌收藏、星币和购包记录。完整迁移还需备份 DSH 档案和爱之屋数据，其中含会话、工作室、角色画像与聊天记忆。换机后需重新填写服务密钥。</p>
      <div className="lumaPluginSettingsActions"><button className="lumaSettingsPrimary" type="button" disabled={busy} onClick={() => { void exportData() }}><Download size={15} aria-hidden="true"/>导出插件数据</button>
        <label className="lumaPluginSettingsFile"><Upload size={15} aria-hidden="true"/>选择备份文件<input ref={file} type="file" accept=".json,application/json" aria-label="选择备份文件" disabled={busy}
          onChange={event => { void previewFile(event.target.files?.[0]) }} /></label></div>
      <p>选择文件后可预览新增、修改和移除的项目。确认后才会写入。支持 V1 格式，来源版本为 {SUPPORTED_BACKUP_LINES.map(line => line+'.x').join('、')}。</p>
      {preview && <div className="lumaPluginSettingsPreview" aria-label="备份恢复预览">
        <h3>将恢复 {preview.namespaces.length} 类设置</h3><p>{selectedFileName} · 备份版本 {preview.pluginVersion} · {preview.createdAt}</p>
        <ul>{preview.namespaces.map(item => <li key={item.name}><strong>{item.label}</strong>
          <p>本机：{item.beforeSummary}<br />恢复后：{item.afterSummary}</p>
          <span>新增 {item.added.length} 项 · 修改 {item.changed.length} 项 · 移除 {item.removed.length} 项</span>
          <details><summary>查看字段范围</summary><p>{[...item.added, ...item.changed, ...item.removed].join('、') || '与本机一致'}</p></details>
        </li>)}</ul>
        <p>每类设置分别提交；若中途发生冲突，会立即停止并显示已经应用的范围。跨类恢复不保证一次全部成功。</p>
        {!preview.writable && <p role="status">当前 DSH 设置为只读，无法恢复。</p>}
        <div className="lumaPluginSettingsActions"><button type="button" disabled={busy || !state.writable || !preview.writable} onClick={() => { void restore() }}>按以上范围恢复</button>
          <button type="button" disabled={busy} onClick={() => setPreview(undefined)}>取消预览</button></div>
      </div>}
      {restored && <div className="lumaPluginSettingsResult" role="status"><p>{restored.message}</p>
        <p>已经应用：{restored.applied.join('、') || '无'}。原本一致：{restored.unchanged.join('、') || '无'}。</p>
        {restored.stoppedAt && <p>停止于：{restored.stoppedAt}</p>}{restored.uncertain && <p>此项结果需重新读取核对：{restored.uncertain}</p>}
      </div>}
      {(busy || message) && <p role="status">{busy ? '正在处理，请稍候…' : message}</p>}
    </section>}
    {page === 'about' && <>{updates}
    <section aria-labelledby="luma-help-heading"><h2 id="luma-help-heading">使用与更新</h2>
      <ul><li>角色在「联系」里使用 DSH 会话或自身绑定的模型。可在「角色与模型」为每位伙伴选择服务。</li>
        <li>工作室按角色分工，窗口选择、进度和交付文件都在「角色工作区」。</li>
        <li>收藏与购包使用插件内的本地星币。</li>
        <li>更新前可在「备份与恢复」导出插件设置。完整迁移还需保留 DSH 档案和爱之屋数据。</li></ul>
    </section></>}
    </div>
  </section>
}
