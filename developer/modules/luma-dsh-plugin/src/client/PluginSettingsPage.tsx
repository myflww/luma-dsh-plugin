import { type ReactNode, useRef, useState, useSyncExternalStore } from 'react'
import { MAX_PLUGIN_BACKUP_BYTES, PLUGIN_COMPATIBILITY_LINE, PLUGIN_VERSION,
  type PluginBackupPreview, type PluginPreferencesRuntime, type PluginRestoreResult } from './plugin-backup-runtime.ts'
import './PluginSettingsPage.css'
import { CloudOfficeConnection } from './CloudOfficePanel.tsx'
import { CompanionSettingsPanel } from './CompanionPresence.tsx'
import { LoveHouseQuickConnect } from './LoveHouseQuickConnect.tsx'

export interface PluginSettingsPageProps {
  readonly updates?: ReactNode
  readonly runtime: PluginPreferencesRuntime
  readonly onOpenNativeSettings?: () => void
}
export function PluginSettingsPage({ runtime, onOpenNativeSettings, updates }: PluginSettingsPageProps) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const [busy, setBusy] = useState(false)
  const [cloudOpen, setCloudOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<PluginBackupPreview>()
  const [selectedFileName, setSelectedFileName] = useState('')
  const [restored, setRestored] = useState<PluginRestoreResult>()
  const file = useRef<HTMLInputElement>(null)
  async function exportData() {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const document = await runtime.exportBackup()
      const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json' }))
      const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = `luma-plugin-backup-${document.createdAt.slice(0, 10)}.json`
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(`已导出 ${Object.keys(document.namespaces).length} 类插件设置。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败，请检查 DSH 连接。') }
    finally { setBusy(false) }
  }
  async function previewFile(selected: File | undefined) {
    setPreview(undefined); setRestored(undefined); setMessage('')
    if (!selected) return
    setSelectedFileName(selected.name)
    if (selected.size > MAX_PLUGIN_BACKUP_BYTES) { setMessage('请选择不超过 8 MB 的备份文件。'); return }
    setBusy(true)
    try { setPreview(await runtime.previewBackup(await selected.text())) }
    catch (error) { setMessage(error instanceof Error ? error.message : '备份无法读取。') }
    finally { setBusy(false); if (file.current) file.current.value = '' }
  }
  async function restore() {
    if (!preview || busy || !preview.writable) return
    setBusy(true); setMessage('')
    try { setRestored(await runtime.restoreBackup(preview.token)); setPreview(undefined) }
    catch (error) { setMessage(error instanceof Error ? error.message : '恢复失败，未继续处理后续项目。') }
    finally { setBusy(false) }
  }
  return <section className="lumaPluginSettings" aria-label="插件设置">
    <header><h1>插件设置</h1><p>Luma {PLUGIN_VERSION} · DSH 插件</p></header>
    <section aria-labelledby="luma-motion-heading"><h2 id="luma-motion-heading">动态偏好</h2>
      <label>办公室动态<select aria-label="办公室动态" value={state.preferences.reducedMotion} disabled={!state.writable || state.pending || busy}
        onChange={event => { void runtime.setReducedMotion(event.target.value as 'system' | 'reduce') }}>
        <option value="system">跟随系统</option><option value="reduce">减少动态</option>
      </select></label><p>减少办公室动作播放。系统已要求减少动态时始终遵从；卡牌观看器也可单独切换静态或减少动态。</p>
      {state.problem && <p role="status">{state.problem}</p>}
      {!state.writable && <p role="status">当前 DSH 设置暂不可写。已保存的数据仍可浏览和导出。</p>}
    </section>
    <CompanionSettingsPanel />
    <LoveHouseQuickConnect />
    <section aria-labelledby="luma-cloud-heading"><h2 id="luma-cloud-heading">云办公服务器</h2>
      <p>让员工在你的云电脑上整理文档、制作任务表或调用云端模型写作。</p>
      <button type="button" aria-expanded={cloudOpen} onClick={()=>setCloudOpen(!cloudOpen)}>{cloudOpen ? '收起服务器设置' : '配置云办公服务器'}</button>
      {cloudOpen && <CloudOfficeConnection writable={state.writable}/>}
    </section>
    <section aria-labelledby="luma-backup-heading"><h2 id="luma-backup-heading">插件数据备份</h2>
      <p>可导出办公室与衣装、角色设定、卡牌收藏、星币和购包记录。完整迁移时，请另外备份正在使用的 DSH 档案和爱之屋数据，其中有会话、任务和角色记忆。自定义服务密钥受当前 Windows 账户保护，换机时需重新填写。</p>
      <div className="lumaPluginSettingsActions"><button type="button" disabled={busy} onClick={() => { void exportData() }}>导出插件数据</button>
        <label className="lumaPluginSettingsFile">选择备份文件<input ref={file} type="file" accept=".json,application/json" aria-label="选择备份文件" disabled={busy}
          onChange={event => { void previewFile(event.target.files?.[0]) }} /></label></div>
      <p>选择文件后会先验证并预览范围。恢复会替换备份内各类设置，缺少的该类项目会被清除；本机草稿、Host 角色目录及原有自动任务指令会保留。</p>
      {preview && <div className="lumaPluginSettingsPreview" aria-label="备份恢复预览">
        <h3>将恢复 {preview.namespaces.length} 类设置</h3><p>{selectedFileName} · 备份版本 {preview.pluginVersion} · {preview.createdAt}</p>
        <ul>{preview.namespaces.map(item => <li key={item.name}><strong>{item.label}</strong>
          <p>本机：{item.beforeSummary}<br />恢复后：{item.afterSummary}</p>
          <span>新增 {item.added.length} 项 · 修改 {item.changed.length} 项 · 移除 {item.removed.length} 项</span>
          <details><summary>查看字段范围</summary><p>{[...item.added, ...item.changed, ...item.removed].join('、') || '与本机一致'}</p></details>
        </li>)}</ul>
        <p>每类设置分别提交；若中途发生冲突，会立即停止并显示已经应用的范围。跨类恢复不保证一次全部成功。</p>
        {!preview.writable && <p role="status">当前 DSH 设置为只读，无法恢复。</p>}
        <div className="lumaPluginSettingsActions"><button type="button" disabled={busy || !preview.writable} onClick={() => { void restore() }}>按以上范围恢复</button>
          <button type="button" disabled={busy} onClick={() => setPreview(undefined)}>取消预览</button></div>
      </div>}
      {restored && <div className="lumaPluginSettingsResult" role="status"><p>{restored.message}</p>
        <p>已经应用：{restored.applied.join('、') || '无'}。原本一致：{restored.unchanged.join('、') || '无'}。</p>
        {restored.stoppedAt && <p>停止于：{restored.stoppedAt}</p>}{restored.uncertain && <p>此项结果需重新读取核对：{restored.uncertain}</p>}
      </div>}
      {(busy || message) && <p role="status">{busy ? '正在处理，请稍候…' : message}</p>}
    </section>
    {updates}
    <section aria-labelledby="luma-help-heading"><h2 id="luma-help-heading">使用与更新</h2>
      <ul><li>办公室跟随真实当前时间与日历；角色任务状态来自 DSH 会话。</li>
        <li>角色消息可流式对话。模型、连接与执行权限由 DSH 管理。</li>
        <li>本地星币可用于购买插件内的卡包，不涉及真实付款。</li>
        <li>更新前先导出备份。当前接收 {PLUGIN_COMPATIBILITY_LINE}.x 插件的 V1 备份；不兼容数据会保留原样，更新到兼容版本后再恢复。</li>
        <li>卸载插件会保留 DSH 用户设置和已安装的角色预设。重新安装兼容版本后可继续读取；卸载不会删除聊天记录。</li></ul>
      {onOpenNativeSettings && <><button type="button" onClick={onOpenNativeSettings}>前往 DSH 设置入口</button><p>进入原生页面后，点击侧栏的“设置”配置模型与连接。</p></>}
    </section>
  </section>
}
